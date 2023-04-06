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

package com.aws.sif.audits;

import lombok.Builder;
import lombok.Data;
import java.util.List;
import java.util.Map;

@Builder
@Data
public class AuditMessage {

    String pipelineId;
    String executionId;
    String auditId;
    int executionNo;

    Output[] outputs;

    @Builder
    @Data
    public static class Output {
        int index;
        String name;
        String formula;
        Map<String, String> evaluated;
        String result;
        Resources resources;
        String errorMessage;
    }

    @Builder
    @Data
    public static class Resources {
        List<Map<String,String>> activities;
        List<Map<String,String>> calculations;
        List<Map<String,String>> referenceDatasets;
    }

}
