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

import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyResponseEvent;
import lombok.EqualsAndHashCode;
import lombok.Value;

@Value
@EqualsAndHashCode(callSuper=true)
public class LambdaInvocationException extends RuntimeException {
    int statusCode;
    APIGatewayProxyResponseEvent response;
    public LambdaInvocationException(String errorMessage, APIGatewayProxyResponseEvent response) {
        this(errorMessage, -1, response);
    }

    public LambdaInvocationException(String errorMessage, int statusCode) {
        this(errorMessage, statusCode, null);
    }

    public LambdaInvocationException(String errorMessage, int statusCode, APIGatewayProxyResponseEvent response) {
        super(errorMessage);
        this.response = response;
        this.statusCode = statusCode;
    }
}
