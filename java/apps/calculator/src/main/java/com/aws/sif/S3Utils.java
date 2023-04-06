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

import lombok.extern.slf4j.Slf4j;
import org.jetbrains.annotations.NotNull;
import software.amazon.awssdk.core.async.AsyncRequestBody;
import software.amazon.awssdk.core.async.SdkPublisher;
import software.amazon.awssdk.services.s3.S3AsyncClient;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.services.s3.model.selectobjectcontenteventstream.DefaultRecords;

import javax.inject.Inject;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;

@Slf4j
public class S3Utils {

    private final S3AsyncClient s3;

    @Inject
    public S3Utils(S3AsyncClient s3) {
        this.s3 = s3;
    }


    public String download(@NotNull S3SourceLocation req) {
        log.debug("download> in> req:{}", req);

        var data = new StringBuilder();

        try {
            var handler = new SelectObjectHandler();

            var query = queryS3(s3, req, handler);
            query.join();

            for (var events : handler.receivedEvents) {
                if (events instanceof DefaultRecords) {
                    var defaultRecords = (DefaultRecords) events;
                    var payload = defaultRecords.payload().asString(StandardCharsets.UTF_8);
                    data.append(payload);
                }
            }
        } catch (Exception e) {
            var message = String.format("\"Failed downloading %s, error: %s",  req, e.getMessage() );
            log.error("download> " + e.getMessage(), e);
            throw new RuntimeException(message, e);
        }

        log.debug("download> exit:");
        log.trace("download> data:{}", data);
        return data.toString();
    }

    public void upload(@NotNull S3Location req, String data) {
        log.debug("upload> in> req:{}", req);
        log.trace("upload> in> data:{}", data);

        try {
            var putObj = PutObjectRequest.builder()
                    .bucket(req.getBucket())
                    .key(req.getKey())
                    .build();

            var future = s3.putObject(putObj, AsyncRequestBody.fromString(data));
            future.join();

        } catch (Exception e) {
            var message = String.format("Failed uploading to bucket '%s' key '%s', error: %s",
                    req.getBucket(), req.getKey(), e.getMessage() );
            log.error("upload> " + message, e);
            throw new RuntimeException(message, e);
        }
    }

    private CompletableFuture<Void> queryS3(@NotNull S3AsyncClient s3,
                                                   S3SourceLocation req,
                                                   SelectObjectContentResponseHandler handler) {
        log.debug("queryS3> in> req:{}", req);

		var inputSerialization = InputSerialization.builder()
			.json(JSONInput.builder()
				.type(JSONType.LINES)
				.build())
			.compressionType(CompressionType.NONE)
			.build();

		var outputSerialization = OutputSerialization.builder().json(JSONOutput.builder().build()).build();

        var scanRange = (req.getStartByte()!=null && req.getEndByte()!=null && req.getEndByte()>0) ? ScanRange.builder()
                .start(req.getStartByte())
                .end(req.getEndByte())
                .build() : null;

        var select = SelectObjectContentRequest.builder()
                .bucket(req.getBucket())
                .key(req.getKey())
                .expression("SELECT * FROM s3object")
                .expressionType(ExpressionType.SQL)
                .inputSerialization(inputSerialization)
                .outputSerialization(outputSerialization)
                .scanRange(scanRange)
                .build();

        log.debug("queryS3> select:{}", select);
        return s3.selectObjectContent(select, handler);
    }



    private static class SelectObjectHandler implements SelectObjectContentResponseHandler {
        private final List<SelectObjectContentEventStream> receivedEvents = new ArrayList<>();

        @Override
        public void responseReceived(SelectObjectContentResponse response) {
        }

        @Override
        public void onEventStream(SdkPublisher<SelectObjectContentEventStream> publisher) {
            publisher.subscribe(receivedEvents::add);
        }

        @Override
        public void exceptionOccurred(Throwable throwable) { }

        @Override
        public void complete() { }
    }

}
