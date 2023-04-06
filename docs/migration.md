
# Migration of backward incompatible changes

While we endeavor to always make backward compatible changes, there may be times when we need to make changes that are not backward compatible. If these changes are made at the API level then the affected modules REST API vendor mime types
will be versioned supporting both new and old versions, as well as the modules minor version bumped. But if the change affect something else such as how configuration is handled, or how applications are deployed, then the major versions of
the modules will be bumped with migration notes added here.

## Migration from Tag RELEASE-LIVE-20230405210709

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

---
# The following migration notes apply to releases before public release to GitHub.

## Migrating from Tag RELEASE-LIVE-20230316012742

### Automatic Migration

In release after `RELEASE-LIVE-20230316012742` , we're introducing a new column `type` on the `Activity` table in the RDS database as part of the pipeline aggregation feature. When you deploy the `Calculator` stack, the schema migration will be done
automatically `Custom::DatabaseSeeder` custom resource. It will insert `raw` to the new column of the existing rows.

### Manual Migration

To migrate the schema manually, run the command below:

1. To connect to the RDS cluster environment outside the VPC, you can deploy the shared platform stack with AWS Client VPN included (more can be found [here](deployment/walkthrough.md)). The rest of steps assume that your machine has connected the AWS Client VPN deployed inside your `SIF` VPC.
2. Follow the backup and restore instruction [here](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Managing.Backups.html) to copy your production database to your staging environment.
3. Get the administrator `username` and `password` from AWS Secrets Manager [console](https://console.aws.amazon.com/secretsmanager/listsecrets). The secret name will be `sif-<environment>-credentials` (e.g. for `staging` environment, it would be `sif-staging-credentials`).
4. Get the Amazon RDS cluster (**not the Proxy**) `writer endpoint` from Amazon RDS [console](https://console.aws.amazon.com/rds/home). Database name will the concatenation of tenantId and environment (e.g. for tenantId `test` and environment `staging`, your database name will be `teststaging`)
5. The migration folder can be found in [here](../infrastructure/tenant/src/calculator/assets).
6. Run the command below to perform the migration on your copied RDS instance (use the information retrieved from step 3 and 4).
    ```shell
    $ DATABASE_URL=postgres://<username>:<password>@<aurora writer endpoint>:5432/<databasename> rush migrate -m <path to the parent of migration scripts folder>
    ```
7. If the migration in staging is successful, repeat step 3-6 in your production environment.


## Migrating from Tag []()

Prior to release, audit information can be retrieved by running the command below:

```shell
POST /pipelines/<PIPELINE_ID_GOES_HERE>/executions/<PIPELINE_EXECUTION_ID_GOES_HERE>/auditDownloadUrl

Headers:
    Accept-Version: 1.0.0
    Authorization: Bearer COGNITO_TOKEN_GOES_HERE

Body:

{
    "expiration": 900
}
```

Response is list of audit file signed urls for the pipeline execution:

```json
{
    "urls": ["auditFileSignedUrl1", "auditFileSignedUrl1"]
}
```

With this release, this api endpoint is deprecated, but you can still access the audit files directly on the s3 bucket under the prefix `/pipelines/<pipelineId>/executions/<executionId>/audits`.

Now the audit information can be retrieved by providing `ActivityId` to Activity Audit endpoint, as shown below (the `ActivityId` can be found in the response when you're [viewing pipeline results](../typescript/packages/apps/pipeline-processors/README.md#viewing-pipeline-results)):

```shell
GET /activities/<activityId>/audits

Headers:
    Accept-Version: 1.0.0
    Authorization: Bearer COGNITO_TOKEN_GOES_HERE
```

It will return all the audit version for the specified Activity Id:

```json
[
    {
        "activityId": 1270,
        "date": "2022-01-04T00:00:00.000Z",
        "pipelineId": "01gwk0agenjqw7t7jcc3nycykx",
        "executionId": "01gwk0ak07exn9bcmn5espmke0",
        "auditId": "e76a8b66-31f8-41b2-a995-50e0f8858f11",
        "createdAt": "2023-03-28T02:21:37.026Z",
        "executionNo": 0,
        "outputs": [
            {
                "index": 0,
                "name": "time",
                "formula": "AS_TIMESTAMP(:reading date,'M/d/yy')",
                "evaluated": {
                    "AS_TIMESTAMP(:reading date,'M/d/yy')": "1641254400000",
                    ":reading date": "1/4/22"
                },
                "result": "1641254400000"
            },
            {
                "index": 1,
                "name": "month",
                "formula": "AS_TIMESTAMP(:reading date,'M/d/yy', roundDownTo='month')",
                "evaluated": {
                    "AS_TIMESTAMP(:reading date,'M/d/yy', roundDownTo='month')": "1640995200000",
                    ":reading date": "1/4/22"
                },
                "result": "1640995200000"
            },
            {
                "index": 2,
                "name": "a",
                "formula": ":a",
                "evaluated": {
                    ":a": "A"
                },
                "result": "A"
            },
            {
                "index": 3,
                "name": "b*c",
                "formula": ":b*:c",
                "evaluated": {
                    ":b": "10",
                    ":c": "1"
                },
                "result": "10"
            }
        ]
    }
]
```
