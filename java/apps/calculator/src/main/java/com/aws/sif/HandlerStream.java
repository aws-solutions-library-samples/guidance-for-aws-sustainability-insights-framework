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

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestStreamHandler;
import com.aws.sif.di.CalculatorComponent;
import com.aws.sif.di.DaggerCalculatorComponent;
import com.google.gson.GsonBuilder;
import com.typesafe.config.Config;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;

import javax.inject.Inject;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@Slf4j
public class HandlerStream implements RequestStreamHandler {

    // DI static so that caches can live beyond handler execution.
    private static final CalculatorComponent component;

    static {
        component = DaggerCalculatorComponent.builder().build();
    }

    @Inject
    @Setter
    public ActivityTypeCalculatorService activityTypeCalculatorService;

    @Inject
    @Setter
    public DataTypeCalculatorService dataTypeCalculatorService;

    @Inject
    @Setter
    public Config config;

    public HandlerStream() {
        // As AWS Lambda manages the creation of this handler class and not Dagger, this technique registers
        // this object with Dagger which then allows it to inject its dependencies by Dagger.
        component.inject(this);
        log.debug("config: {}", config.root().render());
    }

    @Override
    public void handleRequest(InputStream inputStream, OutputStream outputStream, Context context) throws IOException {
        log.debug("handleRequest> in>");

        var gson = new GsonBuilder().create();

        try (var reader = new InputStreamReader(inputStream, StandardCharsets.US_ASCII)) {
            var request = gson.fromJson(reader, TransformRequest.class);

            log.debug("handleRequest> in> request:{}", request);

            TransformResponse result;

            switch (request.getPipelineType()) {
                case activities -> {
                    result = activityTypeCalculatorService.process(request);
                }
                case data, impacts, referenceDatasets -> {
                    result = dataTypeCalculatorService.process(request);
                }
                default -> throw new IllegalStateException("Unexpected value: " + request.getPipelineType());
            }

            log.trace("handleRequest> in> result:{}", result);

            outputStream.write(gson.toJson(result).getBytes(StandardCharsets.US_ASCII));

        } catch (IOException e) {
            log.error("handleRequest> " + e.getMessage(), e);
            throw e;
        } catch (InterruptedException e) {
            log.error("handleRequest> " + e.getMessage(), e);
            throw new RuntimeException(e);
        }

    }
}
