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

package com.aws.sif.resources.calculations;

import com.aws.sif.Authorizer;
import com.aws.sif.lambdaInvoker.LambdaInvoker;
import com.aws.sif.resources.ResourcesRepository;
import com.typesafe.config.Config;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.Validate;

import javax.inject.Inject;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@Slf4j
public class CalculationsClient {

    private final LambdaInvoker<Calculation> calculationInvoker;
    private final LambdaInvoker<CalculationsList> calculationsListInvoker;
    private final Config config;
    private final ResourcesRepository repository;
    private final Map<String, Calculation> calculationsCache;
    private final Map<String, ResourcesRepository.Mapping> mappingCache;
    private final Map<String, Integer> activationDateVersionCache;


    @Inject
    public CalculationsClient(LambdaInvoker<Calculation> calculationInvoker, LambdaInvoker<CalculationsList> calculationsListInvoker, Config config, ResourcesRepository repository) {
        this.calculationInvoker = calculationInvoker;
        this.calculationsListInvoker = calculationsListInvoker;
        this.config = config;
        this.repository = repository;
        this.calculationsCache = new HashMap<>();
        this.mappingCache = new HashMap<>();
        this.activationDateVersionCache = new HashMap<>();

    }

    public Calculation getCalculation(String pipelineId, String executionId, String groupContextId, Authorizer authorizer, String name, Optional<String> tenantId, Optional<String> version, Optional<String> versionAsAt) throws CalculationNotFoundException {
        log.debug("getCalculation> in> pipelineId:{}, executionId:{}, groupContextId:{}, tenantId:{}, version:{}, versionAsAt:{}",
                pipelineId, executionId, groupContextId, name, tenantId, version, versionAsAt);

        Validate.notEmpty(pipelineId);
        Validate.notEmpty(executionId);
        Validate.notEmpty(groupContextId);
        Validate.notEmpty(name);

        // find the id that corresponds to the name
        var mapping = getLatestByName(pipelineId, executionId, groupContextId, authorizer, name, tenantId);

        // find the specific version of the calculation we're asked for
        var actualVersion = ("latest".equals(version.orElse("latest"))) ? mapping.getLatestVersion() : Integer.parseInt(version.get());
        Calculation value;

        if (versionAsAt.isPresent()) {
            value = getByIdVersionAsAt(pipelineId, executionId, groupContextId, authorizer, mapping.getId(), versionAsAt.get(), tenantId);
        } else {
            value = getByIdVersion(pipelineId, executionId, groupContextId, authorizer, mapping.getId(), actualVersion, tenantId);
        }
        log.debug("getCalculation> value:{}", value);
        return value;
    }

    private ResourcesRepository.Mapping getLatestByName(String pipelineId, String executionId, String groupContextId, Authorizer authorizer, String name, Optional<String> tenantId) throws CalculationNotFoundException {
        log.debug("getLatestByName> in> pipelineId:{}, executionId:{}, groupContextId:{}, name:{}, tenantId:{}",
                pipelineId, executionId, groupContextId, name, tenantId);

        // do we already have it cached locally?
        var mappingCacheKey = mappingCacheKey(pipelineId, executionId, groupContextId, name, tenantId);
        if (!mappingCache.containsKey(mappingCacheKey)) {
            // not in cache, but do we have it already available in the database cache?
            var mapping = repository.getMapping(pipelineId, executionId, groupContextId, ResourcesRepository.Type.FUNCTION, name);
            if (mapping!=null) {
                mappingCache.put(mappingCacheKey, mapping);
            } else {
                // not in db cache either so let's get it, then cache it for future use
                var calculation = invokeGetCalculationByName(groupContextId, authorizer, name, tenantId);
                var newMapping = new ResourcesRepository.Mapping(calculation.getId(), calculation.getVersion());
                repository.saveMapping(pipelineId, executionId, groupContextId, ResourcesRepository.Type.FUNCTION, name, newMapping);
                mappingCache.put(mappingCacheKey, newMapping);
                var calculationCacheKey = calculationCacheKey(pipelineId, executionId, groupContextId, newMapping.getId(), newMapping.getLatestVersion(), tenantId);
                calculationsCache.put(calculationCacheKey, calculation);
            }
        }

        var mapping = mappingCache.get(mappingCacheKey);
        log.debug("getLatestByName> exit:{}", mapping);
        return mapping;
    }
    private Calculation getByIdVersion(String pipelineId, String executionId, String groupContextId, Authorizer authorizer, String id, int version, Optional<String> tenantId) throws CalculationNotFoundException {
        log.debug("getByIdVersion> in> pipelineId:{}, executionId:{}, groupContextId:{}, id:{}, version:{}, tenantId:{}",
                pipelineId, executionId, groupContextId, id, version, tenantId);

        // do we already have it cached locally?
        var calculationCacheKey = calculationCacheKey( pipelineId, executionId, groupContextId, id, version, tenantId);
        if (!calculationsCache.containsKey(calculationCacheKey)) {
            // not in cache, so go fetch, then cache it for future use
            var calculation = invokeGetCalculationByIdVersion(groupContextId, authorizer, id, version, tenantId);
            calculationsCache.put(calculationCacheKey, calculation);
        }

        var calculation = calculationsCache.get(calculationCacheKey);
        log.debug("getByIdVersion> exit:{}", calculation);
        return calculation;
    }

    private Calculation getByIdVersionAsAt(String pipelineId, String executionId, String groupContextId, Authorizer authorizer, String id, String versionAsAt, Optional<String> tenantId) throws CalculationNotFoundException {
        log.debug("getByIdVersionAsAt> in> pipelineId:{}, executionId:{}, groupContextId:{}, id:{}, versionAsAt:{}, tenantId:{}", pipelineId, executionId, groupContextId, id, versionAsAt, tenantId);

        var activationDateCacheKey = calculationActivationDateCacheKey(pipelineId, executionId, groupContextId, id, versionAsAt, tenantId);

        if (!activationDateVersionCache.containsKey(activationDateCacheKey)) {
            // not in cache, so go fetch, then cache it for future use
            var calculation = invokeGetCalculationByIdVersionAsAt(groupContextId, authorizer, id, versionAsAt, tenantId);
            var calculationCacheKey = calculationCacheKey(pipelineId, executionId, groupContextId, id, calculation.getVersion(), tenantId);
            calculationsCache.put(calculationCacheKey, calculation);
            activationDateVersionCache.put(activationDateCacheKey, calculation.getVersion());
        }

        var version = activationDateVersionCache.get(activationDateCacheKey);
        var calculation = this.getByIdVersion(pipelineId, executionId, groupContextId, authorizer, id, version, tenantId);
        log.debug("getByIdVersionAsAt> exit:{}", calculation);
        return calculation;
    }


    private String mappingCacheKey(String pipelineId, String executionId, String groupContextId, String name, Optional<String> tenantId) {
        return String.format("%s:%s:%s:%s", pipelineId, executionId, groupContextId, name, tenantId.orElse(""));
    }

    private String calculationCacheKey(String pipelineId, String executionId, String groupContextId, String id, int version, Optional<String> tenantId) {
        return String.format("%s:%s:%s:%s:%d:%s", pipelineId, executionId, groupContextId, id, version, tenantId.orElse(""));
    }

    private String calculationActivationDateCacheKey(String pipelineId, String executionId, String groupContextId, String id, String version, Optional<String> tenantId) {
        return String.format("%s:%s:%s:%s:%s:%s", pipelineId, executionId, groupContextId, id, version, tenantId.orElse(""));
    }


    private Calculation invokeGetCalculationByName(String groupContextId, Authorizer authorizer, String name, Optional<String> tenantId) throws CalculationNotFoundException {
        log.debug("invokeGetCalculationByName> in> groupContextId:{}, name:{}, tenantId:{}", groupContextId, name, tenantId);

        var functionName = config.getString("calculator.calculations.functionName");
        var path = "/calculations";
        var queryString = Optional.of(Map.of("name", name));

        var listResponse = this.calculationsListInvoker.invokeFunction(
                functionName, groupContextId, authorizer, "GET", path, queryString, Optional.empty(), tenantId, CalculationsList.class);

        if (listResponse.getBody()==null || listResponse.getBody().getCalculations()==null || listResponse.getBody().getCalculations().length==0) {
            throw new CalculationNotFoundException(String.format("Calculation with name '%s' not found.", name));
        }

        var response = listResponse.getBody().getCalculations()[0];
        log.debug("invokeGetCalculationByName> exit:{}", response);
        return response;

    }

    private Calculation invokeGetCalculationByIdVersion(String groupContextId, Authorizer authorizer, String id, int version, Optional<String> tenantId) throws CalculationNotFoundException {
        log.debug("invokeGetCalculationByIdVersion> in> groupContextId:{}, id:{}, version:{}, tenantId:{}", groupContextId, id, version, tenantId);

        var functionName = config.getString("calculator.calculations.functionName");
        var path = String.format("/calculations/%s/versions/%s", id, version);

        var getResponse =this.calculationInvoker.invokeFunction(functionName, groupContextId, authorizer, "GET", path, Optional.empty(), Optional.empty(), tenantId, Calculation.class);
        var response = getResponse.getBody();
        log.debug("invokeGetCalculationByIdVersion> exit:{}", response);
        return response;
    }

    private Calculation invokeGetCalculationByIdVersionAsAt(String groupContextId, Authorizer authorizer, String id, String versionAsAt, Optional<String> tenantId) throws CalculationNotFoundException {
        log.debug("invokeGetCalculationByIdVersionAsAt> in> groupContextId:{}, id:{}, versionAsAt:{}, tenantId:{}", groupContextId, id, versionAsAt, tenantId);

        var functionName = config.getString("calculator.calculations.functionName");
        var path = String.format("/calculations/%s/versions?versionAsAt=%s", id, versionAsAt);

        var getResponse = this.calculationsListInvoker.invokeFunction(functionName, groupContextId, authorizer, "GET", path, Optional.empty(), Optional.empty(), tenantId, CalculationsList.class);
        var response = getResponse.getBody().getCalculations()[0];
        log.debug("invokeGetCalculationByIdVersionAsAt> exit:{}", response);
        return response;

    }
}
