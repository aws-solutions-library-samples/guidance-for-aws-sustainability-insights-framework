#!/bin/bash

#
#  Copyright Amazon.com Inc. or its affiliates. All Rights Reserved.
#
#  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
#  with the License. A copy of the License is located at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
#  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
#  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
#  and limitations under the License.
#

# Check to see if input has been provided
if [ -z "$1" ] || [ -z "$2" ]; then
	echo "Please provide the tenantId , environment name"
	exit 1
fi

export TENANT_ID=$1
export ENVIRONMENT=$2
SHARED_TENANT_ID=$3

# Set environment variables from there respective SSM parameters

export BUCKET_NAME=$(aws ssm get-parameter --name /sif/$TENANT_ID/$ENVIRONMENT/shared/bucketName | jq -r '.Parameter.Value')
export PLATFORM_RESOURCE_MANAGER_FUNCTION_NAME=$(aws ssm get-parameter --name /sif/shared/$ENVIRONMENT/platformResourceManager/apiFunctionName | jq -r '.Parameter.Value')

export COGNITO_CLIENT_ID=$(aws ssm get-parameter --name /sif/$TENANT_ID/$ENVIRONMENT/shared/userPoolClientId | jq -r '.Parameter.Value')
export COGNITO_USER_POOL_ID=$(aws ssm get-parameter --name /sif/$TENANT_ID/$ENVIRONMENT/shared/userPoolId | jq -r '.Parameter.Value')

export ACCESS_MANAGEMENT_FUNCTION_NAME=$(aws ssm get-parameter --name /sif/$TENANT_ID/$ENVIRONMENT/accessManagement/apiFunctionName | jq -r '.Parameter.Value')
export ACCESS_MANAGEMENT_BASE_URL=$(aws ssm get-parameter --name /sif/$TENANT_ID/$ENVIRONMENT/accessManagement/apiUrl | jq -r '.Parameter.Value')
export ACCESS_MANAGEMENT_TABLE_NAME=$(aws ssm get-parameter --name /sif/$TENANT_ID/$ENVIRONMENT/accessManagement/tableName | jq -r '.Parameter.Value')

export IMPACTS_FUNCTION_NAME=$(aws ssm get-parameter --name /sif/$TENANT_ID/$ENVIRONMENT/impacts/apiFunctionName | jq -r '.Parameter.Value')
export IMPACTS_BASE_URL=$(aws ssm get-parameter --name /sif/$TENANT_ID/$ENVIRONMENT/impacts/apiUrl | jq -r '.Parameter.Value')
export IMPACTS_TABLE_NAME=$(aws ssm get-parameter --name /sif/$TENANT_ID/$ENVIRONMENT/impacts/tableName | jq -r '.Parameter.Value')
export IMPACTS_TASK_QUEUE_URL=$(aws ssm get-parameter --name /sif/$TENANT_ID/$ENVIRONMENT/impacts/taskQueueUrl | jq -r '.Parameter.Value')

export CALCULATIONS_API_FUNCTION_NAME=$(aws ssm get-parameter --name /sif/$TENANT_ID/$ENVIRONMENT/calculations/apiFunctionName | jq -r '.Parameter.Value')
export CALCULATIONS_SQS_FUNCTION_NAME=$(aws ssm get-parameter --name /sif/$TENANT_ID/$ENVIRONMENT/calculations/sqsFunctionName | jq -r '.Parameter.Value')
export CALCULATIONS_BASE_URL=$(aws ssm get-parameter --name /sif/$TENANT_ID/$ENVIRONMENT/calculations/apiUrl | jq -r '.Parameter.Value')
export CALCULATIONS_TABLE_NAME=$(aws ssm get-parameter --name /sif/$TENANT_ID/$ENVIRONMENT/calculations/tableName | jq -r '.Parameter.Value')

export PIPELINES_FUNCTION_NAME=$(aws ssm get-parameter --name /sif/$TENANT_ID/$ENVIRONMENT/pipelines/apiFunctionName | jq -r '.Parameter.Value')
export PIPELINES_BASE_URL=$(aws ssm get-parameter --name /sif/$TENANT_ID/$ENVIRONMENT/pipelines/apiUrl | jq -r '.Parameter.Value')
export PIPELINES_TABLE_NAME=$(aws ssm get-parameter --name /sif/$TENANT_ID/$ENVIRONMENT/pipelines/tableName | jq -r '.Parameter.Value')

export PIPELINE_PROCESSOR_BASE_URL=$(aws ssm get-parameter --name /sif/$TENANT_ID/$ENVIRONMENT/pipeline-processor/apiUrl | jq -r '.Parameter.Value')

export REFERENCE_DATASETS_FUNCTION_NAME=$(aws ssm get-parameter --name /sif/$TENANT_ID/$ENVIRONMENT/referenceDatasets/apiFunctionName | jq -r '.Parameter.Value')
export REFERENCE_DATASETS_BASE_URL=$(aws ssm get-parameter --name /sif/$TENANT_ID/$ENVIRONMENT/referenceDatasets/apiUrl | jq -r '.Parameter.Value')
export REFERENCE_DATASETS_TABLE_NAME=$(aws ssm get-parameter --name /sif/$TENANT_ID/$ENVIRONMENT/referenceDatasets/tableName | jq -r '.Parameter.Value')

export CALCULATION_ENGINE_FUNCTION_NAME=$(aws ssm get-parameter --name /sif/$TENANT_ID/$ENVIRONMENT/calculator/functionName | jq -r '.Parameter.Value')

if [ -n "$3" ]; then
	echo "Shared tenantId $3 detected !!!"
	export SHARED_TENANT=$3
	export SHARED_TENANT_COGNITO_CLIENT_ID=$(aws ssm get-parameter --name /sif/$SHARED_TENANT_ID/$ENVIRONMENT/shared/userPoolClientId | jq -r '.Parameter.Value')
	export SHARED_TENANT_COGNITO_USER_POOL_ID=$(aws ssm get-parameter --name /sif/$SHARED_TENANT_ID/$ENVIRONMENT/shared/userPoolId | jq -r '.Parameter.Value')
	export SHARED_TENANT_ACCESS_MANAGEMENT_FUNCTION_NAME=$(aws ssm get-parameter --name /sif/$SHARED_TENANT_ID/$ENVIRONMENT/accessManagement/apiFunctionName | jq -r '.Parameter.Value')
	export SHARED_TENANT_ACCESS_MANAGEMENT_BASE_URL=$(aws ssm get-parameter --name /sif/$SHARED_TENANT_ID/$ENVIRONMENT/accessManagement/apiUrl | jq -r '.Parameter.Value')
	export SHARED_TENANT_IMPACTS_BASE_URL=$(aws ssm get-parameter --name /sif/$SHARED_TENANT_ID/$ENVIRONMENT/impacts/apiUrl | jq -r '.Parameter.Value')
	export SHARED_TENANT_CALCULATIONS_BASE_URL=$(aws ssm get-parameter --name /sif/$SHARED_TENANT_ID/$ENVIRONMENT/calculations/apiUrl | jq -r '.Parameter.Value')
	export SHARED_TENANT_REFERENCE_DATASETS_BASE_URL=$(aws ssm get-parameter --name /sif/$SHARED_TENANT_ID/$ENVIRONMENT/referenceDatasets/apiUrl | jq -r '.Parameter.Value')

fi
export CALCULATION_ENGINE_FUNCTION_NAME=$(aws ssm get-parameter --name /sif/$TENANT_ID/$ENVIRONMENT/calculator/functionName | jq -r '.Parameter.Value')

printenv | sort
