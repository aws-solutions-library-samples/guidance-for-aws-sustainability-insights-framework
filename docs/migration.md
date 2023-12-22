
# Migration of backward incompatible changes

While we endeavor to always make backward compatible changes, there may be times when we need to make changes that are not backward compatible. If these changes are made at the API level then the affected modules REST API vendor mime types will be versioned supporting both new and old versions, as well as the modules minor version bumped. But if the change affect something else such as how configuration is handled, or how applications are deployed, then the major versions of the modules will be bumped with migration notes added here.

## Migration from Release v1.8.0 to Release v1.9.0

In this release, significant changes have been made to enhance cost-efficiency and security in the SIF environment. As part of these changes, we have removed the public subnet by deleting the Internet Gateway (IGW) and NAT Gateway. If you have enabled AWS Client VPN when deploying your SIF environment, please follow these steps for a smooth transition:

1. Deploy SIF environment v1.8.0 with VPN Client option disabled, this will remove the [public IP](https://repost.aws/questions/QUXQ8aH5RQTr-JRSXK2s9N7w/vpn-client-endpoint-interfaces-have-public-ip-how-to-remove) (assigned to AWS Client VPN) attached to the IGW
2. Deploy SIF environment v1.9.0
3. Deploy SIF tenant(s)

## Migration from Release v1.7.2 to Release v1.8.0

The underlying pipeline executions datastore has been updated to enable querying with tags. This enhancement requires migrating data from the old DynamoDB table to the new DynamoDB table. This [document](../typescript/packages/tools/migrator/README.md#pipeline-executions-migrator) provides information on how to run the migration tool.

## Migration from Release v1.3.0 to Release v1.4.0

Changes have been made to the underlying metrics datastore, necessitating a migration from DynamoDB to RDS after a deployment upgrade. This [document](../typescript/packages/tools/migrator/README.md#metrics-migrator) provides information on how to use the migration tool to facilitate this process.

After executing the migration tool, a background process will be initiated. This process handles any remaining tasks and cleanup related to the migration. It typically takes approximately 5-10 minutes to complete, but the duration may vary based on the size of the legacy metric data in DynamoDB.

During this background process, the tool may perform additional optimizations or validations to ensure the integrity of the migrated data. Be patient and allow the process to finish.

By following these steps, you can successfully migrate your metric data from DynamoDB to RDS, ensuring compatibility with the updated metrics datastore.

## Migration from Release v1.1.0 to v1.2.0

API Breaking changes.

#### Pipeline Processor API
The pipeline execution API to generate pre-signed urls for uploading input data (`POST - <pipelines_processor_url>/pipelines/<pipelineId>/executions/<executionId>/inputUploadUrl`) has been deprecated. It has been replaced by (`POST - <pipelines_processor_url>/pipelines/<pipelineId>/executions`) pipeline execution API.

Deprecated API.

**REQUEST**
```
POST /pipelines/<PIPELINE_ID_GOES_HERE>/executions/<PIPELINE_EXECUTION_ID_GOES_HERE>/inputUploadUrl

Headers:
    Accept-Version: 1.0.0
    Authorization: Bearer COGNITO_TOKEN_GOES_HERE
	Content-Type: application/json
Body:

{
    "expiration": 900,
}

```
**RESPONSE**
```json
{
	"url": "https://<bucket>.s3.us-east-1.amazonaws.com/pipelines/01gw7t7pz6ehfhs60ea11qs21j/executions/01gw7t84qd9b9c8sd8xv4ec86t/input/raw?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-C..."
}
```

The deprecated API is replaced by the following new pipeline execution API.

**REQUEST**
```
POST /pipelines/<PIPELINE_ID_GOES_HERE>/executions

Headers:
    Accept-Version: 1.0.0
    Authorization: Bearer COGNITO_TOKEN_GOES_HERE
	Content-Type: application/json
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

**RESPONSE**

```http request
202 Accepted

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

The pre signed url to upload the input file can be referenced from the "inputUploadUrl" property.

#### Pipeline Configuration

Any pipelines existing prior to this update will continue to work as expected. But to create new pipelines from here on, a connector configuration is required as part of defining the pipeline. SIF provides 2 input connectors out of the box:

- A CSV file as input.
- Another SIF pipeline's output as input (cascading pipelines).

The new API (`GET - <pipelines_url>/connectors`) can be used to return a list of pipeline connectors that are registered within the framework.
In addition, custom developed connectors may be registered as used within the framework.

```json
{
	// Example of connector config
    "connectorConfig": {
        "input": [
            {
                "name": "sif-csv-pipeline-input-connector"
            }
        ]
    },
    "name": "sample pipeline",
    "transformer": {
    	...
    }
}
```

#### Pipeline Dry Run API's

The create and update API's for pipeline which supports dry runs have schema updates to align with SIF compatible format. This change form csv string to a json allows us to support more complex data format and structures.

Below is en example of legacy way to define dry run config for a pipeline.
```json
{
	...
	"dryRunOptions": {
		"data": ["01/01/2020,80239,100"]
	}
}
```

The updated way of defining dry run config for a pipeline.

```json
{
	...
	"dryRunOptions": {
		"data": [{
			"timestamp": "01/01/2020",
			"zipcode": "80239",
			"kwh": "100"
		}]
	}
}
```
