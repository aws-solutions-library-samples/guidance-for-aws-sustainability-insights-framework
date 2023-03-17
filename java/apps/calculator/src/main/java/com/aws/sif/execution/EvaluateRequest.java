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

package com.aws.sif.execution;

import com.aws.sif.Authorizer;
import lombok.Builder;
import lombok.Data;
import org.antlr.v4.runtime.tree.ParseTree;

import java.util.Map;

@Builder
@Data
public class EvaluateRequest {
    private String pipelineId;
    private String executionId;
    private Calculator calculator;
    private String groupContextId;
    private ParseTree tree;
    private Map<String,DynamicTypeValue> parameters;
    private Map<String,DynamicTypeValue> context;
    private Authorizer authorizer;
}
