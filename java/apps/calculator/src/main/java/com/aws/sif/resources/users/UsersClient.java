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

package com.aws.sif.resources.users;


import com.aws.sif.Authorizer;
import com.aws.sif.lambdaInvoker.LambdaInvoker;
import com.typesafe.config.Config;
import lombok.extern.slf4j.Slf4j;

import javax.inject.Inject;
import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Optional;

@Slf4j
public class UsersClient {

    private final LambdaInvoker<User> userInvoker;
    private final Config config;


    @Inject
    public UsersClient(LambdaInvoker<User> userInvoker, Config config) {
        this.userInvoker = userInvoker;
        this.config = config;
    }

    public User getUser(String userId, String groupContextId, Authorizer authorizer ) throws UserNotFoundException {
        log.debug("getUser> in> userId:{}, groupContextId:{}",
                userId, groupContextId);

        var user = invokeGetUserById(groupContextId, authorizer, userId);

        log.debug("getUser> exit:{}", user);
        return user;
    }

    public User invokeGetUserById(String groupContextId, Authorizer authorizer, String id) throws UserNotFoundException {
        log.debug("invokeGetUserById> in> groupContextId:{}, id:{}", groupContextId, id);

        // TODO validate parameters

        var functionName = config.getString("calculator.accessManagement.functionName");
        var path = String.format("/users/%s", encodeValue(id) );

        var getResponse =this.userInvoker.invokeFunction(functionName, groupContextId, authorizer, "GET", path, Optional.empty(), Optional.empty(), Optional.empty(), User.class);
        var response = getResponse.getBody();
        log.debug("invokeGetUserById> exit:{}", response);
        return response;

    }

    private String encodeValue(String value) {
        try {
            return URLEncoder.encode(value, StandardCharsets.UTF_8.toString());
        } catch (UnsupportedEncodingException e) {
            return value;
        }
    }
}
