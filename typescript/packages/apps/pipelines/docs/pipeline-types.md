# Pipeline Types

This document explains what are different types of pipelines and how they need to be configured.

## Introduction

There are 3 different types of data transformation pipelines supported in SIF `('data', 'activities', 'impacts')`.

- Activities type pipeline
> An `activities` pipeline ingests incoming time-series business activities, and calculates emission factors as configured for the pipeline. It also supports pipeline aggregations, and metrics.

- Data type pipeline
> A `data` pipeline ingests any type of data, and transforms it to any kind of output based on the pipeline configuration. This is typically used for non-timeseries data. It does not support pipeline aggregations or metrics.

- Impacts type pipeline
> An `impacts` pipeline allows for the bulk creation and/or updating of impacts (and its emission factors) based on the provided input. It does not support pipeline aggregations or metrics.

## FAQ's

### How do you specify the pipeline type ?

When defining a new pipeline you can specify 'type' property on the pipeline configuration.

#### EXAMPLE

```json
{
	...
	"type": "activities",
	...
}
```

### What happens to my existing pipeline if they were not initialized by specifying the type property ?
If no type is specified, type is defaulted to `activities`.

### What if I don't provide the 'type' property ?

The pipeline will be defaulted to be of type `activities`.

## Walkthrough

#### Creating an `activities` type pipeline

This is a simple activity pipeline that will calculate the monthly emission given zip code and kwh used by a facility.

REQUEST

```http
POST <PIPELINES_API>/pipelines

Headers:
    Content-Type: application/json
    Accept: application/json
    Accept-Version: 1.0.0
    Authorization: <REPLACE_WITH_AUTH_TOKEN>

Body:
{
  "connectorConfig": {
    "input": [
      {
        "name": "sif-csv-pipeline-input-connector"
      }
    ]
  },
  "attributes": {
  },
  "name": "activities_pipeline_sample",
  "description": "Activities Type Pipeline",
  "transformer": {
    "transforms": [
      {
        "index": 0,
        "formula": "AS_TIMESTAMP(:reading date,'M/d/yy')",
        "outputs": [
          {
            "description": "Timestamp of business activity.",
            "index": 0,
            "key": "time",
            "label": "Time",
            "type": "timestamp"
          }
        ]
      },
      {
        "index": 1,
        "formula": ":zipcode",
        "outputs": [
          {
            "description": "Zipcode where electricity consumption occurred",
            "index": 0,
            "key": "zipcode",
            "label": "Zip",
            "type": "string"
          }
        ]
      },
      {
        "index": 2,
        "formula": ":month",
        "outputs": [
          {
            "description": "Month of electricity consumption",
            "index": 0,
            "key": "month",
            "label": "Month",
            "type": "string"
          }
        ]
      },
      {
        "index": 3,
        "formula": ":kwh",
        "outputs": [
          {
            "description": "kWh of electricity consumption in the month",
            "index": 0,
            "key": "kwh",
            "label": "kWh",
            "type": "number"
          }
        ]
      },
      {
        "index": 4,
        "formula": "#electricity_emissions(:kwh,IMPACT(LOOKUP(LOOKUP(LOOKUP(:zipcode, 'ZipcodeToState', 'zipcode', 'state'), 'StatePrimaryGen', 'state', 'primary_gen'), 'GenToImpact', 'gen', 'if'), 'co2e', 'co2'))",
        "outputs": [
          {
            "description": "CO2e of electricty generation (in tonnes)",
            "index": 0,
            "key": "co2e",
            "label": "CO2e",
            "type": "number"
          }
        ]
      }
    ],
    "parameters": [
      {
        "index": 0,
        "key": "reading date",
        "type": "string"
      },
      {
        "index": 1,
        "key": "zipcode",
        "label": "Zipcode",
        "description": "Zipcode of electricity consumption",
        "type": "string"
      },
      {
        "index": 2,
        "key": "month",
        "label": "Month",
        "description": "Month of electricity generation",
        "type": "string"
      },
      {
        "index": 3,
        "key": "kwh",
        "label": "kWh",
        "description": "kWh of electricity generation in the month",
        "type": "number"
      }
    ]
  }
}

```
RESPONSE

```sh
HTTP: 201 Created
Content-Type: application/json

{
	"createdAt": "2023-03-24T19:41:41.084Z",
	"createdBy": "someone@somewhere.com",
	"id": "01gwaj87awnqahcdpqdb3ps6zp",
	"type": "activities"
	...
}
```

#### Creating a `data` type pipeline

This is a simple data pipeline that uses [SIF CaML](../../../../../java/apps/calculator/docs/expressions.md#caml-function) function to map the input product/name description to its EIO industry sector (we will only return top 2 matches for simplicity) and the co2e per dollar associate with the sector.

REQUEST

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

RESPONSE

```sh
HTTP: 201 Created
Content-Type: application/json

{
	"createdAt": "2023-03-24T19:41:41.084Z",
	"createdBy": "someone@somewhere.com",
	"id": "01gwaj87awnqahcdpqdb3ps6zp",
	"type": "data"
	...
}
```

#### Creating a `impacts` type pipeline

> Note: when creating impacts type pipeline, there are mandatory transform outputs required which are:  [activityName, impactName, componentKey, componentValue, componentType]

This is an `impacts` pipeline which will use the output generated by the previous data pipeline to create impact resources. The `data` pipeline output the top 2 matches and default the chosen industry code to the first one. The `chosen_value` column allows user to override the match.

REQUEST

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
                "formula": "SWITCH(:chosen_value,1,:co2ePerDollar_1,2,:co2ePerDollar_2)",
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
                "index": 0,
                "key": "chosen_value",
                "type": "number"
            },
            {
                "index": 0,
                "key": "co2ePerDollar_1",
                "type": "number"
            },
            {
                "index": 0,
                "key": "co2ePerDollar_2",
                "type": "number"
            }
        ]
    }
}
```

RESPONSE

```sh
HTTP: 201 Created
Content-Type: application/json

{
	"createdAt": "2023-03-24T19:41:41.084Z",
	"createdBy": "someone@somewhere.com",
	"id": "01gwaj87awnqahcdpqdb3ps6zp",
	"type": "impacts"
	...
}
```

