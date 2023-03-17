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

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import lombok.extern.slf4j.Slf4j;
import org.junit.jupiter.api.Test;

import java.io.*;

@Slf4j
public class LocalInvokeIndexer {

    private IndexRequest.IndexRequestBuilder prepareRequest() {
        return IndexRequest.builder()
                .id("01gkmvmny0m6gd4vbjc2mp7xa8")
                .groups(new String[]{"a/b/c"})
                .datasetHeaders(new String[]{"Index", "Organization Id", "Name", "Website", "Country", "Description", "Founded", "Industry", "No of Employees"})
                .version(2);
    }

    @Test
    public void index_s3() throws IOException {

        var request = prepareRequest().build();

//        var bucket = System.getProperty("BUCKET_NAME");
//        var inputKeyPrefix = System.getProperty("FILE_LOCATION");
        var bucket = "sif-amz-development-896502536262-us-west-2";
        var inputKeyPrefix = "referenceDatasets/01gkmvmny0m6gd4vbjc2mp7xa8/2/|||/data.csv";

        var sourceLocation = new S3SourceLocation();
        sourceLocation.setBucket(bucket);
        sourceLocation.setKey(inputKeyPrefix);
        request.setS3Location(sourceLocation);

        var indexS3Location = new S3Location();
        sourceLocation.setBucket(bucket);
        sourceLocation.setKey("referenceDatasets/01gkmvmny0m6gd4vbjc2mp7xa8/ImfGXETymI/");

        request.setIndexS3Location(indexS3Location);
        log.debug("calculation_s3> request: {}", request);

        var gson = new GsonBuilder().create();
        var handler = new HandlerStream();
        var inputStream = new ByteArrayInputStream(gson.toJson(request).getBytes());
        var outputStream = new ByteArrayOutputStream();
        handler.handleRequest(inputStream, outputStream, null);

        var actual = gson.fromJson(new String(outputStream.toByteArray()), IndexResponse.class);
        log.debug("calculation_s3> actual: {}", actual);
    }

}
