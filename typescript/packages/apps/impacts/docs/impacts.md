# Activity Impacts

## Introduction

This module allows the user to manage impacts of a particular activity.


## REST API

Refer to the [Swagger](./swagger.json) for a detailed list of the available REST API endpoints.

## Walkthrough

### Pre-requisite

For this walkthrough, we assume that user had been logged in, has the right permission and the group context is set to `/group1` in the id token generated
by `Cognito`.

For more details access controls and permissions, look at the [Access Management](../../access-management/README.md) module.

### Example 1: Creating an impact

#### Request

You can create the impact using as shown below:

```shell
curl --location --request POST 'http://<ACTIVITIES_URL>/activities/<activityId>/impacts' \
	--header 'Accept-Version: 1.0.0' \
	--header 'Content-Type: multipart/form-data' \
	--header 'Content-Type: application/json'
	--header 'Authorization: <token>' \
	----data-raw '{
        {
            "name": "co2e",
            "attributes": {
                "unit": "kg"
            },
            "components": [
                {
                    "key": "co2",
                    "value": 5.304733389,
                    "type": "pollutant",
                    "label": "",
                    "description": ""
                },
                {
                    "key": "ch4",
                    "value": 0.002799332,
                    "type": "pollutant",
                    "label": "",
                    "description": ""
                },
                {
                    "key": "n2o",
                    "value": 0.002649367,
                    "type": "pollutant",
                    "label": "",
                    "description": ""
                },
                {
                    "key": "ipcc 2013 ar5 gwp 100",
                    "value": 5.310182088,
                    "type": "impactFactor",
                    "label": "",
                    "description": ""
                },
                {
                    "key": "ipcc 2016 ar4 gwp 100",
                    "value": 4.310182088,
                    "type": "impactFactor",
                    "label": "",
                    "description": ""
                }
            ]
        }
}
```

#### Response

```sh
HTTP: 201 OK
Content-Type: application/json


        {
            "name": "co2e",
            "attributes": {
                "unit": "kg"
            },
            "components": [
                {
                    "key": "co2",
                    "value": 5.304733389,
                    "type": "pollutant",
                    "label": "",
                    "description": ""
                },
                {
                    "key": "ch4",
                    "value": 0.002799332,
                    "type": "pollutant",
                    "label": "",
                    "description": ""
                },
                {
                    "key": "n2o",
                    "value": 0.002649367,
                    "type": "pollutant",
                    "label": "",
                    "description": ""
                },
                {
                    "key": "ipcc 2013 ar5 gwp 100",
                    "value": 5.310182088,
                    "type": "impactFactor",
                    "label": "",
                    "description": ""
                },
                {
                    "key": "ipcc 2016 ar4 gwp 100",
                    "value": 4.310182088,
                    "type": "impactFactor",
                    "label": "",
                    "description": ""
                }
            ]
        }
```

### Example 2: Retrieving The Newly Created Impact

Using the activity id and impact name from the previous example, you can then retrieve the impact by issuing the following command:

#### Request

```shell
GET /activities/<activityId>/impacts/<impactName>
Accept: application/json
```

#### Response

```shell
Content-Type: application/application/json
{
    "name": "co2e",
    "attributes": {
        "unit": "kg"
    },
    "components": [
        {
            "key": "co2",
            "value": 5.304733389,
            "type": "pollutant",
            "label": "",
            "description": ""
        },
        {
            "key": "ch4",
            "value": 0.002799332,
            "type": "pollutant",
            "label": "",
            "description": ""
        },
        {
            "key": "n2o",
            "value": 0.002649367,
            "type": "pollutant",
            "label": "",
            "description": ""
        },
        {
            "key": "ipcc 2013 ar5 gwp 100",
            "value": 5.310182088,
            "type": "impactFactor",
            "label": "",
            "description": ""
        },
        {
            "key": "ipcc 2016 ar4 gwp 100",
            "value": 4.310182088,
            "type": "impactFactor",
            "label": "",
            "description": ""
        }
    ]
}

```

### Example 3: Listing All impacts in your Activity

If you create multiple impacts in an activity, you can list all of them by issuing the following commands (this will return all impacts in your **current
activity**):

#### Request

```shell
GET /activities/<activityId>/impacts
Accept: application/json
```

#### Response

```shell
Content-Type: application/application/json
{
    "impacts": [
        {
            "name": "co2e",
            "attributes": {
                "unit": "kg"
            },
            "components": [
                {
                    "key": "co2",
                    "value": 5.304733389,
                    "type": "pollutant",
                    "label": "",
                    "description": ""
                },
                {
                    "key": "ch4",
                    "value": 0.002799332,
                    "type": "pollutant",
                    "label": "",
                    "description": ""
                },
                {
                    "key": "n2o",
                    "value": 0.002649367,
                    "type": "pollutant",
                    "label": "",
                    "description": ""
                },
                {
                    "key": "ipcc 2013 ar5 gwp 100",
                    "value": 5.310182088,
                    "type": "impactFactor",
                    "label": "",
                    "description": ""
                },
                {
                    "key": "ipcc 2016 ar4 gwp 100",
                    "value": 4.310182088,
                    "type": "impactFactor",
                    "label": "",
                    "description": ""
                }
            ]
        },
        {
            "name": "dummyimpact",
            "attributes": {
                "unit": "kg"
            },
            "components": [
                {
                    "key": "co2",
                    "value": 5.304733389,
                    "type": "pollutant",
                    "label": "",
                    "description": ""
                }
            ]
        }
    ],
    "pagination": {
        "count": 2
    }
}

```

### Example 4: Modifying an impact

You can modify the impact as shown below:

```shell
PATCH /activities/<activityId>/impacts/<impactId>
Accept: application/json
Content-Type: application/json

{
	"attributes": {
      "unit": "kg",
	  "dummyAttribute" : "dummyValue"
  	}
}
```

#### Response

```sh
HTTP: 200
Content-Type: application/json

{
    "name": "dummyimpact",
    "attributes": {
        "unit": "kg",
        "dummyAttribute": "dummyValue"
    },
    "components": [
        {
            "description": "",
            "label": "",
            "type": "pollutant",
            "value": 5.304733389,
            "key": "co2"
        }
    ]
}
```

You can also manage the underlying components of an impact please refer to [Impacts](./components.md)
