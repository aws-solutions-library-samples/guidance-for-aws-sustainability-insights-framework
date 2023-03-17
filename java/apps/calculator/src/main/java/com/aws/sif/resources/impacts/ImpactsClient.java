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

package com.aws.sif.resources.impacts;

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
public class ImpactsClient {

    private final LambdaInvoker<Activity> activityInvoker;
    private final LambdaInvoker<ActivitiesList> activitiesListInvoker;
    private final Config config;
    private final ResourcesRepository repository;

    private final Map<String, Activity> activitiesCache;
    private final Map<String, ResourcesRepository.Mapping> mappingCache;
    private final Map<String, Integer> activationDateVersionCache;


    @Inject
    public ImpactsClient(LambdaInvoker<Activity> activityInvoker, LambdaInvoker<ActivitiesList> activitiesListInvoker, Config config, ResourcesRepository repository) {
        this.activityInvoker = activityInvoker;
        this.activitiesListInvoker = activitiesListInvoker;
        this.config = config;
        this.repository = repository;
        this.activitiesCache = new HashMap<>();
        this.mappingCache = new HashMap<>();
        this.activationDateVersionCache = new HashMap<>();

    }

    public Activity getActivity(String pipelineId, String executionId, String groupContextId, Authorizer authorizer, String name, Optional<String> tenantId, Optional<String> version, Optional<String> versionAsAt) throws ActivityNotFoundException {
        log.debug("getActivity> in> pipelineId:{}, executionId:{}, groupContextId:{}, name:{}, tenantId:{}, version:{}, versionAsAt:{}",
                pipelineId, executionId, groupContextId, name, tenantId, version, versionAsAt);

        Validate.notEmpty(pipelineId);
        Validate.notEmpty(executionId);
        Validate.notEmpty(groupContextId);
        Validate.notEmpty(name);

        // find the id that corresponds to the name
        var mapping = getLatestByName(pipelineId, executionId, groupContextId, authorizer, name, tenantId);

        // find the specific version of the activity we're asked for
        var actualVersion = ("latest".equals(version.orElse("latest"))) ? mapping.getLatestVersion() : Integer.parseInt(version.get());
        Activity value;
		if (versionAsAt.isPresent()) {
			value = getByIdVersionAsAt(pipelineId, executionId, groupContextId, authorizer, mapping.getId(), versionAsAt.get(), tenantId);
		} else {
			value = getByIdVersion(pipelineId, executionId, groupContextId, authorizer, mapping.getId(), actualVersion, tenantId);
		}

        log.debug("getActivity> value:{}", value);
        return value;
    }

    private ResourcesRepository.Mapping getLatestByName(String pipelineId, String executionId, String groupContextId, Authorizer authorizer, String name, Optional<String> tenantId) throws ActivityNotFoundException {
        log.debug("getLatestByName> in> pipelineId:{}, executionId:{}, groupContextId:{}, name:{}, tenantId:{}",
                pipelineId, executionId, groupContextId, name, tenantId);

        // do we already have it cached locally?
        var mappingCacheKey = mappingCacheKey(pipelineId, executionId, groupContextId, name, tenantId);
        if (!mappingCache.containsKey(mappingCacheKey)) {
            // not in cache, but do we have it already available in the database cache?
            var mapping = repository.getMapping(pipelineId, executionId, groupContextId, ResourcesRepository.Type.ACTIVITY, name);
            if (mapping!=null) {
                mappingCache.put(mappingCacheKey, mapping);
            } else {
                // not in db cache either so let's get it, then cache it for future use
                var activity = invokeGetActivityByName(groupContextId, authorizer, name, tenantId);
                var newMapping = new ResourcesRepository.Mapping(activity.getId(), activity.getVersion());
                repository.saveMapping(pipelineId, executionId, groupContextId, ResourcesRepository.Type.ACTIVITY, name, newMapping);
                mappingCache.put(mappingCacheKey, newMapping);
                var activityCacheKey = activityCacheKey( pipelineId, executionId, groupContextId, newMapping.getId(), newMapping.getLatestVersion(), tenantId);
                activitiesCache.put(activityCacheKey, activity);
            }
        }

        var mapping = mappingCache.get(mappingCacheKey);
        log.debug("getLatestByName> exit:{}", mapping);
        return mapping;
    }
    private Activity getByIdVersion(String pipelineId, String executionId, String groupContextId, Authorizer authorizer, String id, int version, Optional<String> tenantId) throws ActivityNotFoundException {
        log.debug("getByIdVersion> in> pipelineId:{}, executionId:{}, groupContextId:{}, id:{}, version:{}, tenantId:{}",
                pipelineId, executionId, groupContextId, id, version, tenantId);

        // do we already have it cached locally?
        var activityCacheKey = activityCacheKey( pipelineId, executionId, groupContextId, id, version, tenantId);
        if (!activitiesCache.containsKey(activityCacheKey)) {
            // not in cache, so go fetch, then cache it for future use
            var activity = invokeGetActivityByIdVersion(groupContextId, authorizer, id, version, tenantId);
            activitiesCache.put(activityCacheKey, activity);
        }

        var activity = activitiesCache.get(activityCacheKey);
        log.debug("getByIdVersion> exit:{}", activity);
        return activity;
    }

    private Activity getByIdVersionAsAt(String pipelineId, String executionId, String groupContextId, Authorizer authorizer, String id, String versionAsAt, Optional<String> tenantId) throws ActivityNotFoundException {
        log.debug("getByIdVersionAsAt> in> pipelineId:{}, executionId:{}, groupContextId:{}, id:{}, versionAsAt:{}, tenantId:{}",
            pipelineId, executionId, groupContextId, id, versionAsAt, tenantId);

        var activationDateCacheKey = activationDateVersionCacheKey(pipelineId, executionId, groupContextId, id, versionAsAt, tenantId);

        if (!activationDateVersionCache.containsKey(activationDateCacheKey)) {
            var activity = invokeGetActivityByIdVersionAsAt(groupContextId, authorizer, id, versionAsAt, tenantId);
            activationDateVersionCache.put(activationDateCacheKey, activity.getVersion());
            var activityCacheKey = activityCacheKey(pipelineId, executionId, groupContextId, id, activity.getVersion(), tenantId);
            activitiesCache.put(activityCacheKey, activity);
        }

        var version = activationDateVersionCache.get(activationDateCacheKey);
        var activity = this.getByIdVersion(pipelineId, executionId, groupContextId, authorizer, id, version, tenantId);

        log.debug("getByIdVersionAsAt> exit:{}", activity);
        return activity;
    }

    private String mappingCacheKey(String pipelineId, String executionId, String groupContextId, String name, Optional<String> tenantId) {
        return String.format("%s:%s:%s:%s:%s", pipelineId, executionId, groupContextId, name, tenantId.orElse(""));
    }

    private String activityCacheKey(String pipelineId, String executionId, String groupContextId, String id, int version, Optional<String> tenantId) {
        return String.format("%s:%s:%s:%s:%d:%s", pipelineId, executionId, groupContextId, id, version, tenantId.orElse(""));
    }

    private String activationDateVersionCacheKey(String pipelineId, String executionId, String groupContextId, String id, String versionAsAt, Optional<String> tenantId) {
        return String.format("%s:%s:%s:%s:%s:%s", pipelineId, executionId, groupContextId, id, versionAsAt, tenantId.orElse(""));
}

    private Activity invokeGetActivityByName(String groupContextId, Authorizer authorizer, String name, Optional<String> tenantId) throws ActivityNotFoundException {
        log.debug("invokeGetActivityByName> in> groupContextId:{}, name:{}, tenantId:{}", groupContextId, name, tenantId);

        var functionName = config.getString("calculator.impacts.functionName");
        var path = "/activities";
        var queryString = Optional.of(Map.of("name", name));

        var list = this.activitiesListInvoker.invokeFunction(functionName, groupContextId, authorizer, "GET", path, queryString, Optional.empty(), tenantId, ActivitiesList.class);
        if (list.getBody()==null || list.getBody().getActivities()==null || list.getBody().getActivities().length==0) {
            // if we have not found a match, return...
            throw new ActivityNotFoundException(String.format("Activity with name '%s' not found.", name));
        }
        var response = list.getBody().getActivities()[0];

        log.debug("invokeGetActivityByName> exit:{}", response);
        return response;

    }

    public Activity invokeGetActivityByIdVersion(String groupContextId, Authorizer authorizer, String id, int version, Optional<String> tenantId) throws ActivityNotFoundException {
        log.debug("invokeGetActivityByIdVersion> in> groupContextId:{}, id:{}, version:{}, tenantId:{}", groupContextId, id, version, tenantId);

        var functionName = config.getString("calculator.impacts.functionName");
        var path = String.format("/activities/%s/versions/%s", id, version);

        var response = this.activityInvoker.invokeFunction(functionName, groupContextId, authorizer, "GET", path, Optional.empty(), Optional.empty(), tenantId, Activity.class);
        var activity = response.getBody();

        log.debug("invokeGetActivityByIdVersion> exit:{}", activity);
        return activity;

    }

    public Activity invokeGetActivityByIdVersionAsAt(String groupContextId, Authorizer authorizer, String id, String versionAsAt, Optional<String> tenantId) throws ActivityNotFoundException {
        log.debug("invokeGetActivityByIdVersion> in> groupContextId:{}, id:{}, versionAsAt:{}, tenantId:{}", groupContextId, id, versionAsAt, tenantId);

        var functionName = config.getString("calculator.impacts.functionName");
        var path = String.format("/activities/%s/versions?versionAsAt=%s", id, versionAsAt);

        var response = this.activitiesListInvoker.invokeFunction(functionName, groupContextId, authorizer, "GET", path, Optional.empty(), Optional.empty(), tenantId, ActivitiesList.class);
        var activity = response.getBody().getActivities()[0];

        log.debug("invokeGetActivityByIdVersion> exit:{}", activity);
        return activity;

    }   


}
