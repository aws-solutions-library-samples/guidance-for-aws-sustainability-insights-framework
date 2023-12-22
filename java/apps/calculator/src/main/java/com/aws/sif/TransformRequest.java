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

package com.aws.sif;

import com.aws.sif.execution.PipelineType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TransformRequest {

    private String groupContextId;
    private String pipelineId;
    private String executionId;

    /**
     * id of user to assume security context. Either the pipeline creator for executions,
     * or the current user for dry runs, should be provided.
     */
    private String username;

    /**
     * JWT token that contains user's cognito:groups claims, if this is provided
     * calculator will not retrieve this information from AccessManagement API
     */
    private String jwt;

    private List<TransformParameter> parameters;
    private List<Transform> transforms;


    /**
    * the combination of field names that represent the unique columns of a row. Used
    * for uploading audit reports. If no uniqueness is available then audit reports for
    * the same uniqueKey reference will be uploaded together as the same s3 key. If no
    * value is provided then the first column is assumed to be the key.
    */
    private List<String> uniqueKey;

    /**
     * optional - only required if chunking from S3
     */
    private Integer chunkNo;

    /**
     * required only for s3 processing
     */
    private S3SourceLocation sourceDataLocation;

    /**
     * required only for inline processing
     */
    private List<String> sourceData;

    /**
     * when in dry run mode, no audit should be published
     */
    private boolean dryRun;

    /**
     * to indicate whether to create calculation or delete the row
     */
    private CalculatorActionType actionType;

    /**
     * to indicate what type of processing that need to be done based on pipeline type
     */
    private PipelineType pipelineType;

}
