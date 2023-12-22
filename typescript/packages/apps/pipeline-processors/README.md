# Pipeline Processors Overview

## Introduction

The Pipeline Processors module orchestrates the steps involved in processing activity data through a pipeline. It manages tasks such as verifying the input data format, delegating calculations to the Calculation Engine, aggregating, and handling the results. Once the data has been processed, users can query the results and associated metrics using this module.


## Standard Processing Flow

Processing of a pipeline requires a pipeline to be defined using the [pipelines API](../pipelines/README.md). When a pipeline is created it is given a unique ID. Given this ID, the user can request an upload URL to upload a data file for
processing. When a file is uploaded an S3 event is published via an EventBridge Event Rule. This event is processed by a bucket events Lambda which filters for appropriate S3 events and starts the pipeline processor StepFunction.

Each execution of a pipeline is given a unique ID. This ID can be used by the pipeline processor API to track the status of the pipeline to completion. Once complete, the resulting output file can be retrieved from S3 by requesting a
download link from the pipeline processor API by supplying the pipeline ID and execution ID.

## Kinesis Connector Processing Flow

Detailed instruction on using the kinesis connector and its data processing flow can be found [here](../../connectors/kinesis/README.md).

## Example API Calls

The swagger doc for the processor API can be found [here](docs/swagger.json). A swagger page can also be found by running the module locally (see [Developer Quickstart](../../../../docs/development/developer-quickstart.md)) and navigating
to `http://localhost:<SERVICE PORT>/swagger-docs`.

### Prerequisites

These examples are assumed to be executed against a deployed service with auth handled by Cognito. In order to invoke the API a user will first need to obtain a token with the desired group context.
See [Access Management](../access-management/README.md) for steps to obtain a token.

The steps below assume the user is operating with group context `/group1`.

### Executing a pipeline

You can run the pipeline in either `INLINE` or `JOB` pipeline mode. `INLINE` mode will run the pipeline synchronously and returns the result, but it has as limit of 100 (you can [configure](./src/api/executions/schemas.ts#L163) this limit but make sure that you size your lambda accordingly to avoid timeout)rows of data. You should use the `job` mode to process dataset larger
than that. The default execution mode is `JOB`.

#### Inline Mode

You can the command below to execute the `INLINE` mode:

```
POST /pipelines/<PIPELINE_ID_GOES_HERE>/executions

Headers:
    Accept-Version: 1.0.0
    Authorization: Bearer COGNITO_TOKEN_GOES_HERE

Body:

{
    "actionType": "create",
    "mode": "inline",
    "inlineExecutionOptions": {
        "inputs": [
            // list of your input data, object key should match the transformer parameter key
            {
                "date": "1/4/22",
                "type": "natural gas",
                "therms": 4510,
            }
        ]
    }
}
```

Returned payload will contain the outputs and errors when applying the transform function to the input rows:

```
{
	"actionType": "create",
	"createdAt": "2023-03-23T18:03:43.725Z",
	"createdBy": "someone@somewhere.com",
	"id": "01gw7t84qd9b9c8sd8xv4ec86t",
	"pipelineId": "01gw7t7pz6ehfhs60ea11qs21j",
	"pipelineVersion": 1,
	"connectorOverrides": {
		"my-custom-connector": {
			"parameters": {
				"key1": "val1"
			}
		}
	},
	"inlineExecutionOutputs": {
		// list of error encountered when processing the rows
	 	"errors": [],
	 	// list of output created by applying the transformation function to the input rows
	 	"outputs": []
	},
	"status": "success",
	"groupContextId": "/"
}
```

#### Job Mode

In job mode, the user can request a pre-signed URL to use to upload a data file for processing by that pipeline. There is an optional parameter to specify the expiry (in seconds) of the signed URL.

```
POST /pipelines/<PIPELINE_ID_GOES_HERE>/executions

Headers:
    Accept-Version: 1.0.0
    Authorization: Bearer COGNITO_TOKEN_GOES_HERE

Body:

{
    "expiration": 900,
    // optional
	"connectorOverrides": {
        "my-custom-connector": {
            "parameters": {
                "key1": "val1"
            }
        }
    }
}
```

Returned is the S3 URL to use in a file upload:

```json
{
	"actionType": "create",
	"createdAt": "2023-03-23T18:03:43.725Z",
	"createdBy": "someone@somewhere.com",
	"id": "01gw7t84qd9b9c8sd8xv4ec86t",
	"inputUploadUrl": "https://<bucket>.s3.us-east-1.amazonaws.com/pipelines/01gw7t7pz6ehfhs60ea11qs21j/executions/01gw7t84qd9b9c8sd8xv4ec86t/input/raw?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-C...",
	"pipelineId": "01gw7t7pz6ehfhs60ea11qs21j",
	"pipelineVersion": 1,
	"connectorOverrides": {
		"my-custom-connector": {
			"parameters": {
				"key1": "val1"
			}
		}
	},
	"status": "waiting",
	"groupContextId": "/"
}
```

*(example results - signed URL will be longer and contain actual credentials)*

An example cURL command to upload:

```sh
curl --upload-file ./my_local_data_file.csv 'https://s3-presigned-url-goes-here'
```

### List Executions for a Pipeline

Given the pipeline ID a user can list the executions of that pipeline. This will return execution IDs which can be used to track execution status as well as request a download URL to retrieve the output data file on successful pipeline
completion.

```
GET /pipelines/<PIPELINE_ID_GOES_HERE>/executions

Headers:
    Accept-Version: 1.0.0
    Authorization: Bearer COGNITO_TOKEN_GOES_HERE
```

Returned is a list of executions for the pipeline along with their execution IDs and status.

```json
{
	"executions": [
		{
			"id": "88b38bsvh",
			"createdAt": "2022-10-24T22:28:53.009Z",
			"updatedAt": "2022-10-24T22:29:12.115Z",
			"createdBy": "someone@example.com",
			"updatedBy": "someone@example.com",
			"status": "success"
		},
		{
			"id": "tqpjebdp9",
			"createdAt": "2022-10-24T22:31:16.702Z",
			"createdBy": "someone@example.com",
			"updatedBy": "someone@example.com",
			"status": "in_progress"
		}
	]
}
```

### Get Execution Status for an Execution of a Pipeline

Given the pipeline ID and execution ID a user can request the execution status.

```
GET /pipelines/<PIPELINE_ID_GOES_HERE>/executions/<PIPELINE_EXECUTION_ID_GOES_HERE>

Headers:
    Accept-Version: 1.0.0
    Authorization: Bearer COGNITO_TOKEN_GOES_HERE
```

Returned is pipeline metadata along with the executions status.

```json
{
	"id": "88b38bsvh",
	"createdAt": "2022-10-24T22:28:53.009Z",
	"updatedAt": "2022-10-24T22:29:12.115Z",
	"createdBy": "someone@example.com",
	"updatedBy": "someone@example.com",
	"status": "success"
}
```

### Viewing Pipeline Results

To view the results of a specific pipeline execution:

```
GET /activities
	?executionId=<PIPELINE_EXECUTION_ID>

Headers:
    Accept-Version: 1.0.0
    Authorization: Bearer COGNITO_TOKEN_GOES_HERE
```

Other variations of querying include:

- viewing the results of all executions for a pipeline, filtered by date:

```
GET /activities
	?pipelineId=<PIPELINE_ID>
	&dateFrom=01/12/22
	&dateTo=31/12/22
```

- viewing the results of all executions for a pipeline, filtered by specific attributes:

```
GET /activities
	?pipelineId=<PIPELINE_ID>
	&attributes=fuel:Lignite Coal,equipmentType:furnace
	&dateFrom=1/1/2022
```

Response includes processed pipeline activities:

```json
{
	"activities": [
		{
			"activityId": "",
			"date": "2022-01-02",
			"fuel": "Lignite Coal",
			"equipmentId": "furnace9",
			"equipmentType": "furnace",
			"co2": 101.0,
			"pipelineId": "",
			"executionId": "",
			"version": 3
		},
		...
	],
	"pagination": {
		"lastEvaluatedToken": "AJCUAOWSJKK..."
	}
}
```

- viewing the aggregated results of your pipeline execution (e.g. the pipeline is configured to sum the total of co2 emission for all equipments per month):

```
GET /activities
	?pipelineId=<PIPELINE_ID>
	&date=1/1/22
	&showAggregate=true
```

Response includes processed pipeline activities:

```json
{
	"activities": [
		{
			"activityId": "",
			"date": "2022-01-01",
			"co2": 10000,
			"pipelineId": "",
			"executionId": "",
			"version": 3
		},
		...
	],
	"pagination": {
		"lastEvaluatedToken": "AJCUAOWSJKK..."
	}
}
```
### Viewing Pipeline Performance

We capture a set of custom cloudwatch metrics that enable us to monitor the performance of the pipeline execution.

Note: Currently this feature is only enabled for pipelines that have a type of `activities`.

The table bellow provides a description of the Logical tasks in the pipeline execution we monitor

| Task Name                              | PipeLine Type | Description                                                                                          |
|----------------------------------------|---------------|------------------------------------------------------------------------------------------------------|
| Calculation                            | `activities`  | processes the data according to the pipeline definition and provides the outputs to subsequent steps |
| AcquireLockInsertActivityValues        | `activities`  | Acquires a DB lock for the `ActivityInsertValues` task                                               |
| ActivityInsertValues                   | `activities`  | Inserts activity values into the DB                                                                  |
| ReleaseLockInsertActivityValuesSuccess | `activities`  | When successful, release the DB lock for the `ActivityInsertValues` task                             |
| ReleaseLockInsertActivityValuesFail    | `activities`  | When fail, release the DB lock for the `ActivityInsertValues` task                                   |
| AcquireLockInsertLatestActivityValues  | `activities`  | Acquires a DB lock for the `JobInsertLatestValuesTask` task                                          |
| JobInsertLatestValuesTask              | `activities`  | Inserts latest activity values into the DB                                                           |
| ReleaseLockInsertLatestActivityValues  | `activities`  | Release the DB lock for the `JobInsertLatestValuesTask` task                                         |
| Post Processing Tasks                  | `activities`  | Overall parallel task that encompasses both pipeline and metric aggregation                          |
| AcquireLockMetricAggregation           | `activities`  | Acquires a DB lock for the `MetricAggregation` task                                                  |
| MetricAggregation                      | `activities`  | Aggregates metrics and inserts them into the DB                                                      |
| ReleaseLockMetricAggregation           | `activities`  | Release the DB lock for the `MetricAggregation` task                                                 |
| AcquireLockPipelineAggregation         | `activities`  | Acquires a DB lock for the `PipelineAggregation` task                                                |
| PipelineAggregation                    | `activities`  | Aggregates the pipeline metrics and inserts them into the DB                                         |
| ReleaseLockPipelineAggregation         | `activities`  | Release the DB lock for the `PipelineAggregation` task                                               |

For each of the tasks we capture 3 metrics, that can be seen in the table bellow:

| Metric Name | Description                                                   |
|-------------|---------------------------------------------------------------|
| Runtime     | The overall execution time of the task in seconds             |
| Success     | the Success status of the task `1 => success` and `0 => fail` |
| Failure     | the Failure status of the task `1 => fail` and `0 => success` |

Each metric will have additional dimension data that can be used to query it from CloudWatch.

| Dimension Name | Description                                            |
|----------------|--------------------------------------------------------|
| tenant         | The tenant the execution belongs to                    |
| environment    | The environment the execution belongs to               |
| task           | The task the metric is collected for                   |
| pipelineName   | The name of the pipeline configuration of the metric   |
| executionId    | The execution Id                                       |
| module         | The core module that is used for execution of the task |

#### How to Use
You can use these custom metrics to gauge the performance of your pipeline executions via the CloudWatch dashboard or APIs.
Further details on how to construct queries via metrics insights can be found [here](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/cloudwatch-metrics-insights-querylanguage.html) .

## Deeper Dive

If you'd like to delve deeper into the Pipeline Processor module:

- Refer to the [High Level Architecture](../../../../docs/design.md#pipeline_processors) to grasp how we utilize various AWS services.
- For aid in testing state machines locally, see these [instructions](https://docs.aws.amazon.com/step-functions/latest/dg/sfn-local.html).
