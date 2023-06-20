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

package com.aws.sif.resources.groups;

import com.aws.sif.Authorizer;
import com.aws.sif.lambdaInvoker.LambdaInvocationException;
import com.aws.sif.lambdaInvoker.LambdaInvoker;
import com.aws.sif.resources.ResourcesRepository;
import com.typesafe.config.Config;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.Validate;

import javax.inject.Inject;
import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.CompletionException;

@Slf4j
public class GroupsClient {

    private final LambdaInvoker<Group> groupInvoker;
    private final Config config;
	private final ResourcesRepository repository;
	private final Set<String> groupExistsCache;

	@Inject
    public GroupsClient(LambdaInvoker<Group> groupInvoker, Config config, ResourcesRepository repository) {
        this.groupInvoker = groupInvoker;
        this.config = config;
		this.repository = repository;
        this.groupExistsCache = new HashSet<>();
    }

    public boolean groupExists(String pipelineId, String executionId, String groupId, String groupContextId, Authorizer authorizer) throws GroupNotFoundException {
        log.debug("groupExists> in> pipelineId: {}, executionId: {}, groupId:{}, groupContextId:{}",
			pipelineId, executionId, groupId, groupContextId);

		Validate.notEmpty(pipelineId);
		Validate.notEmpty(executionId);
        Validate.notEmpty(groupId);
        Validate.notEmpty(groupContextId);

		// the group exists if it is in the local cache
		var groupCacheKey = groupCacheKey(pipelineId, executionId, groupId);
		if (!groupExistsCache.contains(groupCacheKey)) {
			// not in local cache, is it in the database cache?
			var mapping = repository.getMapping(pipelineId, executionId, groupContextId, ResourcesRepository.Type.GROUP, groupId);
			if (mapping!=null) {
				groupExistsCache.add(groupCacheKey);
			} else {
				// not in db cache, so go fetch, then cache locally and in db if it exists
				var group = invokeGetGroupById(groupId, groupContextId, authorizer);
				if (group!=null) {
					// borrowing the mapping repository to store presence of a group
					// the repository should be refactored if we start distributed caching of the actual resource calls
					var newMapping = new ResourcesRepository.Mapping(groupId, 0);
					repository.saveMapping(pipelineId, executionId, groupContextId, ResourcesRepository.Type.GROUP, groupId, newMapping);
					groupExistsCache.add(groupCacheKey);
				} else {
					return false;
				}
			}
		}

		log.debug("groupExists> exit:");
		return true;
    }

    private Group invokeGetGroupById(String groupId, String groupContextId, Authorizer authorizer) throws GroupNotFoundException {
        log.debug("invokeGetGroupById> in> groupId:{}, groupContextId:{}", groupId, groupContextId);

        var functionName = config.getString("calculator.accessManagement.functionName");
        var path = String.format("/groups/%s", encodeValue(groupId));

		try {
			var getResponse = this.groupInvoker.invokeFunction(functionName, groupContextId, authorizer, "GET", path, Optional.empty(), Optional.empty(), Optional.empty(), Group.class);
			log.debug("invokeGetGroupById> getResponse:{}", getResponse);

			var response = getResponse.getBody();
			log.debug("invokeGetGroupById> exit:{}", response);
			return response;
		} catch (CompletionException e) {
			var lie = (LambdaInvocationException)e.getCause();
			if (lie.getStatusCode() == 404) {
				log.debug(String.format("Group %s not found", groupId));
				throw new GroupNotFoundException(String.format("Group id %s not found.", groupId));
			} else {
				throw e;
			}
		}
    }

	private String groupCacheKey(String pipelineId, String executionId, String groupId) {
		return String.format("%s:%s:%s", pipelineId, executionId, groupId);
	}
	private String encodeValue(String value) {
		try {
			return URLEncoder.encode(value, StandardCharsets.UTF_8.toString());
		} catch (UnsupportedEncodingException e) {
			return value;
		}
	}
}
