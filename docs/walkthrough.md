# Walkthrough

## Introduction

This guide assumes you have a fresh install of the AWS Sustainability Insights Framework (SIF) installed, and will walk through the steps from the initial setup right through to viewing metrics for organization.

The steps we will follow will walk through how to:

- Set up an organization group structure
- Create users
- Create a reference dataset
- Create emission factors
- Create a custom calculation
- Define a data pipeline along with metrics (aka KPI's)
- Execute a pipeline and view the metrics for the organization

Note that as SIF is a framework intended to be the foundation upon which you build your sustainability related application on top, it does not provide its own UI. Integration with the framework is via a set of documented REST API's. This
walkthrough assumes using a tool such as [Postman](https://www.postman.com/) to execute the REST API requests. A [Postman collection](./postman/sif_core.postman_collection.json) is included in the repo.

## Obtaining an authentication token

Before one can use the REST API's a new authentication token needs to be obtained from Cognito. In the absence of your application already being built to integrate with Cognito, SIF provides a helper script to obtain a token.

If this is the very first time you have attempted to use SIF after a fresh install the email provided at time of install as the `<administratorEmail>` option will be created as the root admin user and assigned a temporary password. The
temporary password would have been emailed to that account. This temporary password will need updating which can also be done using the helper script by providing both the `<password>` and `<newPassword>` values.

To obtain a token:

```shell
# The script is part of the integration tests module
sif-core> cd typescript/packages/integrationTests

# Replace the tokens with your values (only provide <newPassword> if changing password)
sif-core/typescript/packages/integrationTests> npm run generate:token -- <tenantId> <environment> <administratorEmail> <password> <newPassword>
```

The output of the command will be `token: <token>`. Save the value of `<token>` to be used to authenticate with the SIF REST API.

## Organization group structure

SIF supports defining a hierarchical group structure to reflect the organizational structure of your business. Important factors to consider when defining this structure are:

> How do you want to organize resources such as emission factors, reference datasets, and custom calculations?

When resources are created, the are assigned to a group. They can also be shared with other groups. Only users with access to these groups may use the resources within the group.

> How do you want to manage user access to resources?

Users (just like resources) are assigned to groups, and can be assigned to many groups each having their own role (admin, contributor, or reader). A users access to groups controls which resources they can use within the framework.

> How do you want to track metrics across your organization?

If the group hierarchies are structured to reflect the operational boundaries of your organization it makes it possible to set boundaries for reporting. When metrics are defined, e.g. a metric to track *Scope 1 stationary combustion emissions*, all pipelines that contribute to a metric are automatically rolled up to each level within a group hierarchy.

For this walkthrough let's assume we have a group hierarchy in the format of `/<company>/<country>/<subsidiary>`. This will allow us to collect and process business activities at the subsidiary level, roll these up to the different
companies, then roll up at the country level. The group hierarchies we will create are:

```
- usa
  - company1
    - sub1
    - sub2
  - company2
    - sub3
    - sub4
```

To create these we start off by creating the parent `usa` group, then the next level of `company1` and `company2`, then the bottom levels of `sub1`, `sub2`, `sub3` and `sub4` as follows:

#### Creating /usa

First we create the group `USA` which belongs to the root `/` group. The parent group is specified by setting the `x-groupcontextid` request attribute which denotes the current group you are working with (we are working with `/` and
adding `USA` as a new child to it):

```shell
POST <accessManagementUrl>/groups
x-groupcontextid: /
Accept-Type: application/json
Content-Type: application/json
Accept-Version: 1.0.0
Authorization: <token>

{
    "name": "USA"
}
```

#### Creating /usa/company1

To create `/usa/company1` we change the group in context (`x-groupcontextid`) to `/usa` and add `company1` as a new child group:

```shell
POST <accessManagementUrl>/groups
x-groupcontextid: /usa
Accept-Type: application/json
Content-Type: application/json
Accept-Version: 1.0.0
Authorization: <token>

{
    "name": "Company1"
}
```

#### Creating /usa/company1/sub1

Following same pattern, to create `/usa/company1/sub1` we change the group in context (`x-groupcontextid`) to `/usa/company1` and add `sub1` as a new child group:

```shell
POST <accessManagementUrl>/groups
x-groupcontextid: /usa/company1
Accept-Type: application/json
Content-Type: application/json
Accept-Version: 1.0.0
Authorization: <token>

{
    "name": "Sub1"
}
```

#### Creating /usa/company1/sub2

Now, to create `/usa/company1/sub2` we keep the group in context (`x-groupcontextid`) to `/usa/company1` and add `sub2` as a new child group:

```shell
POST <accessManagementUrl>/groups
x-groupcontextid: /usa/company1
Accept-Type: application/json
Content-Type: application/json
Accept-Version: 1.0.0
Authorization: <token>

{
    "name": "Sub2"
}
```

#### Creating /usa/company2

To create `/usa/company2` we change the group in context (`x-groupcontextid`) back to `/usa` and add `company2` as a new child group:

```shell
POST <accessManagementUrl>/groups
x-groupcontextid: /usa
Accept-Type: application/json
Content-Type: application/json
Accept-Version: 1.0.0
Authorization: <token>

{
    "name": "Company2"
}
```

#### Creating /usa/company2/sub3

Following same pattern, to create `/usa/company2/sub3` we change the group in context (`x-groupcontextid`) to `/usa/company2` and add `sub3` as a new child group:

```shell
POST <accessManagementUrl>/groups
x-groupcontextid: /usa/company2
Accept-Type: application/json
Content-Type: application/json
Accept-Version: 1.0.0
Authorization: <token>

{
    "name": "Sub3"
}
```

#### Creating /usa/company2/sub4

Finally, to create `/usa/company2/sub4` we keep the group in context (`x-groupcontextid`) as `/usa/company2` and add `sub4` as a new child group:

```shell
POST <accessManagementUrl>/groups
x-groupcontextid: /usa/company2
Accept-Type: application/json
Content-Type: application/json
Accept-Version: 1.0.0
Authorization: <token>

{
    "name": "Sub4"
}
```

#### Listing groups

We can list the groups we just created. When setting the `x-groupcontextid` header to `/usa/company2` then calling the list groups API we will see the `/usa/company2/sub3` and `/usa/company2/sub4` groups returned.

```shell
GET <accessManagementUrl>/groups
x-groupcontextid: /usa/company2
Accept-Type: application/json
Content-Type: application/json
Accept-Version: 1.0.0
Authorization: <token>
```

### Users

As part of the deployment process a root admin user (provided as `<administatorEmail>`) is created.

When creating users they are granted access to one or more groups. A role (`admin`, `contributor`, or `reader`) is granted to each assigned group. Review each of the module's swagger (found at `docs/swagger.json`) in each module's directory
regarding what roles are required for each REST API.

## Calculating Stationary Emissions

Now that we have the administrative resources created, we can turn to creating all the resources required for an example emissions calculation.

### What input data is available to you?

Let assume that our company has a record of the
**natural gas** utility bills for the annual reporting period as shown below:

| Month     | Type        | Amount of Gas Purchased(scf) | Heat Content(Btu/scf) | Amount of Gas Purchased(therms) |
|-----------|-------------|------------------------------|-----------------------|---------------------------------|
| 1/1/2021  | natural gas | 440,000                      | 1,025                 | 4,510                           |
| 2/1/2021  | natural gas | 460,000                      | 1,025                 | 4,715                           |
| 3/1/2021  | natural gas | 510,000                      | 1,025                 | 5,227.5                         |
| 4/1/2021  | natural gas | 550,000                      | 1,025                 | 5,637.5                         |
| 5/1/2021  | natural gas | 530,000                      | 1,025                 | 5,432.5                         |
| 6/1/2021  | natural gas | 470,000                      | 1,025                 | 4,817.5                         |
| 7/1/2021  | natural gas | 490,000                      | 1,025                 | 5,022.5                         |
| 8/1/2021  | natural gas | 360,000                      | 1,025                 | 3,690                           |
| 9/1/2021  | natural gas | 480,000                      | 1,025                 | 4,920                           |
| 10/1/2021 | natural gas | 610,000                      | 1,025                 | 6,252.5                         |
| 11/1/2021 | natural gas | 520,000                      | 1,025                 | 5,330                           |
| 12/1/2021 | natural gas | 410,000                      | 1,025                 | 4,202.5                         |


### 1: Creating Metric (KPI)

At the end of the day, we want to have a KPI that we can use to track our emission target. The metric resource in `SIF` is used to aggregate the output from emission calculation executed in multiple group hierarchies. We will create a metric (KPI) resource named `scope1:stationary` in the root group to track all stationary combustion:

```shell
POST <pipelinesUrl>/metrics
x-groupcontextid: /
Accept-Type: application/json
Content-Type: application/json
Accept-Version: 1.0.0
Authorization: <token>
{
    "name": "scope1:stationary",
    "summary": "Scope 1 direct emissions from stationary combustion.",
    "aggregationType": "sum",
    "outputKpis": [],
    "tags": {
        "scope": "1",
        "category": "stationary"
    }
}
```

Go [here](../typescript/packages/apps/pipelines/README.md) for more details of Pipelines module.

### 2:  Emission factors

An emission factor (EF) is a coefficient that describes the rate at which a given activity releases greenhouse gases (GHGs) into the atmosphere. To create an example emission factor for `natural gas`, we will run the following command in the root group:

```shell
POST <impactsUrl>/activities
x-groupcontextid: /
Accept-Type: application/json
Content-Type: application/json
Accept-Version: 1.0.0
Authorization: <token>
{
	"name": "direct:stationary:2021:natural_gas",
	"description": "emission factor natural gas",
	"attributes": {
		"category": "direct",
		"version": "2021",
		"subcategory": "Stationary Combustion"
	},
	"tags": {
		"category": "direct",
		"version": "2021",
		"subcategory": "Stationary Combustion"
	},
	"impacts": {
		"co2e_mmbtu": {
			"name": "kg CO2 per mmBtu",
			"attributes": {
				"outUnit": "kg CO2 per mmBtu"
			},
			"components": {
				"co2": {
					"key": "co2",
					"value": 51.9,
					"type": "pollutant"
				},
				"ch4": {
					"key": "ch4",
					"value": 0.002,
					"type": "pollutant"
				},
				"n2o": {
					"key": "n2o",
					"value": 0.0003,
					"type": "pollutant"
				}
			}
		},
		"co2e_short_ton": {
			"name": "g CO2 per short ton",
			"attributes": {
				"outUnit": "kg CO2 per short ton"
			},
			"components": {
				"co2": {
					"key": "co2",
					"value": 0.05333,
					"type": "pollutant"
				},
				"ch4": {
					"key": "ch4",
					"value": 0.0000301,
					"type": "pollutant"
				},
				"n2o": {
					"key": "n2o",
					"value": 0.00000100,
					"type": "pollutant"
				}
			}
		}
	}
}
```

Go [here](../typescript/packages/apps/impacts/README.md) for more details of the Emission Factor module.

### 3: Reference Datasets

Typical organizations use different types of fuels which have different emission factors, to ensure a calculation resource can be used across these types, we will create a mapping between the fuel type and the emission factor `alias`.

| fuel type   | emission factor                    |
|-------------|------------------------------------|
| natural gas | direct:stationary:2021:natural_gas |
| fuel gas    | direct:stationary:2021:fuel_gas    |
| propane gas | direct:stationary:2021:propane_gas |

To create the above table as a reference dataset, run the command below:

```shell
POST <referenceDatasetsUrl>/referenceDatasets
x-groupcontextid: /
Accept-Type: application/json
Content-Type: application/json
Accept-Version: 1.0.0
{
    "name": "FuelTypeToEmissionFactor",
    "description": "Lookup table to map fuel type to emission factors",
    "datasetHeaders": [
        "fuel type",
        "emission factor"
    ],
    "data": "fuel type,emission factor\nnatural gas,direct:stationary:2021:natural_gas\nfuel gas,direct:stationary:2021:fuel_gas\npropane gas,direct:stationary:2021:propane_gas",
    "tags": {
		"version": "2021",
		"subcategory": "Stationary Combustion"
    }
}
```

We also need a reference dataset that maps the type of gas to its global warming potential. GWPs provide a common unit of measure, which allows a calculation formula
to add up emissions estimates of different gases, the table below show the GWP for different types of gases:

| gas | gwp                                |
|-----|------------------------------------|
| co2 | 1                                  |
| ch4 | 25                                 |
| n2o | 298                                |

To create the above table reference dataset, run the command below:

```shell
POST <referenceDatasetsUrl>/referenceDatasets
x-groupcontextid: /
Accept-Type: application/json
Content-Type: application/json
Accept-Version: 1.0.0
Authorization: <token>
{
    "name": "GasToGwp",
    "description": "Lookup table for global warming potential of different gas type",
    "datasetHeaders": [
        "gas",
        "gwp"
    ],
    "data": "gas,gwp\nco2,1\nch4,25\nn2o,298",
    "tags": {
		"version": "2021",
		"subcategory": "Stationary Combustion"
    }
}
```
Go [here](../typescript/packages/apps/reference-datasets/README.md) for more details of Reference Dataset module.

### 4: Calculations

Because our emission factor units are in `kg CO2 per mmBtu` and our input data units are `therms`, we can create a `unit conversion` calculation resource that converts `therms` to `mmBtu`. To validate your formula is correct, you can do
a `dryRun` before creating the resource:

#### Request

```shell
POST <calculationsUrl>/calculations?dryRun=true
x-groupcontextid: /
Accept-Type: application/json
Content-Type: application/json
Accept-Version: 1.0.0
Authorization: <token>
{
	"name": "therms_to_mmbtu",
	"summary": "Convert therms to mmBtu",
	"formula": ":therms*0.1",
	"parameters": [
		{
			"index": 0,
			"key": "therms",
			"label": "therms",
			"description": "therms",
			"type": "number"
		}
	],
	"outputs": [
		{
			"name": "mmbtu",
			"description": "mmbtu",
			"type": "number"
		}
	],
	"tags": {
		"version": "2021",
		"subcategory": "Stationary Combustion",
		"type": "unit conversion"
	},
	"dryRunOptions": { "data": ["1000"] }
}
```

#### Response

```shell
{
    "headers": [
        "mmbtu"
    ],
    "data": [
        "100.0"
    ],
    "errors": []
}
```

Once you're happy with your formula, you can then create the resource by running the command below:

```shell
POST <calculationsUrl>/calculations
x-groupcontextid: /
Accept-Type: application/json
Content-Type: application/json
Accept-Version: 1.0.0
Authorization: <token>
{
	"name": "therms_to_mmbtu",
	"summary": "Convert therms to mmBtu",
	"formula": ":therms*0.1",
	"parameters": [
		{
			"index": 0,
			"key": "therms",
			"label": "therms",
			"description": "therms",
			"type": "number"
		}
	],
	"outputs": [
		{
			"name": "mmbtu",
			"description": "mmbtu",
			"type": "number"
		}
	],
	"tags": {
		"version": "2021",
		"subcategory": "Stationary Combustion",
		"type": "unit conversion"
	}
}
```

There are multiple equations to calculate emission using the fuel analysis method based on the input data. In our sample scenario we will create a `heat_content_equation` since the actual heat content is available in our sample input. Run the command below to create the `heat_content_equation` formula:

```shell
POST <calculationsUrl>/calculations
x-groupcontextid: /
Accept-Type: application/json
Content-Type: application/json
Accept-Version: 1.0.0
Authorization: <token>
{
	"name": "heat_content_equation",
	"summary": "Calculates the emissions when the actual fuel heat content is known",
	"formula": "(#therms_to_mmbtu(:therms,group='/')*IMPACT(LOOKUP(:type,'FuelTypeToEmissionFactor','fuel type','emission factor',group='/'),'kg CO2 per mmBtu',:gas,group='/')*LOOKUP(:gas,'GasToGwp', 'gas', 'gwp',group='/'))*0.001",
	"parameters": [
		{
			"index": 0,
			"key": "type",
			"label": "type",
			"description": "type",
			"type": "string"
		},
		{
			"index": 1,
			"key": "therms",
			"label": "therms",
			"description": "therms",
			"type": "number"
		},
		{
			"index": 2,
			"key": "gas",
			"label": "gas",
			"description": "gas",
			"type": "string"
		}
	],
	"outputs": [
		{
			"name": "co2e",
			"description": "co2e in metric tons",
			"type": "number"
		}
	],
	"tags": {
		"version": "2021",
		"subcategory": "Stationary Combustion",
		"type": "emission equation"
	}
}
```

Go [here](../typescript/packages/apps/calculations/README.md) for more details of Calculations module.

Go [here](../java/apps/calculator) for more details of Calculator module ( the calculation engine that run the formula).

### 5: Pipelines

Now it's time to create the pipeline which can be triggered user's file upload, the pipeline will run the formula to sum up the co2 emissions from different gas units which is the output of `heat_content_equation` calculation resource we created in the previous step. Similar to creating a calculation resource, you can perform a `dryRun` of a pipeline creation to validate your formula syntax:

#### Request

```shell
POST <pipelinesUrl>/pipelines?dryRun=true
x-groupcontextid: /
Accept-Type: application/json
Content-Type: application/json
Accept-Version: 1.0.0
Authorization: <token>
{
    "attributes": {
        "scope": "1",
        "type": "stationary combustion"
    },
    "name": "scope 1 stationary pipeline",
    "description": "data processing pipeline to calculate scope 1 stationary combustion",
    "transformer": {
        "transforms": [
            {
                "index": 0,
                "formula": "AS_TIMESTAMP(:date,'M/d/yyyy')",
                "outputs": [
                    {
                        "description": "Timestamp of bill.",
                        "index": 0,
                        "key": "time",
                        "label": "Time",
                        "type": "timestamp"
                    }
                ]
            },
            {
                "index": 1,
                "formula": "#heat_content_equation(:type,:therms,'co2',group='/')+#heat_content_equation(:type,:therms,'ch4',group='/')+#heat_content_equation(:type,:therms,'n2o',group='/')",
                "outputs": [
                    {
                        "description": "therms",
                        "index": 0,
                        "key": "therms",
                        "label": "therms",
                        "type": "number",
                        "metrics":["scope1:stationary"]
                    }
                ]
            }
        ],
        "parameters": [
            {
                "index": 0,
                "key": "date",
                "type": "string"
            },
            {
                "index": 1,
                "key": "type",
                "type": "string"
            },
            {
                "index": 2,
                "key": "therms",
                "label": "therms",
                "description": "therms",
                "type": "number"
            }
        ]
    },
    "dryRunOptions": {
        "data": [
           "1/1/2021,natural gas,61500"
        ]
    }
}
```

#### Response

```shell
{
    "headers": [
        "time",
        "therms"
    ],
    "data": [
        "1609459200000,320.04231000"
    ],
    "errors": []
}
```

You can then create the pipeline resource by removing the `dryRun` query string. Note that the pipeline output will be aggregated into the `scope1:stationary` we created in the previous step.

#### Request

```shell
POST <pipelinesUrl>/pipelines
x-groupcontextid: /usa
Accept-Type: application/json
Content-Type: application/json
Accept-Version: 1.0.0
Authorization: <token>
{
    "attributes": {
        "scope": "1",
        "type": "stationary combustion"
    },
    "name": "scope 1 stationary pipeline",
    "description": "data processing pipeline to calculate scope 1 stationary combustion",
    "transformer": {
        "transforms": [
            {
                "index": 0,
                "formula": "AS_TIMESTAMP(:date,'M/d/yyyy')",
                "outputs": [
                    {
                        "description": "Timestamp of bill.",
                        "index": 0,
                        "key": "time",
                        "label": "Time",
                        "type": "timestamp"
                    }
                ]
            },
            {
                "index": 1,
                "formula": "#heat_content_equation(:type,:therms,'co2',group='/')+#heat_content_equation(:type,:therms,'ch4',group='/')+#heat_content_equation(:type,:therms,'n2o',group='/')",
                "outputs": [
                    {
                        "description": "therms",
                        "index": 0,
                        "key": "therms",
                        "label": "therms",
                        "type": "number",
                        "metrics":["scope1:stationary"]
                    }
                ]
            }
        ],
        "parameters": [
            {
                "index": 0,
                "key": "date",
                "type": "string"
            },
            {
                "index": 1,
                "key": "type",
                "type": "string"
            },
            {
                "index": 2,
                "key": "therms",
                "label": "therms",
                "description": "therms",
                "type": "number"
            }
        ]
    }
}
```

#### Response

```shell
{
    ...
    "id": "01grnkkvbq1g9rzb5q69shtweb",
    ...
}
```

Note down the pipeline `id` in the response body, you will need this to trigger pipeline execution.

Go [here](../typescript/packages/apps/pipelines/README.md) for more details of Pipelines module.

### 6: Pipeline Executions (Company 1)

Now we're going to upload our sample utility bill, so it can be processed by the pipeline created above. Create the file upload signed url by running the command below (notice the group context `/usa/company1`, this is used to illustrated
that we're uploading utility bill for `company1`):

#### Request

```shell
POST <pipelineProcessorUrl>/pipelines/<pipelineId>/inputUploadUrl
x-groupcontextid: /usa/company1
Accept-Type: application/json
Content-Type: application/json
Accept-Version: 1.0.0
Authorization: <token>
{
    "expiration": 900
}
```

#### Response

```json
{
	"id": "01grqjekm0e92pnvnef7tntxmt",
	"url": "https://s3-presigned-url-goes-here",
	"pipelineId": "01grqje46497rz2gvtgjzbwmf3"
}
```

Upload the sample input [file](../typescript/packages/integrationTests/samples/sample_utility_bill_company1.csv) to the signed url:

```sh
curl --upload-file ./sample_utility_bill_company1.csv 'https://s3-presigned-url-goes-here'
```

Once you upload the file, you can query the pipeline data processing status:

#### Request

```shell
GET <pipelineProcessorUrl>/pipelines/<pipelineId>/executions/<executionId>
x-groupcontextid: /usa/company1
Accept-Type: application/json
Content-Type: application/json
Accept-Version: 1.0.0
Authorization: <token>
```

#### Response

```json
{
	"id": "01grqjekm0e92pnvnef7tntxmt",
	"pipelineId": "01grqje46497rz2gvtgjzbwmf3",
	"pipelineVersion": 1,
	"createdAt": "2023-02-08T03:52:30.621Z",
	"createdBy": "someone@example.com",
	"status": "waiting"
}
```

Once the pipeline processing status is `success`, you can query `activity` result by running the command below (replaced the `executionId` and `pipelineId` with the actual value):

#### Request

```shell
GET <pipelineProcessorUrl>/activities?executionId=<executionId>&pipelineId=<pipelineId>&dateFrom=1/1/21&ateTo=12/1/21
x-groupcontextid: /usa/company1
Accept-Type: application/json
Content-Type: application/json
Accept-Version: 1.0.0
Authorization: <token>
```

This should return the list of calculated output (each corresponds to each row in your sample spreadsheet)

#### Response

```json
{
    "activities": [
        {
            "date": "2021-01-01T00:00:00.000Z",
            "pipelineId": "01gtn79y77ksw7xx9kkdst7txx",
            "executionId": "01gtn7kh40t3nw7w7gstzp362q",
            "createdAt": "2023-03-04T02:40:14.411Z",
            "therms": "23.469769"
        },
        {
            "date": "2021-02-01T00:00:00.000Z",
            "pipelineId": "01gtn79y77ksw7xx9kkdst7txx",
            "executionId": "01gtn7kh40t3nw7w7gstzp362q",
            "createdAt": "2023-03-04T02:40:14.463Z",
            "therms": "24.536577"
        },
        {
            "date": "2021-03-01T00:00:00.000Z",
            "pipelineId": "01gtn79y77ksw7xx9kkdst7txx",
            "executionId": "01gtn7kh40t3nw7w7gstzp362q",
            "createdAt": "2023-03-04T02:40:14.519Z",
            "therms": "27.203596"
        },
        {
            "date": "2021-04-01T00:00:00.000Z",
            "pipelineId": "01gtn79y77ksw7xx9kkdst7txx",
            "executionId": "01gtn7kh40t3nw7w7gstzp362q",
            "createdAt": "2023-03-04T02:40:14.546Z",
            "therms": "29.337212"
        },
        {
            "date": "2021-05-01T00:00:00.000Z",
            "pipelineId": "01gtn79y77ksw7xx9kkdst7txx",
            "executionId": "01gtn7kh40t3nw7w7gstzp362q",
            "createdAt": "2023-03-04T02:40:14.580Z",
            "therms": "28.270405"
        },
        {
            "date": "2021-06-01T00:00:00.000Z",
            "pipelineId": "01gtn79y77ksw7xx9kkdst7txx",
            "executionId": "01gtn7kh40t3nw7w7gstzp362q",
            "createdAt": "2023-03-04T02:40:14.604Z",
            "therms": "25.06998"
        },
        {
            "date": "2021-07-01T00:00:00.000Z",
            "pipelineId": "01gtn79y77ksw7xx9kkdst7txx",
            "executionId": "01gtn7kh40t3nw7w7gstzp362q",
            "createdAt": "2023-03-04T02:40:14.645Z",
            "therms": "26.13679"
        },
        {
            "date": "2021-08-01T00:00:00.000Z",
            "pipelineId": "01gtn79y77ksw7xx9kkdst7txx",
            "executionId": "01gtn7kh40t3nw7w7gstzp362q",
            "createdAt": "2023-03-04T02:40:14.663Z",
            "therms": "19.20254"
        },
        {
            "date": "2021-09-01T00:00:00.000Z",
            "pipelineId": "01gtn79y77ksw7xx9kkdst7txx",
            "executionId": "01gtn7kh40t3nw7w7gstzp362q",
            "createdAt": "2023-03-04T02:40:14.681Z",
            "therms": "25.603386"
        },
        {
            "date": "2021-10-01T00:00:00.000Z",
            "pipelineId": "01gtn79y77ksw7xx9kkdst7txx",
            "executionId": "01gtn7kh40t3nw7w7gstzp362q",
            "createdAt": "2023-03-04T02:40:14.706Z",
            "therms": "32.537636"
        },
        {
            "date": "2021-11-01T00:00:00.000Z",
            "pipelineId": "01gtn79y77ksw7xx9kkdst7txx",
            "executionId": "01gtn7kh40t3nw7w7gstzp362q",
            "createdAt": "2023-03-04T02:40:14.727Z",
            "therms": "27.737"
        },
        {
            "date": "2021-12-01T00:00:00.000Z",
            "pipelineId": "01gtn79y77ksw7xx9kkdst7txx",
            "executionId": "01gtn7kh40t3nw7w7gstzp362q",
            "createdAt": "2023-03-04T02:40:14.761Z",
            "therms": "21.869558"
        }
    ],
    "pagination": {
        "lastEvaluatedToken": 100
    }
}
```

Go [here](../typescript/packages/apps/pipeline-processors/README.md) for more details of Pipeline Processor module.

### 7: Metrics Output

Once the pipeline processing is finished, you can query the metric(KPI) that you defined in **step 1**:

```shell
GET <pipelineProcessorUrl>/metrics?timeUnit=year&name=scope1:stationary&dateFrom=1/1/2021
x-groupcontextid: /usa/company1
Accept-Type: application/json
Content-Type: application/json
Accept-Version: 1.0.0
Authorization: <token>
```
The value should match this:

```json
{
    "metrics": [
        {
            "date": "2021-01-01T00:00:00.000Z",
            "metricId": "01gtmz562yee9zmzax2wwm9vxd",
            "name": "scope1:stationary",
            "timeUnit": "year",
            "year": 2021,
            "hierarchyValue": 310.974445,
            "groupValue": 310.974445,
            "subGroupsValue": 0,
            "version": 1,
            "groupId": "/usa/company1"
        }
    ]
}
```
Change the `x-groupcontextid` to `/usa` to see that the aggregation result is being rolled up to the parent hierarchy.

### 8: Pipeline Execution (Company 2)

Now try uploading another sample utility [bill](../typescript/packages/integrationTests/samples/sample_utility_bill_company2.csv) but in the context of `/usa/company2`

#### Request

```shell
POST <pipelineProcessorUrl>/pipelines/<pipelineId>/inputUploadUrl
x-groupcontextid: /usa/company2
Accept-Type: application/json
Content-Type: application/json
Accept-Version: 1.0.0
Authorization: <token>
{
    "expiration": 900
}
```

#### Response

```json
{
	"id": "01grqjekm0e92pnvnef7tntxmt",
	"url": "https://s3-presigned-url-goes-here",
	"pipelineId": "01grqje46497rz2gvtgjzbwmf3"
}
```

Upload the sample input [file](../typescript/packages/integrationTests/samples/sample_utility_bill_company2.csv) to the signed url:

```sh
curl --upload-file ./sample_utility_bill_company2.csv 'https://s3-presigned-url-goes-here'
```

Once the pipeline processing is finished, query the same metric on the parent hierarchy(`/usa`), the value should incorporate the value from both first and second pipeline execution:

#### Request

```shell
GET <pipelineProcessorUrl>/metrics?timeUnit=year&name=scope1:stationary&dateFrom=1/1/2021
x-groupcontextid: /usa
Accept-Type: application/json
Content-Type: application/json
Accept-Version: 1.0.0
Authorization: <token>
```

#### Response

```json
{
    "metrics": [
        {
            "date": "2021-01-01T00:00:00.000Z",
            "metricId": "01gtmz562yee9zmzax2wwm9vxd",
            "name": "scope1:stationary",
            "timeUnit": "year",
            "year": 2021,
            "hierarchyValue": 356.77275999999995,
            "groupValue": 0,
            "subGroupsValue": 356.77275999999995,
            "version": 2,
            "groupId": "/usa"
        }
    ]

```

