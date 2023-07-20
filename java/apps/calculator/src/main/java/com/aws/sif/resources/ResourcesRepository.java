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

package com.aws.sif.resources;

import com.typesafe.config.Config;
import lombok.Value;
import lombok.extern.slf4j.Slf4j;
import software.amazon.awssdk.services.dynamodb.DynamoDbAsyncClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.DynamoDbException;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;

import javax.inject.Inject;
import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

@Slf4j
public class ResourcesRepository {

    private final DynamoDbAsyncClient ddb;
    private final Config config;

    @Inject
    public ResourcesRepository(DynamoDbAsyncClient ddb, Config config) {
        this.ddb = ddb;
        this.config = config;
    }

    public Mapping getMapping(String key, Type type, String name) {
        log.debug("getMapping> in> key:{}, type:{}, name:{}",
                key, type, name);

        var request = GetItemRequest.builder()
                .tableName(config.getString("calculator.resourceMappingTableName"))
                .key(Map.of(
                        "pk", AttributeValue.builder().s(key).build(),
                        "sk", AttributeValue.builder().s(String.format("%s:%s", type, encodeValue(name))).build()
                ))
                .build();
        log.debug("getMapping> request:{}", request);

        var response = ddb.getItem(request)
                .thenApplyAsync(r -> {
                    log.trace("getMapping> response:{}", r);
                    if (r.hasItem()) {
                        var item = r.item();
                        var id = item.get("id").s();
                        var version = Integer.parseInt(item.get("version").n());
                        var result = new Mapping(id, version);
                        log.debug("getMapping> exit:{}", result);
                        return result;
                    } else {
                        return null;
                    }
                }).join();

        log.debug("getMapping> exit:{}", response);
        return response;
    }

    public Mapping getMapping(String pipelineId, String executionId, String groupContextId, Type type, String name) {
        log.debug("getMapping> in> pipelineId:{}, executionId:{}, groupContextId:{}, type:{}, name:{}",
                pipelineId, executionId, groupContextId, type, name);

        var key = String.format("%s:%s:%s", pipelineId, executionId, encodeValue(groupContextId));

        var response = this.getMapping(key, type, name);
        log.debug("getMapping> exit:{}", response);
        return response;
    }

    public void saveMapping(String key, Type type, String name, Mapping mapping) {
        log.debug("saveMapping> in> key:{}, type: {}, name: {}, mapping: {}", key, type, name, mapping);

        var request = PutItemRequest.builder()
                .tableName(config.getString("calculator.resourceMappingTableName"))
                .item(Map.of(
                        "pk", AttributeValue.builder().s(key).build(),
                        "sk", AttributeValue.builder().s(String.format("%s:%s", type, encodeValue(name))).build(),
                        "id", AttributeValue.builder().s(mapping.id).build(),
                        "version", AttributeValue.builder().n(String.valueOf(mapping.latestVersion)).build()
                ))
                .build();

        try {
            ddb.putItem(request);
        } catch (DynamoDbException e) {
            System.err.println(e.getMessage());
            System.exit(1);
        }

        log.debug("saveMapping>");
    }

    public void saveMapping(String pipelineId, String executionId, String groupContextId, Type type, String name, Mapping mapping) {
        log.debug("saveMapping> in> pipelineId:{}, executionId:{}, groupContextId:{}, type:{}, name:{}, mapping:{}",
                pipelineId, executionId, groupContextId, type, name, mapping);
        var key = String.format("%s:%s:%s", pipelineId, executionId, encodeValue(groupContextId));
        this.saveMapping(key, type, name, mapping);
        log.debug("saveMapping>");
    }

    @Value
    public static class Mapping {
        String id;
        int latestVersion;
    }

    private String encodeValue(String value) {
        try {
            return URLEncoder.encode(value, StandardCharsets.UTF_8.toString());
        } catch (UnsupportedEncodingException e) {
            return value;
        }
    }

    public enum Type {
        ACTIVITY, LOOKUP, FUNCTION, GROUP, CAML
    }
}
