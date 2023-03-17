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

package com.aws.sif.lambdaInvoker;

import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyRequestEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyResponseEvent;
import com.aws.sif.Authorizer;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonDeserializer;
import lombok.extern.slf4j.Slf4j;
import org.joda.time.DateTime;
import software.amazon.awssdk.core.SdkBytes;
import software.amazon.awssdk.services.lambda.LambdaAsyncClient;
import software.amazon.awssdk.services.lambda.model.InvokeRequest;
import software.amazon.awssdk.services.lambda.model.LambdaException;

import javax.inject.Inject;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@Slf4j
public class LambdaInvoker<T> {

    private final LambdaAsyncClient lambdaClient;

    private final Map<String,String> jwsMap;

    @Inject
    public LambdaInvoker(LambdaAsyncClient awsLambda) {
        this.lambdaClient = awsLambda;
        this.jwsMap = new HashMap<>();
    }


    private Map<String, String> headers(String groupContextId, Optional<String> tenantId, Authorizer authorizer) {
        log.debug("headers> in> groupContextId:{}, tenantId:{}", groupContextId, tenantId);

        var jwsMapKey = String.format("%s-%s", groupContextId, tenantId.orElse(""));
        if (!jwsMap.containsKey(jwsMapKey)) {
            jwsMap.put(jwsMapKey, authorizer.buildJwt(groupContextId, tenantId));
        }
        var jws = jwsMap.get(jwsMapKey);

        var map = new HashMap<String, String>();
        map.put("Accept", "application/json");
        map.put("Content-Type", "application/json");
        map.put("Accept-Version", "1.0.0");
        map.put("x-groupcontextid", groupContextId);

        // if in local mode the cloud module apis read from an (unverified) auth token, so need to mock that too
        map.put("Authorization", String.format("Bearer %s", jws));

        tenantId.ifPresent(v->map.put("x-tenant", v));

        log.debug("headers> exit:{}", map);
        return map;
    }

    public LambdaResponse<T> invokeFunction(String functionName, String groupContextId, Authorizer authorizer, String httpMethod, String path, Optional<Map<String, String>> queryString, Optional<String> body, Optional<String> tenantId, Class<T> responseBodyClass) {
        log.debug("invokeFunction> in> functionName:{}, groupContextId:{}, authorizer:{}, httpMethod:{}, path:{}, queryString:{}, body:{}, tenantId:{} ",
                functionName, groupContextId, authorizer, httpMethod, path, queryString, body, tenantId);

        LambdaResponse<T> response;
        try {
            // Need a SdkBytes instance for the payload.
            var cognitoGroup = String.format("%s|||reader", groupContextId);
            var event = new APIGatewayProxyRequestEvent();
            event.setPath(path);
            event.setHttpMethod(httpMethod);
            event.setHeaders(headers(groupContextId,tenantId, authorizer));
            body.ifPresent(b->event.setBody(b));
            queryString.ifPresent(qs->event.setQueryStringParameters(qs));

            var requestContext = new APIGatewayProxyRequestEvent.ProxyRequestContext();
            requestContext.setAuthorizer(authorizer.buildRequestContextAuthorizer(groupContextId, tenantId));

            event.setRequestContext(requestContext);

            var gson = new GsonBuilder().registerTypeAdapter(DateTime.class, (JsonDeserializer<DateTime>) (json, type, jsonDeserializationContext) ->
                    DateTime.parse(json.getAsJsonPrimitive().getAsString())).create();

            var json = gson.toJson(event);

            var requestPayload = SdkBytes.fromUtf8String(json);

            // Setup an InvokeRequest.
            var request = InvokeRequest.builder()
                    .functionName(functionName)
                    .payload(requestPayload)
                    .build();
            log.trace("invokeFunction> request:{}", request);

            response = lambdaClient.invoke(request)
                    .thenApplyAsync(r-> {
                        log.trace("invokeFunction> response:{}", r);
                        if (r.statusCode() >= 200 && r.statusCode() < 300) {
                            var responsePayload = gson.fromJson(r.payload().asUtf8String(), APIGatewayProxyResponseEvent.class);
                            log.trace("invokeFunction> responsePayload:{}", responsePayload);
                            var responseBody = gson.fromJson(responsePayload.getBody(), responseBodyClass);
                            log.trace("invokeFunction> responseBody:{}", responseBody);

                            var result = new LambdaResponse<>(responsePayload.getStatusCode(), responseBody);
                            if (r.functionError() != null) {
                                throw new LambdaInvocationException(r.functionError(), responsePayload);
                            }
                            if (result.getStatusCode() >= 300) {
                                throw new LambdaInvocationException(r.functionError(), result.getStatusCode(), responsePayload);
                            }

                            return result;
                        } else {
                            throw new LambdaInvocationException(r.functionError(), r.statusCode());
                        }
                    }).join();


        } catch (LambdaException e) {
            throw new LambdaInvocationException(e.getMessage(), e.statusCode());
        } catch (LambdaInvocationException e) {
            throw e;
        }
        log.debug("invokeFunction> exit:{}", response);
        return response;
    }

}
