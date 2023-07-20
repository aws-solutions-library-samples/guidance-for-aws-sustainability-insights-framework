# Automate Product Matching using ML with SIF and CaML

In this walkthrough, we will go through the end to end example of calculating your purchased product carbon footprint using `CaML` capability provided by `Sustainability Insight Framework`.

## Start From Your Data

As an example, assume that you have a list of purchased products (sample below) from your company, and you want to calculate the carbon footprint from them.

```csv
date,department,product[^1],amount_purchased
1/1/22,marketing,computer cable,50
2/1/22,marketing,laser printer,400
3/1/22,finance,ergonomic mouse,100,
4/1/22,finance,meeting desk,400
```

[^1]: The product column can be product name or product description.

## Mapping Product To NAICS Code

### Create `Data` Pipeline

> Use Pipelines API

First we want to create a `data` pipeline that takes list of distinct product names as an input and output the `NAICS` code and emission factor (`co2e per dollar`) by using the request payload below:

We will use `CAML` and `GET_VALUE` expressions in our formula to map the product name and output the value, for more details on these two expressions go [here](../../../../java/apps/calculator/docs/expressions.md).


**REQUEST**

```http
POST <PIPELINES_API>/pipelines

Headers:
    Content-Type: application/json
    Accept: application/json
    Accept-Version: 1.0.0
    Authorization: <REPLACE_WITH_AUTH_TOKEN>

Body:
{
    "name": "EIO-LCA NAICS mapping",
    "description": "Maps provided product names to North American Industry Classification System (NAICS) codes.",
    "type": "data",
    "connectorConfig": {
        "input": [
            {
                "name": "sif-csv-pipeline-input-connector"
            }
        ]
    },
    "transformer": {
        "transforms": [
            {
                "index": 0,
                "formula": ":product",
                "outputs": [
                    {
                        "index": 0,
                        "key": "product",
                        "type": "string"
                    }
                ]
            },
            {
                "index": 1,
                "formula": "1",
                "outputs": [
                    {
                        "index": 0,
                        "key": "chosen_result",
                        "type": "string"
                    }
                ]
            },
            {
                "index": 2,
                "formula": "GET_VALUE(CAML(:product),'$[0].naicsCode')",
                "outputs": [
                    {
                        "index": 0,
                        "key": "naicsCode_1",
                        "type": "number"
                    }
                ]
            },
            {
                "index": 3,
                "formula": "GET_VALUE(CAML(:product),'$[0].title')",
                "outputs": [
                    {
                        "index": 0,
                        "key": "title_1",
                        "type": "string"
                    }
                ]
            },
            {
                "index": 4,
                "formula": "GET_VALUE(CAML(:product),'$[0].co2ePerDollar')",
                "outputs": [
                    {
                        "index": 0,
                        "key": "co2e_1",
                        "type": "string"
                    }
                ]
            },
            {
                "index": 5,
                "formula": "GET_VALUE(CAML(:product),'[0].confidence')",
                "outputs": [
                    {
                        "index": 0,
                        "key": "confidence_1",
                        "type": "number"
                    }
                ]
            },
            {
                "index": 6,
                "formula": "GET_VALUE(CAML(:product),'$[1].naicsCode')",
                "outputs": [
                    {
                        "index": 0,
                        "key": "naicsCode_2",
                        "type": "number"
                    }
                ]
            },
            {
                "index": 7,
                "formula": "GET_VALUE(CAML(:product),'$[1].title')",
                "outputs": [
                    {
                        "index": 0,
                        "key": "title_2",
                        "type": "string"
                    }
                ]
            },
            {
                "index": 8,
                "formula": "GET_VALUE(CAML(:product),'$[1].co2ePerDollar')",
                "outputs": [
                    {
                        "index": 0,
                        "key": "co2e_2",
                        "type": "string"
                    }
                ]
            },
            {
                "index": 9,
                "formula": "GET_VALUE(CAML(:product),'$[1].confidence')",
                "outputs": [
                    {
                        "index": 0,
                        "key": "confidence_2",
                        "type": "number"
                    }
                ]
            }
        ],
        "parameters": [
            {
                "index": 0,
                "key": "product",
                "type": "string"
            }
        ]
    }
}

```

**RESPONSE**

```sh
HTTP: 201 Created
Content-Type: application/json

{
	"createdAt": "2023-03-24T19:41:41.084Z",
	"createdBy": "someone@somewhere.com",
	"id": "<data-pipeline-id>",
	"type": "data"
	...
}
```

### Execute `Data` pipeline

> Use Pipeline Processors API

Once the pipeline is created, we can execute it with the list of distinct products as an input. You can run the command below to execute the pipeline in `INLINE` mode, the inputs will be the list of product names from your source file (you can also execute the pipeline in `JOB` mode and upload your source file).

**REQUEST**
```
POST /pipelines/<data-pipeline-id>/executions

Headers:
    Accept-Version: 1.0.0
    Authorization: Bearer COGNITO_TOKEN_GOES_HERE

Body:
{
  "actionType": "create",
  "mode": "inline",
  "inlineExecutionOptions": {
    "inputs": [
      {
        "product": "computer cable"
      },
      {
        "product": "laser printer"
      },
      {
        "product": "ergonomic mouse"
      },
      {
        "product": "meeting desk"
      }
    ]
  }
}
```

**RESPONSE**

```sh
HTTP: 201 Created
Content-Type: application/json

{
    "actionType": "create",
    "createdAt": "2023-07-05T05:07:32.666Z",
    "createdBy": "someone@somewhere.com",
    "id": "<data-pipeline-execution-id>",
    "pipelineId": "<data-pipeline-id>",
    "pipelineVersion": 1,
    "status": "success",
    "groupContextId": "/",
    "inlineExecutionOutputs": {
        "outputs": [
            {
                "product": "computer cable",
                "chosen_result": "1",
                "naicsCode_1": "238210",
                "title_1": "Health care structures",
                "co2e_1": "0.28099999999999997",
                "confidence_1": "0.719",
                "naicsCode_2": "335929",
                "title_2": "Communication and energy wire and cable manufacturing",
                "co2e_2": "0.462",
                "confidence_2": "0.519"
            },
            {
                "product": "laser printer",
                "chosen_result": "1",
                "naicsCode_1": "334118",
                "title_1": "Computer terminals and other computer peripheral equipment manufacturing",
                "co2e_1": "0.199",
                "confidence_1": "0.681",
                "naicsCode_2": "333244",
                "title_2": "Other industrial machinery manufacturing",
                "co2e_2": "0.246",
                "confidence_2": "0.642"
            },
            {
                "product": "ergonomic mouse",
                "chosen_result": "1",
                "naicsCode_1": "334118",
                "title_1": "Computer terminals and other computer peripheral equipment manufacturing",
                "co2e_1": "0.199",
                "confidence_1": "0.621",
                "naicsCode_2": "334111",
                "title_2": "Electronic computer manufacturing",
                "co2e_2": "0.109",
                "confidence_2": "0.357"
            },
            {
                "product": "meeting desk",
                "chosen_result": "1",
                "naicsCode_1": "337211",
                "title_1": "Office furniture and custom architectural woodwork and millwork manufacturing",
                "co2e_1": "0.368",
                "confidence_1": "0.62",
                "naicsCode_2": "337122",
                "title_2": "Nonupholstered wood household furniture manufacturing",
                "co2e_2": "0.276",
                "confidence_2": "0.566"
            }
        ]
    }
}
```

### Download Output Mapping File

> Use Pipeline Processors API

We will download the pipeline execution output as a file (as an input for the next `impacts` pipeline), by requesting it from the `pipeline processors API`:

**REQUEST**
```
POST /pipelines/<data-pipeline-id>/executions/<data-pipeline-execution-id>/outputDownloadUrl

Headers:
    Accept-Version: 1.0.0
    Authorization: Bearer COGNITO_TOKEN_GOES_HERE

Body:
{
    "expiration": 900,
}
```

**RESPONSE**

```sh
HTTP: 201 Created
Content-Type: application/json

{
    "url": "<signed url>"
}
```

Below is the content of the file:

```csv
product,chosen_result,naicsCode_1,title_1,co2e_1,confidence_1,naicsCode_2,title_2,co2e_2,confidence_2
computer cable,1,238210,Health care structures,0.28099999999999997,0.719,335929,Communication and energy wire and cable manufacturing,0.462,0.519
laser printer,1,334118,Computer terminals and other computer peripheral equipment manufacturing,0.199,0.681,333244,Other industrial machinery manufacturing,0.246,0.642
ergonomic mouse,1,334118,Computer terminals and other computer peripheral equipment manufacturing,0.199,0.621,334111,Electronic computer manufacturing,0.109,0.357
meeting desk,1,337211,Office furniture and custom architectural woodwork and millwork manufacturing,0.368,0.62,337122,Nonupholstered wood household furniture manufacturing,0.276,0.566
```

In the sample above, the `computer cable` first match (`Health care structure`) is less accurate than the second one (`Communication and energy wire and cable manufacturing`), so we should modify the `chosen_result` column to `2`

## Create Impacts

### Create `Impacts` pipeline

> Use Pipelines API

To create impact resources using the output from the previous pipeline execution, first we need to create an `impacts` pipeline, the pipeline will create `impacts` and set the emission factor to `co2e_1` or `co2e_2`
based on the `chosen_value`

**REQUEST**

```http
POST <PIPELINES_API>/pipelines

Headers:
    Content-Type: application/json
    Accept: application/json
    Accept-Version: 1.0.0
    Authorization: <REPLACE_WITH_AUTH_TOKEN>

Body:
{
    "name": "EIO-LCA NAICS impacts creation",
    "description": "Creates impacts representing EIO-LCA mappings.",
    "type": "impacts",
    "connectorConfig": {
        "input": [
            {
                "name": "sif-csv-pipeline-input-connector"
            }
        ]
    },
    "transformer": {
        "transforms": [
            {
                "index": 0,
                "formula": "CONCAT('eiolca_',:product)",
                "outputs": [
                    {
                        "index": 0,
                        "key": "activityName",
                        "type": "string"
                    }
                ]
            },
            {
                "index": 1,
                "formula": "'ghg_emissions'",
                "outputs": [
                    {
                        "index": 0,
                        "key": "impactName",
                        "type": "string"
                    }
                ]
            },
            {
                "index": 2,
                "formula": "'co2e'",
                "outputs": [
                    {
                        "index": 0,
                        "key": "componentKey",
                        "type": "string"
                    }
                ]
            },
            {
                "index": 3,
                "formula": "'carbon'",
                "outputs": [
                    {
                        "index": 0,
                        "key": "componentType",
                        "type": "string"
                    }
                ]
            },
            {
                "index": 4,
                "formula": "SWITCH(:chosen_value,1,:co2e_1,2,:co2e_2)",
                "outputs": [
                    {
                        "index": 0,
                        "key": "componentValue",
                        "type": "number"
                    }
                ]
            }
        ],
        "parameters": [
            {
                "index": 0,
                "key": "product",
                "type": "string"
            },
            {
                "index": 1,
                "key": "chosen_value",
                "type": "number"
            },
            {
                "index": 2,
                "key": "co2e_1",
                "type": "number"
            },
            {
                "index": 3,
                "key": "co2e_2",
                "type": "number"
            }
        ]
    }
}
```

**RESPONSE**

```sh
HTTP: 201 Created
Content-Type: application/json

{
	"createdAt": "2023-03-24T19:41:41.084Z",
	"createdBy": "someone@somewhere.com",
	"id": "<emissionfactors-pipeline-id>",
	"type": "impacts"
	...
}
```

### Execute `Impacts` Pipeline

> Use Pipeline Processors API

We will request the signed url, so we can upload the `data` pipeline output file as an input to the `impacts` pipeline.

**REQUEST**

```
POST /pipelines/<emissionfactors-pipeline-id>/executions

Headers:
    Accept-Version: 1.0.0
    Authorization: Bearer COGNITO_TOKEN_GOES_HERE

Body:

{
    "expiration": 900,
}
```

**RESPONSE**

```json
{
	"actionType": "create",
	"createdAt": "2023-07-05T05:40:16.413Z",
	"createdBy": "someone@somewhere.com",
	"id": "<emissionfactors-pipeline-execution-id>",
	"inputUploadUrl": "https://s3-presigned-url-goes-here",
	"pipelineVersion": 1,
	"status": "waiting",
	"groupContextId": "/"
}
```

An example cURL command to upload:

```sh
curl --upload-file ./pipeline_data_output_file.csv 'https://s3-presigned-url-goes-here'
```

### Listing Impacts Created By Pipeline

> Use Impacts API

Once the `impacts` pipeline execution is finished, you can query the list of created impact resources by specifying the pipeline id as the tags value as shown below:

**REQUEST**

```http
GET /actities?tags=pipelineId:<emissionfactors-pipeline-id>
Accept: application/json
Accept-Version: 1.0.0
Authorization: <TOKEN>
```

**RESPONSE**

```sh
HTTP: 200 Created
Content-Type: application/json

{
    "activities": [
        {
            "id": "01h4j92hq5xhyhfkm0k49sxytf",
            "name": "eiolca_computer cable",
            "attributes": {},
            "version": 1,
            "state": "enabled",
            "impacts": {
                "ghg_emissions": {
                    "name": "ghg_emissions",
                    "attributes": {},
                    "components": {
                        "co2e": {
                            "key": "co2e",
                            "value": 0.28099999999999997,
                            "type": "carbon"
                        }
                    }
                }
            },
            "groups": [
                "/"
            ],
            "tags": {
                "executionId": "<emissionfactors-pipeline-execution-id>",
                "pipelineId": "<emissionfactors-pipeline-id>"
            },
            "createdBy": "sif-pipeline-execution",
            "createdAt": "2023-07-05T05:40:47.973Z"
        },
        {
            "id": "01h4j92hxbm09j29cw48gy5q6g",
            "name": "eiolca_laser printer",
            "attributes": {},
            "version": 1,
            "state": "enabled",
            "impacts": {
                "ghg_emissions": {
                    "name": "ghg_emissions",
                    "attributes": {},
                    "components": {
                        "co2e": {
                            "key": "co2e",
                            "value": 0.199,
                            "type": "carbon"
                        }
                    }
                }
            },
            "groups": [
                "/"
            ],
            "tags": {
                "executionId": "<emissionfactors-pipeline-execution-id>",
                "pipelineId": "<emissionfactors-pipeline-id>"
            },
            "createdBy": "sif-pipeline-execution",
            "createdAt": "2023-07-05T05:40:48.172Z"
        },
        {
            "id": "01h4j92j18krq68bdqjrstj4x4",
            "name": "eiolca_ergonomic mouse",
            "attributes": {},
            "version": 1,
            "state": "enabled",
            "impacts": {
                "ghg_emissions": {
                    "name": "ghg_emissions",
                    "attributes": {},
                    "components": {
                        "co2e": {
                            "key": "co2e",
                            "value": 0.199,
                            "type": "carbon"
                        }
                    }
                }
            },
            "groups": [
                "/"
            ],
            "tags": {
                "executionId": "<emissionfactors-pipeline-execution-id>",
                "pipelineId": "<emissionfactors-pipeline-id>"
            },
            "createdBy": "sif-pipeline-execution",
            "createdAt": "2023-07-05T05:40:48.296Z"
        },
        {
            "id": "01h4j92j4twt2n910733rwttcp",
            "name": "eiolca_meeting desk",
            "attributes": {},
            "version": 1,
            "state": "enabled",
            "impacts": {
                "ghg_emissions": {
                    "name": "ghg_emissions",
                    "attributes": {},
                    "components": {
                        "co2e": {
                            "key": "co2e",
                            "value": 0.368,
                            "type": "carbon"
                        }
                    }
                }
            },
            "groups": [
                "/"
            ],
            "tags": {
                "executionId": "<emissionfactors-pipeline-execution-id>",
                "pipelineId": "<emissionfactors-pipeline-id>"
            },
            "createdBy": "sif-pipeline-execution",
            "createdAt": "2023-07-05T05:40:48.410Z"
        }
    ]
}
```
## Create Activities

### Create `Activities` Pipeline

> Use Pipelines API

Now that we have our impact resources for our product list, we will create `activities` pipeline that will process our source data and use the impact (created by the `impacts` pipeline) to calculate the CO2 emissions from our purchased product.

```http request
POST <PIPELINES_API>/pipelines

Headers:
    Content-Type: application/json
    Accept: application/json
    Accept-Version: 1.0.0
    Authorization: <REPLACE_WITH_AUTH_TOKEN>

Body:
{
    "type": "activities",
    "connectorConfig": {
        "input": [
            {
                "name": "sif-csv-pipeline-input-connector"
            }
        ]
    },
    "name": "purchased_product_emission_factor",
    "transformer": {
        "transforms": [
            {
                "index": 0,
                "formula": "AS_TIMESTAMP(:date,'M/d/yy')",
                "outputs": [
                    {
                        "description": "Timestamp of purchased.",
                        "index": 0,
                        "key": "time",
                        "label": "Time",
                        "type": "timestamp"
                    }
                ]
            },
            {
                "index": 1,
                "formula": ":department",
                "outputs": [
                    {
                        "index": 0,
                        "key": "department",
                        "label": "department",
                        "description": "department of the company",
                        "type": "string"
                    }
                ]
            },
            {
                "index": 2,
                "formula": ":product",
                "outputs": [
                    {
                        "index": 0,
                        "key": "product",
                        "label": "product",
                        "description": "name or description of product",
                        "type": "string"
                    }
                ]
            },
            {
                "index": 3,
                "formula": "IMPACT(CONCAT('eiolca_',:product),'ghg_emissions','co2e') * :amount_purchased",
                "outputs": [
                    {
                        "index": 0,
                        "key": "co2e",
                        "label": "co2e",
                        "description": "total product emission",
                        "type": "number"
                    }
                ]
            }
        ],
        "parameters": [
            {
                "index": 0,
                "key": "date",
                "label": "date",
                "type": "string",
                "description": "purchased date"
            },
            {
                "index": 1,
                "key": "department",
                "label": "department",
                "description": "department ",
                "type": "string"
            },
            {
                "index": 2,
                "key": "product",
                "label": "product",
                "description": "product name or description",
                "type": "string"
            },
            {
                "index": 3,
                "key": "amount_purchased",
                "label": "amount_purchased",
                "description": "amount spent on the product",
                "type": "number"
            }
        ]
    }
}
```

**RESPONSE**

```shell
HTTP: 201 Created
Content-Type: application/json

{
    "type": "activities",
    "connectorConfig": {
        "input": [
            {
                "name": "sif-csv-pipeline-input-connector"
            }
        ]
    },
    "name": "purchased_product_emission_factor",
    "transformer": {
        "transforms": [
            {
                "index": 0,
                "formula": "AS_TIMESTAMP(:date,'M/d/yy')",
                "outputs": [
                    {
                        "description": "Timestamp of purchased.",
                        "index": 0,
                        "key": "time",
                        "label": "Time",
                        "type": "timestamp"
                    }
                ]
            },
            {
                "index": 1,
                "formula": ":department",
                "outputs": [
                    {
                        "index": 0,
                        "key": "department",
                        "label": "department",
                        "description": "department of the company",
                        "type": "string"
                    }
                ]
            },
            {
                "index": 2,
                "formula": ":product",
                "outputs": [
                    {
                        "index": 0,
                        "key": "product",
                        "label": "product",
                        "description": "name or description of product",
                        "type": "string"
                    }
                ]
            },
            {
                "index": 3,
                "formula": "IMPACT(CONCAT('eiolca_',:product),'ghg_emissions','co2e') * :amount_purchased",
                "outputs": [
                    {
                        "index": 0,
                        "key": "co2e",
                        "label": "co2e",
                        "description": "total product emission",
                        "type": "number"
                    }
                ]
            }
        ],
        "parameters": [
            {
                "index": 0,
                "key": "date",
                "label": "date",
                "type": "string",
                "description": "purchased date"
            },
            {
                "index": 1,
                "key": "department",
                "label": "department",
                "description": "department ",
                "type": "string"
            },
            {
                "index": 2,
                "key": "product",
                "label": "product",
                "description": "product name or description",
                "type": "string"
            },
            {
                "index": 3,
                "key": "amount_purchased",
                "label": "amount_purchased",
                "description": "amount spent on the product",
                "type": "number"
            }
        ]
    },
    "id": "<activities-pipeline-id>",
    "groups": [
        "/"
    ],
    "createdBy": "someone@somewhere.com",
    "createdAt": "2023-07-05T06:49:33.652Z",
    "updatedAt": "2023-07-05T06:49:33.652Z",
    "version": 1,
    "state": "enabled"
}
```

### Execute `Activites` Pipeline

> Use Pipeline Processors API

Create the execution for the `activities` pipeline and use your source data as an input (this example creates the execution in `INLINE` mode, but you can use `JOB` mode if you prefer to upload your file):

**REQUEST**

```http request
POST /pipelines/<activities-pipeline-id>/executions

Headers:
    Accept-Version: 1.0.0
    Authorization: Bearer COGNITO_TOKEN_GOES_HERE

Body:
{
    "actionType": "create",
    "mode": "inline",
    "inlineExecutionOptions": {
        "inputs": [
            {
                "date": "1/1/22",
                "department": "marketing",
                "product": "computer cable",
                "amount_purchased": 50
            },
            {
                "date": "2/1/22",
                "department": "marketing",
                "product": "laser printer",
                "amount_purchased":400
            },
            {
                "date": "3/1/22",
                "department": "finance",
                "product": "ergonomic mouse",
                "amount_purchased": 100
            },
            {
                "date": "4/1/22",
                "department": "finance",
                "product": "meeting desk",
                "amount_purchased": 400
            }
        ]
    }
}
```

**RESPONSE**

```shell
HTTP: 201 Created
Content-Type: application/json

{
    "actionType": "create",
    "createdAt": "2023-07-05T06:50:13.788Z",
    "createdBy": "someone@somewhere.com",
    "id": "<activities-pipeline-execution-id>",
    "pipelineId": "<activities-pipeline-id>",
    "pipelineVersion": 1,
    "status": "success",
    "groupContextId": "/",
    "inlineExecutionOutputs": {
        "outputs": [
            {
                "time": "2022-01-01T00:00:00.000Z",
                "department": "marketing",
                "product": "computer cable",
                "co2e": "14.049999999999999"
            },
            {
                "time": "2022-02-01T00:00:00.000Z",
                "department": "marketing",
                "product": "laser printer",
                "co2e": "79.6"
            },
            {
                "time": "2022-03-01T00:00:00.000Z",
                "department": "finance",
                "product": "ergonomic mouse",
                "co2e": "19.9"
            },
            {
                "time": "2022-04-01T00:00:00.000Z",
                "department": "finance",
                "product": "meeting desk",
                "co2e": "147.2"
            }
        ]
    }
}

```
### List `Activities` Created By Pipeline

> Use Pipeline Processors API

Now you can list the processed pipeline activities by running the command below:

**REQUEST**

```http
GET /activities?dateFrom=1/1/22&pipelineId=<PIPELINE_ID_GOES_HERE>
Accept: application/json
Accept-Version: 1.0.0
Authorization: <TOKEN>
```

**RESPONSE**

```sh
HTTP: 200 Created
Content-Type: application/json

{
    "activities": [
        {
            "activityId": 1,
            "date": "2022-01-01T00:00:00.000Z",
            "pipelineId": "<activities-pipeline-id>",
            "executionId": "<activities-pipeline-execution-id>",
            "auditId": "9875099b-d9ea-4d95-a77e-844fd5b56765",
            "createdAt": "2023-07-05T06:52:30.090Z",
            "department": "marketing",
            "co2e": "14.050000",
            "product": "computer cable"
        },
        {
            "activityId": 2,
            "date": "2022-02-01T00:00:00.000Z",
            "pipelineId": "<activities-pipeline-id>",
            "executionId": "<activities-pipeline-execution-id>",
            "auditId": "e80e8b9e-afe6-4cc3-aeca-e9b92d681f1d",
            "createdAt": "2023-07-05T06:52:30.191Z",
            "department": "marketing",
            "co2e": "79.600000",
            "product": "laser printer"
        },
        {
            "activityId": 3,
            "date": "2022-03-01T00:00:00.000Z",
            "pipelineId": "<activities-pipeline-id>",
            "executionId": "<activities-pipeline-execution-id>",
            "auditId": "149da949-98c5-4654-8c1d-824a3f393570",
            "createdAt": "2023-07-05T06:52:30.251Z",
            "department": "finance",
            "co2e": "19.900000",
            "product": "ergonomic mouse"
        },
        {
            "activityId": 4,
            "date": "2022-04-01T00:00:00.000Z",
            "pipelineId": "<activities-pipeline-id>",
            "executionId": "<activities-pipeline-execution-id>",
            "auditId": "43838393-e207-474b-ae51-b4ac6b2eb6a2",
            "createdAt": "2023-07-05T06:52:30.312Z",
            "department": "finance",
            "co2e": "147.200000",
            "product": "meeting desk"
        }
    ]
}
```
