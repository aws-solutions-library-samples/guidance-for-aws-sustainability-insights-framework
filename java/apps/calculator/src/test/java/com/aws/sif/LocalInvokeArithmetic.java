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
 * Note: intentionally not named LocalInvokeTest so that automated unit tests
 * will not run these, as these are integration tests to be help during development.
 */
@Slf4j
public class LocalInvokeArithmetic {

    private TransformRequest.TransformRequestBuilder prepareRequest() {
        return TransformRequest.builder()
                .pipelineId(String.format("test-%s",System.currentTimeMillis()))
                .executionId(String.valueOf(System.currentTimeMillis()))
                .groupContextId("/")
                .parameters(List.of(
                        TransformParameter.builder().key("meter reading date").type("string").build(),
                        TransformParameter.builder().key("equipment type").type("string").build(),
                        TransformParameter.builder().key("equipment id").type("string").build(),
                        TransformParameter.builder().key("fuel").type("string").build(),
                        TransformParameter.builder().key("co2").type("number").build()
                ))
                .transforms(List.of(
                        Transform.builder().index(0).formula("AS_TIMESTAMP(:meter reading date,'M/d/yy')").outputs(
                                List.of(TransformOutput.builder().index(0).key("time").type("timestamp").includeAsUnique(false).build())
                        ).build(),
                        Transform.builder().index(1).formula(":equipment type").outputs(
                                List.of(TransformOutput.builder().index(0).key("equipmentType").type("string").includeAsUnique(false).build())
                        ).build(),
                        Transform.builder().index(2).formula(":equipment id").outputs(
                                List.of(TransformOutput.builder().index(0).key("equipmentId").type("string").includeAsUnique(false).build())
                        ).build(),
                        Transform.builder().index(3).formula(":fuel").outputs(
                                List.of(TransformOutput.builder().index(0).key("fuel").type("string").includeAsUnique(false).build())
                        ).build(),
                        Transform.builder().index(4).formula(":co2").outputs(
                                List.of(TransformOutput.builder().index(0).key("co2").type("number").includeAsUnique(false).build())
                        ).build())
				);
    }

//    @Test
//    public void arithmetic_inline() {
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
    public void arithmetic_s3() throws IOException {

        // prepare s3 mode request
        var request = prepareRequest()
//                .dryRun(true)
                .build();

        var bucket = System.getProperty("BUCKET_NAME");
        var inputKeyPrefix = "pipelines/input_1k.csv";

        var sourceLocation = new S3SourceLocation();
        sourceLocation.setBucket(bucket);
        sourceLocation.setKey(inputKeyPrefix);
//        sourceLocation.setStartByte(0L);
//        sourceLocation.setEndByte(10000L);
        request.setSourceDataLocation(sourceLocation);
        log.debug("arithmetic_s3> request: {}", request);

        // execute
        var gson = new GsonBuilder().create();
        var handler = new HandlerStream();
        var inputStream = new ByteArrayInputStream(gson.toJson(request).getBytes());
        var outputStream = new ByteArrayOutputStream();
        handler.handleRequest(inputStream, outputStream, null);

        var asJson = new String(outputStream.toByteArray());
        log.debug("arithmetic_s3> actual: {}", asJson);

        // s3 locations should all be populated
        var actual = gson.fromJson(asJson, S3TransformResponse.class);
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
