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

import com.aws.sif.DataTypeRecord;
import com.aws.sif.S3Location;
import com.aws.sif.S3Utils;
import com.aws.sif.execution.StringTypeValue;
import com.typesafe.config.Config;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.Validate;

import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

@Slf4j
public class DataTypeOutputWriter implements OutputWriter<DataTypeRecord> {
    private final S3Utils s3;
    private final Config config;
    private BufferedWriter activityValueWriter;
    private Path activityValuePath;
    // context
    private String pipelineId;
    private String executionId;
    private int chunkNo;
    private Map<String, String> outputMap;

    public DataTypeOutputWriter(Config config, S3Utils s3) {
        this.s3 = s3;
        this.config = config;
    }

    public void init(String pipelineId, String executionId, int chunkNo, Map<String, String> outputMap) throws IOException {
        this.pipelineId = pipelineId;
        this.executionId = executionId;
        this.chunkNo = chunkNo;
        this.outputMap = outputMap;
        this.initLocalFiles(chunkNo, outputMap);
    }

    private void initLocalFiles(int chunkNo, Map<String, String> outputMap) throws IOException {
        if (this.activityValueWriter != null) {
            this.activityValueWriter.close();
        }

        this.activityValuePath = Files.createTempFile(String.format("%s-%s_", chunkNo, config.getString("calculator.upload.s3.activityValues.name")), ".csv");
        this.activityValueWriter = Files.newBufferedWriter(this.activityValuePath);
        // only set header for the first chunk
        if (chunkNo == 0) {
            this.activityValueWriter.append(String.join(",", outputMap.keySet().toArray(String[]::new))).append("\n");
        }
    }

    public CompletableFuture<Void> addRecord(DataTypeRecord record) throws IOException {

        log.debug("addRecord> in> record: {}", record);

        Validate.notNull(record.getValues(), "Values cannot be null.");

        var sortedValues = new ArrayList<String>();
        for (Map.Entry<String, String> entry : this.outputMap.entrySet()) {
            var value = record.getValues().get(entry.getKey()).getValue();
            var outputValue = value.toString();
            // append start and end double quote to handle string value that contains comma
            if (record.getValues().get(entry.getKey()) instanceof StringTypeValue) {
                outputValue = String.format("\"%s\"", value);
            }
            sortedValues.add(outputValue);
        }
        this.activityValueWriter.append(String.join(",", sortedValues)).append("\n");
        return null;
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

        Map<String, String> metadata = Map.of("pipelineId", this.pipelineId, "executionId", this.executionId);

        if (this.activityValueWriter != null) {
            this.activityValueWriter.flush();
            this.activityValueWriter.close();
        }

        uploads.add(0, this.activityValuePath);

        CompletableFuture<?>[] futures = uploads.stream().map(filePath -> s3.uploadAsync(new S3Location(bucket, config.getString("calculator.upload.s3.activities.key").replace("<pipelineId>", this.pipelineId).replace("<executionId>", this.executionId) + chunkNo + ".csv"), filePath, metadata)).toArray(CompletableFuture[]::new);

        // Wait for all futures to complete
        CompletableFuture.allOf(futures).join();
    }
}
