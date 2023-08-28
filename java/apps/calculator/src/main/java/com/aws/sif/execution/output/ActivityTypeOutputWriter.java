/*
 *  Copyright Amazon.com Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */
package com.aws.sif.execution.output;

import com.aws.sif.ActivityTypeRecord;
import com.aws.sif.S3Location;
import com.aws.sif.S3Utils;
import com.aws.sif.execution.*;
import com.typesafe.config.Config;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.Validate;

import java.io.BufferedWriter;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.CompletableFuture;

@Slf4j
public class ActivityTypeOutputWriter implements OutputWriter<ActivityTypeRecord> {
    private final S3Utils s3;
    private final Config config;
    private BufferedWriter activityValueWriter;
    private Path activityValuePath;
    // context
    private String pipelineId;
    private String executionId;
    private int chunkNo;
    private Map<String, String> outputMap;
    private final ActivitySqsWriter sqsWriter;
    protected int precision;


    public ActivityTypeOutputWriter(Config config, S3Utils s3, ActivitySqsWriter sqsWriter) {
        this.s3 = s3;
        this.config = config;
        this.sqsWriter = sqsWriter;
    }

    public void init(String pipelineId, String executionId, int chunkNo,
            Map<String, String> outputMap) throws IOException {
        this.pipelineId = pipelineId;
        this.executionId = executionId;
        this.chunkNo = chunkNo;
        this.outputMap = outputMap;
        this.initLocalFiles(chunkNo);
        this.precision = config.getInt("calculator.decimal.precision");
    }

    private void initLocalFiles(int chunkNo) throws IOException {

        if (this.activityValueWriter != null) {
            this.activityValueWriter.close();
        }

        this.activityValuePath = Files.createTempFile(String.format("%s-%s_", chunkNo, config.getString("calculator.upload.s3.activityValues.name")), ".csv");
        this.activityValueWriter = Files.newBufferedWriter(this.activityValuePath);
        this.activityValueWriter.append("activityId,groupId,pipelineId,executionId,date,key1,key2,key3,key4,key5,isDeletion,name,createdAt,val,error,errorMessage,auditId,dataType\n");

    }

    public CompletableFuture<Void> addRecord(ActivityTypeRecord record) throws IOException {

        log.debug("addRecord> in> record:{}", record);

        Validate.notNull(record.getTime(), "Time cannot be null.");
        Validate.notNull(record.getGroupId(), "Group ID cannot be null.");
        Validate.notNull(record.getUniqueIdColumns(), "Unique id columns cannot be null.");
        Validate.notNull(record.getValues(), "Values cannot be null.");
        Validate.notNull(record.getAuditId(), "Audit Id cannot be null.");
        Validate.notNull(record.getIsDeletion(), "Is Deletion cannot be null.");

        Map<String, String> activityValueMap = this.buildActivityRecord(record.getTime(), record.getGroupId(), record.getUniqueIdColumns(), record.getValues(), record.getAuditId(), record.getIsDeletion());

        this.activityValueWriter.append(activityValueMap.get("activityValues"));

        return null;
    }

    private Map<String, String> buildActivityRecord(NumberTypeValue time, String groupId,
            Map<String, DynamicTypeValue> uniqueIdColumns, Map<String, DynamicTypeValue> values, final StringTypeValue auditId, final Boolean isDeletion) {
        log.debug("buildActivityRecord> in> time:{}, groupId:{}, uniqueIdColumns: {}, values:{}, outputMap:{}, auditId:{}, isDeletion:{}", time, groupId,
                uniqueIdColumns, values, outputMap, auditId, isDeletion);

        Map<String, String> activityValueMap = new HashMap<>();
        final String[] keyValues = new String[]{"___NULL___", "___NULL___", "___NULL___", "___NULL___", "___NULL___"};
        uniqueIdColumns.entrySet().stream().forEach(e -> {
            switch (e.getValue().getKeyMapIndex()) {
                case "key1":
                    keyValues[0] = e.getValue().asString();
                    break;
                case "key2":
                    keyValues[1] = e.getValue().asString();
                    break;
                case "key3":
                    keyValues[2] = e.getValue().asString();
                    break;
                case "key4":
                    keyValues[3] = e.getValue().asString();
                    break;
                case "key5":
                    keyValues[4] = e.getValue().asString();
                    break;
            }
        });

        var activityId = UUID.randomUUID().toString();
        var date = time.getValue().divide(new BigDecimal(1000), RoundingMode.HALF_UP).intValue();
        String activity = String.format("""
                        "%s","%s","%s","%s","%s","%s","%s","%s","%s","%s","%s"
                        """,
                activityId, groupId, this.pipelineId, this.executionId, date, keyValues[0], keyValues[1], keyValues[2], keyValues[3], keyValues[4], String.valueOf(isDeletion));
        StringBuffer activityValues = new StringBuffer();

        var activityString = activity.toString();
        // Append the insert statement for the values to the string
        var valuesQuery = buildActivityValueRecord(activityId, uniqueIdColumns, values, auditId, activity);
        activityValues.append(valuesQuery);


        var valuesString = activityValues.toString();
        activityValueMap.put("activities", activityString);
        activityValueMap.put("activityValues", valuesString);

        log.debug("buildActivityRecord> exit activities:{}, values:{}", activityString, valuesString);
        return activityValueMap;
    }


    /*
     * Creates the Strings needed to insert the values into a csv file
     */
    private String buildActivityValueRecord(String activityInsertId,
            Map<String, DynamicTypeValue> uniqueIdColumns, Map<String, DynamicTypeValue> values, final StringTypeValue auditId, String activityString) {
        log.debug("buildActivityValueRecord> in> uniqueIdColumns:{}, values:{}, outputMap:{}, auditId: {}, activityString:{}",
                uniqueIdColumns, values, outputMap, auditId, activityString);
        int numberOfValues = outputMap.size();
        int count = 0;
        ArrayList<String> uniqueIds = new ArrayList<>();
        uniqueIds.add(activityInsertId);

        var stringValueFragments = new ArrayList<String>();
        var numberValueFragments = new ArrayList<String>();
        var datetimeValueFragments = new ArrayList<String>();
        var booleanValueFragments = new ArrayList<String>();

        // All values for a given activity write should have the same createdAt time
        Double createdAt = (double) Instant.now().toEpochMilli() / 1000;

        var activityValues = new StringBuffer();

        for (String key : outputMap.keySet()) {
            count++;

            DynamicTypeValue value = values.getOrDefault(key, new NullValue());

            String type = outputMap.get(key);
            String valueString = null;
            List<String> typeFragments;
            String dataType = "String";

            switch (type.trim()) {
                case "number":
                    typeFragments = numberValueFragments;
                    valueString = (value instanceof NullValue || value instanceof ErrorValue) ? ""
                            : String.format("%.8f", ((NumberTypeValue) value).Scale(this.precision));
                    dataType = "Number";
                    break;
                case "boolean":
                    typeFragments = booleanValueFragments;
                    valueString = (value instanceof NullValue || value instanceof ErrorValue) ? ""
                            : value.asString();
                    dataType = "Boolean";
                    break;
                case "timestamp":
                    typeFragments = datetimeValueFragments;
                    valueString = (value instanceof NullValue || value instanceof ErrorValue) ? ""
                            : String.format("%d",
                            ((NumberTypeValue) value).getValue().divide(new BigDecimal(1000), RoundingMode.HALF_UP).intValue());
                    dataType = "DateTime";
                    break;
                default:
                    typeFragments = stringValueFragments;
                    valueString = (value instanceof NullValue) ? ""
                            : String.format("%s", value.asString());
            }

            boolean error = false;
            String errorMessageStr = "";
            if (value instanceof ErrorValue) {
                error = true;
                errorMessageStr = (value instanceof NullValue) ? ""
                        : String.format("'%s'",
                        ((ErrorValue) value).getErrorMessage());
            }
            activityValues.append(String.format("""
                    %s,"%s","%.3f",%s,%s,%s,%s,%s
                    """, activityString.trim(), key, createdAt, valueString, error, errorMessageStr, auditId.getValue(), dataType));

        }

        var result = activityValues.toString();

        log.debug("buildActivityValueRecord> exit> {}", result);
        return result;
    }


    /**
     * Uploads the local csv files to s3, ready for db insertion
     *
     * @throws IOException
     */
    public void submit() throws IOException {
        log.debug("submit> in> activityValuePath:{}", activityValuePath);

        var bucket = config.getString("calculator.upload.s3.bucket");

        List<Path> uploads = new ArrayList<Path>();

        Map<String, String> metadata = Map.of(
                "pipelineId", this.pipelineId,
                "executionId", this.executionId
        );


        if (this.activityValueWriter != null) {
            this.activityValueWriter.flush();
            this.activityValueWriter.close();
        }

        uploads.add(0, this.activityValuePath);


        var activityValueKey = config.getString("calculator.upload.s3.activities.key")
                .replace("<pipelineId>", this.pipelineId)
                .replace("<executionId>", this.executionId)
                + this.activityValuePath.getFileName().toString();


        CompletableFuture<?>[] futures = uploads.stream()
                .map(filePath -> s3.uploadAsync(
                        new S3Location(bucket, config.getString("calculator.upload.s3.activities.key")
                                .replace("<pipelineId>", this.pipelineId)
                                .replace("<executionId>", this.executionId)
                                + filePath.getFileName().toString())
                        , filePath, metadata))
                .toArray(CompletableFuture[]::new);

        // Wait for all futures to complete
        CompletableFuture.allOf(futures).join();


        // Send a message to SQS
        String payload = String.format("""
                {"pipelineId":"%s","executionId":"%s","sequence":"%s", "activityValuesKey": "%s"}
                	""", this.pipelineId, this.executionId, this.chunkNo, activityValueKey);
        var deDuplicationId = UUID.randomUUID().toString();
        this.sqsWriter.submitWithRetry(payload, this.executionId, deDuplicationId);
    }

    @Data
    @AllArgsConstructor
    protected static class ActivityValueFragmentState {
        Stack<String> cteIds;
        int totalValues;
        int processedValues;
    }

}
