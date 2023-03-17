# Impact Components

## Introduction

This module allows the user to manage components of a particular impact.

## REST API

Refer to the [Swagger](./swagger.json) for a detailed list of the available REST API endpoints.

## Walkthrough

### Pre-requisite

For this walkthrough, we assume that user had been logged in, has the right permission and the group context is set to `/group1` in the id token generated
by `Cognito`.

For more details access controls and permissions, look at the [Access Management](../../access-management/README.md) module.

### Example 1: Creating an component

#### Request

You can create the impact using as shown below:

```shell
curl --location --request POST 'http://<ACTIVITIES_URL>/activities/<activityId>/impacts/<impactId>/components/<componentKey>' \
	--header 'Accept-Version: 1.0.0' \
	--header 'Content-Type: multipart/form-data' \
	--header 'Content-Type: application/json'
	--header 'Authorization: <token>' \
	----data-raw '
                {
                    "value": 5.304733389,
                    "type": "pollutant",
                    "label": "",
                    "description": ""
                }
```

#### Response

```sh
HTTP: 201 OK
Content-Type: application/json

{
    "key": "co2",
    "value": 5.304733389,
    "type": "pollutant",
    "label": "",
    "description": ""
}
```

### Example 2: Retrieving The Newly Created component

Using the impact id, impact name and component key from the previous example, you can then retrieve the component by issuing the following command:

#### Request

```shell
GET /activities/<activityId>/impacts/<impactName>/components/<componentKey>
Accept: application/json
```

#### Response

```shell
Content-Type: application/application/json

{
    "key": "co2",
    "value": 5.304733389,
    "type": "pollutant",
    "label": "",
    "description": ""
}

```

### Example 3: Listing All components in your impact

If you create multiple components in an impact, you can list all of them by issuing the following commands (this will return all impacts in your **current
impact**):

#### Request

```shell
GET /activities<activityId>/impacts/<impactName>/components
Accept: application/json
```

#### Response

```shell
Content-Type: application/application/json
{

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
        ],
	"pagination": {
        "count": 5
    }
        }

```

### Example 4: Modifying an component

You can modify the component as shown below:

```shell
PATCH /activities/<activityId>/impacts/<impactId>/components/<componentKey>
Accept: application/json
Content-Type: application/json

{
    "value": 1234,
    "label": "updated label",
    "type": "type",
    "description": "updated description"
}
```

#### Response

```sh
HTTP: 200
Content-Type: application/json

{
    "key": "co2",
    "value": 1234,
    "label": "updated label",
    "type": "type",
    "description": "updated description"
}
```

