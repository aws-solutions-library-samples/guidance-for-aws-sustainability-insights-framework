package com.aws.sif.resources.caml;

import com.aws.sif.resources.ResourcesRepository;
import com.google.gson.Gson;
import com.typesafe.config.Config;
import lombok.extern.slf4j.Slf4j;
import software.amazon.awssdk.core.SdkBytes;
import software.amazon.awssdk.services.sagemakerruntime.SageMakerRuntimeClient;
import software.amazon.awssdk.services.sagemakerruntime.model.InvokeEndpointRequest;

import javax.inject.Inject;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

@Slf4j
public class CamlClient {
    private final SageMakerRuntimeClient sagemakerClient;
    private final Gson gson;
    private final String endpointName;
    private final Map<String, ProductMatch[]> productMatchesCache;
    private final ResourcesRepository repository;
    private final Map<String, ResourcesRepository.Mapping> mappingCache;

    @Inject
    public CamlClient(SageMakerRuntimeClient client, Config config, Gson gson, ResourcesRepository repository) {
        this.sagemakerClient = client;
        this.gson = gson;
        this.endpointName = config.getString("calculator.caml.inferenceEndpointName");
        this.productMatchesCache = new HashMap<>();
        this.repository = repository;
        this.mappingCache = new HashMap<>();
    }

    public ProductMatch[] getProductMatches(String productName) throws CamlNotEnabledException {
        log.debug("getProductMatches> in> productName:{}", productName);

        if (Objects.equals(this.endpointName, "")) {
            throw new CamlNotEnabledException("CaML feature is not enabled for this tenant.");
        }

		// result for a particular product name should be the same regardless of pipeline id and execution id
        var cacheKey = productName;
        if (!productMatchesCache.containsKey(cacheKey)) {
            // not in cache, but do we have it already available in the database cache?
            var mapping = repository.getMapping(cacheKey, ResourcesRepository.Type.CAML, productName);
            if (mapping != null) {
                this.productMatchesCache.put(cacheKey, this.gson.fromJson(mapping.getId(), ProductMatch[].class));
            } else {
                var invokeEndpointRequest = InvokeEndpointRequest.builder().contentType("application/json").endpointName(this.endpointName).body(SdkBytes.fromUtf8String("{\"inputs \":\"" + productName + "\"}")).build();
                var invokeEndpointResponse = this.sagemakerClient.invokeEndpoint(invokeEndpointRequest);
                var productMatchInString = invokeEndpointResponse.body().asUtf8String();
                // store the response as string in distributed dynamodb cache
                var newMapping = new ResourcesRepository.Mapping(productMatchInString, 0);
                this.repository.saveMapping(cacheKey, ResourcesRepository.Type.CAML, productName, newMapping);
                var response = this.gson.fromJson(invokeEndpointResponse.body().asUtf8String(), ProductMatch[].class);
                productMatchesCache.put(cacheKey, response);
            }
        }
        var productMatchList = productMatchesCache.get(cacheKey);

        log.debug("getProductMatches> exit:{}", (Object[]) productMatchList);
        return productMatchList;
    }

}
