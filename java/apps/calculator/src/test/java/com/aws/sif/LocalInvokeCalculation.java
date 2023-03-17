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

package com.aws.sif;

import com.google.gson.GsonBuilder;
import lombok.extern.slf4j.Slf4j;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * Note: intentionally not named LocalInvokeCalculationTest so that automated unit tests
 * will not run these, as these are integration tests to be help during development.
 */
@Slf4j
public class LocalInvokeCalculation {

    private TransformRequest.TransformRequestBuilder prepareRequest() {
        return TransformRequest.builder()
                .pipelineId(String.format("pipe-%s",System.currentTimeMillis()))
                .executionId(String.format("exe-%s", String.valueOf(System.currentTimeMillis())))
                .groupContextId("/")
                .username("pipeline_processor_admin@amazon.com")
                .parameters(List.of(
                        TransformParameter.builder().key("date").type("string").build(),
                        TransformParameter.builder().key("zipcode").type("string").build(),
                        TransformParameter.builder().key("kwh").type("number").build()
                ))
                .transforms(List.of(
                        Transform.builder().index(0).formula("AS_TIMESTAMP(:date, 'M/d/yyyy')").outputs(
                                List.of(TransformOutput.builder().index(0).key("timestamp").type("timestamp").build())
                        ).build(),
                        Transform.builder().index(1).formula(":zipcode").outputs(
                                List.of(TransformOutput.builder().index(0).key("zipcode").type("string").build())
                        ).build(),
                        Transform.builder().index(2).formula(":kwh").outputs(
                                List.of(TransformOutput.builder().index(0).key("kwh").type("number").build())
                        ).build(),
                        Transform.builder().index(3).formula(":kwh*0.25").outputs(
                                List.of(TransformOutput.builder().index(0).key("co2e").type("number").build())
                        ).build(),
                        Transform.builder().index(4).formula("IF(:zipcode=='80238',true,false)").outputs(
                                List.of(TransformOutput.builder().index(0).key("colorado").type("boolean").build())
                        ).build()
//                        Transform.builder().index(5).formula(":date").outputs(
//                                List.of(TransformOutput.builder().index(0).key("date").type("timestamp").build())
//                        ).build()
                ))
                .csvHeader("\"date\",\"zipcode\",\"kwh\"")
                .chunkNo(0);
    }

//    private TransformRequest.TransformRequestBuilder prepareRequest() {
//        return TransformRequest.builder()
//                .pipelineId(String.format("test-%s",System.currentTimeMillis()))
//                .executionId(String.valueOf(System.currentTimeMillis()))
//                .groupContextId("/")
//                .parameters(List.of(
//                        TransformParameter.builder().key("left").type("number").build(),
//                        TransformParameter.builder().key("right").type("number").build()
//                ))
//                .transforms(List.of(
//                        Transform.builder().index(0).formula("#custom_add(:left,:right)").outputs(
//                                List.of(TransformOutput.builder().index(0).key("sum").type("number").build())
//                        ).build()))
//                .csvHeader("\"left\",\"right\"");
//    }

    // Only for testing referencedatasets index search invocations
    // this requires referencedataset to be pre-created.
//    private TransformRequest.TransformRequestBuilder prepareLookupRequest() {
//        return TransformRequest.builder()
//                .pipelineId(String.format("test-%s",System.currentTimeMillis()))
//                .executionId(String.valueOf(System.currentTimeMillis()))
//                .groupContextId("/")
//                .parameters(List.of(
//                        TransformParameter.builder().key("Timestamp").type("string").build(),
//                        TransformParameter.builder().key("Index").type("number").build()
//                ))
//                .transforms(List.of(
//                        Transform.builder().index(0).formula("AS_TIMESTAMP(:Timestamp,'M/d/yy')").outputs(
//                                List.of(TransformOutput.builder().index(0).key("time").type("timestamp").build())
//                        ).build(),
//                        Transform.builder().index(0).formula("LOOKUP(:Index,'randomDataset1','Index','Industry')").outputs(
//                                List.of(TransformOutput.builder().index(0).key("industry").type("string").build())
//                        ).build()))
//                .csvHeader("\"Timestamp\",\"Country\",\"Index\"");
//    }

//    @Test
//    public void calculation_inline() {
//        var request = prepareRequest()
//                .csvSourceData(List.of(
//                        "1,2",
//                        "3,4"
//                )).build();
//        log.debug("arithmetic_inline> request: {}", request);
//
//        var actual = (InlineTransformResponse) (new Handler()).handleRequest(request, null);
//        log.debug("arithmetic_inline> actual: {}", actual);
//
//        assertNull(actual.getErrorMessages());
//        assertEquals("3\n7\n", actual.getCsv());
//    }

    @Test
    public void calculation_s3() throws IOException {
        // prepare s3 mode request
        var request = prepareRequest().build();
        var bucket = System.getProperty("BUCKET_NAME");
        var inputKeyPrefix = "test/pipelines/pipeline001/electricity_input_small.csv";
        log.debug("calculation_s3> bukcet: ", bucket,inputKeyPrefix);
        var sourceLocation = new S3SourceLocation();
        sourceLocation.setBucket(bucket);
        sourceLocation.setKey(inputKeyPrefix);
        sourceLocation.setStartByte(0L);
        sourceLocation.setEndByte(10000L);
        request.setCsvSourceDataLocation(sourceLocation);
        log.debug("calculation_s3> request: {}", request);

        // execute
        var gson = new GsonBuilder().create();
        var handler = new HandlerStream();
        var inputStream = new ByteArrayInputStream(gson.toJson(request).getBytes());
        var outputStream = new ByteArrayOutputStream();
        handler.handleRequest(inputStream, outputStream, null);


        var actual = gson.fromJson(new String(outputStream.toByteArray()), S3TransformResponse.class);
        log.debug("calculation_s3> actual: {}", actual);

        // s3 locations should all be populated
        assertNull(actual.getErrorLocation());

        // download and validate output
//        var getOb = GetObjectRequest.builder()
//                .bucket(bucket)
//                .key(outputKeyPrefix)
//                .build();
//        var responseInputStream = s3.getObject(getOb);
//        var stream = new ByteArrayInputStream(responseInputStream.readAllBytes());
//        var outputAsString = new String(stream.readAllBytes(), StandardCharsets.UTF_8);

//        assertEquals("3\n7\n", outputAsString);
    }
}
