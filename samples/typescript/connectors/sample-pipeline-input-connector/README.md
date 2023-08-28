# SAMPLE PIPELINE INPUT CONNECTOR

This project is a sample (AWS CDK) project to develop an external input connector for SIF Pipeline(s). The connector is a lambda based connector which provides a shell for custom implementation as a starting point.

## Getting Started

### Building

initialize the project dependencies:

```shell
> cd guidance-for-aws-sustainability-insights-framework/samples/typescript/connectors/sample-pipeline-input-connector
> npm install
> npm run build
```

### Deploying

NOTE: First time installers will need to bootstrap their AWS accounts (a requirement of using AWS CDK):

```shell
# bootstrap
>  npm run cdk -- bootstrap -c tenantId=<tenantId> -c environment=<environment>
```

```shell
> npm run cdk -- deploy -c tenantId=acme -c environment=development
```

### Making Code changes

The starting point for code changes `guidance-for-aws-sustainability-insights-framework/typescript/samples/connectors/sample-pipeline-input-connector/src/handler.ts` The handler.ts has stubs and comments which walks through how the workflow needs to be implemented.

## High level overview

### Integration Steps

If you are on a journey to develop an input connector for SIF you follow the following steps to integrate your connector within a pipeline

#### STEP 1 DEVELOPING AN INPUT CONNECTOR

The "sample-pipeline-input-connector" implementation can be utilized as a starting point for your custom connector. This sample is independent of SIF and can be forked for easy customization. The sample comes with its own infrastructure layer which has all the necessary integration components from a deployment perspective. It has a base implementation of a connector as well with commented out parts where you can add your custom implementation based on your use-case. There are 2 SIF managed connectors which can referenced for actual implementations.

- sif-csv-pipeline-input-connector (`guidance-for-aws-sustainability-insights-framework/typescript/packages/connectors/csv`)
  - this connector is a csv pre-processor. If this connector is configured on the pipeline, a csv input file will be processed into sif compatible format before the execution of the pipeline
- sif-connector (`guidance-for-aws-sustainability-insights-framework/typescript/packages/connectors/sif`)
  - this connector is a pipeline integration connector. This connector can be used in a cascade type situation where 2 or more pipelines are interconnected together in a cascade

Once your connector implementation is ready. We can move on to the next step

#### STEP 2 REGISTERING AN INPUT CONNECTOR

At this point SIF doesn't know anything about your new connector. For SIF to have knowledge about your connector we have to register your connector using the connector(s) management API hosted by the SIF pipelines module. The following API request will register your connector with SIF.

```http
POST <PIPELINES_API>/connectors

Headers:
    Content-Type: application/json
    Accept: application/json
    Accept-Version: 1.0.0
    Authorization: <REPLACE_WITH_AUTH_TOKEN>

Body:
{
 // required
    "name": "my-custom-input-connector",
    "description": "This connector pre-processes input payload into SIF compatible format",
    // specify this property if your connector will rely on input file to be uploaded to a signed url first.
    // This is the file based pipeline execution approach. If you connector is smart enough or knows where
    //and how to get the data from, then this can be set to false
    "requiresFileUpload": "true",
    // 'type' refers to the type of the connector which can be of one of 'input' or 'output'. Only input connectors are supported today.
    // The type attribute is utilized as a safeguard to handle scenarios where an input connector cannot be
    // configured as an output connector on the pipeline and vice-versa.
    "type": "input",
    // If there are any config related parameters which are required by your connector, i.e. location of the data
    // or any parameters which are required by the connector to perform its function can be defined here. There are 3
    // levels where config parameters can be specified which are compiled together and passed in the integration
    // request event for the connector to reference. The first place to define these parameters is on the connector itself, these
    // can be extended or overridden on the pipeline or at the execution level.
    "parameters": [{
    // name is required, this uniquely identifies the parameter. The parameter 'name' can be considered as the key.
        "name": "apiKey",
        // any description relating to the parameter
        "description": "this parameter refer to the API key required for the connector to connect to a third party....",
		// set this to true, if this is a required parameter and needs to be validated before passing it on the connector within the connector integration request
        "required": true,
        // if your parameter needs to have a default value set, specify the "defaultValue" properties value.
        "defaultValue": "someValue"
    },{
        "name": "endpoint",
        "description": "this parameter refer to the API key required for the connector to connect to a third party....",
        "required": true,
        "defaultValue": "https://.."
    },{
        "name": "query",
        "description": "this parameter refer to the query for the connector to perform ...",
        "required": true
    }]
}

```

#### STEP 3 CREATING A PIPELINE WITH INPUT CONNECTOR

At this point your connector is ready and register with SIF. The final step is to reference your connector within a pipeline. When a new pipeline is created it requires a "connectorConfig" to be specified. We will need to reference your new pipeline's connector configuration object like so:

```json

{
	"connectorConfig": {
		"input": [{
			// required property where we specify which connector to use.
			"name": "my-custom-input-connector",
			// optionally parameter values can be specified here to be passed down to the connector itself. These parameters are compiled togethar based on the connector parameter configuration defined
			// on the connector configuration itself (the API call to register a connector).
			"parameters": {
				"endpoint": "https://..."
			}
		}]
	}
}
```

#### STEP 4 (OPTIONAL) EXECUTING A PIPELINE

Final step is to execute the pipeline. The pipeline execution API sample below shows the third level of connector parameter overrides specified in the request

```http
POST <PIPELINES_API>/pipelines/<PIPELINE_ID>/executions

Headers:
    Content-Type: application/json
    Accept: application/json
    Accept-Version: 1.0.0
    Authorization: <AUTH_TOKEN>

body:
{
    // optionally parameters values can also be specified here to be passed down to the connector itself. These parameters are compiled together based on the connector parameter configuration
	// on the connector configuration itself (the API call to register a connector). At this stage all required parameters should be specified. If the required parameters specified on the connector
	// configuration isn't specified, an error will be thrown before a pipeline can be executed successfully.
    "connectorOverrides": {
        "my-custom-input-connector": {
            "parameters": {
                "query": "SELECT *...."
            }
        }
    }
}

```


### Optimization Techniques

This approach highlights building a lambda based connector. Based on what your use-case for the connector, the timeout and the memory should be optimized accordingly.

### Connector Configuration Parameter(s) Evaluation

We talked about parameters in the above steps. Let's take a deeper look into how they are evaluated and what we see from the connector point of view once the parameters are validated, compiled and sent in the connector integration request event.

Let's say you are working on developing a connector which will query some data from a database as your source/input data for the pipeline. We will define some hypothetical parameters for this example.

We think we will require some parameters for our connector to perform the required query to the db such as "db_host", "db_name", "db_token" and "query". From these parameters we can specify which ones are required and which ones can be set as defaults. let's configure the parameters on the connector configuration object when registering a new connector or updating an existing one (the API request we made above in step 2).

#### CONNECTOR CONFIGURATION

```json
{
	...
    "parameters": [{
		"name": "db_host",
		"description": "this parameter refers to the database host we need to connect to",
		"required": true,
		"defaultValue": "https://...."
    },{
		"name": "db_name",
		"description": "this parameter refer to the name of the database we will be targeting",
		"required": true,
		"defaultValue": "someDB"
    },{
		"name": "db_token",
		// this is just an example, sensitive attributes needs to be appropriately handled
		"description": "this parameter refers to the db_username",
		"required": true
	},{
		"name": "query",
		"description": "this parameter refer to query needed to be perform to retrieve the data",
		"required": true
	}]
}
```

From the parameters above, we can decide which parameters don't change and default them, such as "db_host". Since that parameter is defaulted it will be set to its default value. The parameter "db_name" can be a parameter which is set on whe we configure the connector on our pipeline. like so (Step 3 from above):

#### PIPELINE DEFINITION

```json
{
	"connectorConfig": {
		"input": [{
			// required property where we specify which connector to use.
			"name": "my-custom-input-connector",
			// optionally parameter values can be specified here to be passed down to the connector itself. These parameters are compiled together based on the connector parameter configuration defined
			// on the connector configuration itself (the API call to register a connector).
			"parameters": {
				"db_name": "mydb"
			}
		}]
	}
}
```

There are 2 more required parameters which are the db_token and the "query". These can be specified per execution of the pipeline since they can be different per execution. We can pass these through like so (Step 4 from above):

#### PIPELINE EXECUTION

```json
{
    "connectorOverrides": {
        "my-custom-input-connector": {
            "parameters": {
				"db_token": "AALKJFFDJLA.....",
                "query": "SELECT *...."
            }
        }
    }
}
```

We specified all the required parameters and made the pipeline execution request. The connector will receive the connector integration request like so:

```json
{
	"detail-type": "SIF>com.aws.sif.pipelineProcessor>connectorIntegration>request",
	"source": "com.aws.sif.pipelineProcessor",
	"account": "xxxxxxxxxxxx",
	"time": "2023-03-23T16:41:22Z",
	"region": "us-east-1",
	"resources": [],
	"detail": {
		"pipeline": {
			...
		},
		"executionId": "01gw7nh580em9cxz9m7j0p7x8f",
		"connector": {
			"name": "sif-csv-pipeline-input-connector",
			// compiled parameters
			"parameters": {
				// defaulted from the connector configuration
				"db_host": "https://...",
				// overridden on the pipeline definition (defaulted to "someDB" on the connector parameter config)
				"db_name": "mydb",
				// specified on the pipeline execution
				"db_token": "AALKJFFDJLA.....",
				// specified on the pipeline execution
				"query": "SELECT *...."
			}
		},
		"transformedInputUploadUrl": "https://<bucket>.s3.us-ea…6910549103d97cca0e07&X-Amz-SignedHeaders=host&x-id=PutObject",
		"rawInputDownloadUrl": "https://<bucket>.s3.us-ea…7e2605e77c792d6975a7&X-Amz-SignedHeaders=host&x-id=GetObject"
	}
}
```
