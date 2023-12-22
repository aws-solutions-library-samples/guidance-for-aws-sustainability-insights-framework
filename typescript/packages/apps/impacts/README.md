# Impacts Overview

## Introduction

The Impacts module allows users to manage a catalog of activity impact factors, such as greenhouse gas emission factors. These factors are used as part of [pipeline transformations](../pipelines/README.md) and custom [calculations](../calculations/README.md) to calculate the impact of activities.

## REST API

For a comprehensive list of available REST API endpoints, please refer to the [Swagger documentation](./docs/swagger.json).

## Best Practices

As you may have many different impact factor datasets defined, a strategy of annotating them is required such that they are easily discoverable within the framework for use. An example strategy that could be followed is:

- An `activity` represents a specific line item of a specific sourced dataset, e.g. impacts related to a 1973 gas powered on-road passenger car.
- An `impact` represents the impact of the activity, e.g. `greenhouse emissions` in grams per mile.
- `Components` represent the impact factor of the activity/impact, e.g. impact factor of `CH₄` and `N₂O`.
- Activity `name` follows the convention `<provider>:<dataset>:<item>`, e.g. `usepa:mobile_ch4_n2o_on_road_gas:passenger_1973`.
- For auditability purpose, `source` stored an `attribute`.
- `provider`, `dataset`, `item`, and `version`, stored as `tags` to facilitate searching.
## Examples

The following examples introduce the different features available via this module, following the best practices described above.

- [Defining an Activity Impact](#defining-an-activity-impact)
- [Retrieving an Activity](#retrieving-an-activity)
- [Listing Activities](#listing-activities)
- [Updating an Activity](#updating-an-activity)
- [Listing Activity Versions](#listing-activity-versions)
- [Listing Activities By Tags](#listing-activities-by-tags)
- [Granting Group Access](#granting-group-access)
- [Revoking Group Access](#revoking-group-access)

### Defining an Activity Impact

Below is an example that defines the CH₄ and N₂O GHG emission factors as provided by US EPA for a 1973 on-road gas passenger vehicle.

**Request**

```http
POST /activities
Accept: application/json
Accept-Version: 1.0.0
Content-Type: application/json
Authorization: <TOKEN>

{
    "name": "usepa:mobile_ch4_n2o_on_road_gas:passenger_1973",
    "description": "Mobile combustion based emission factors for gasoline 1973 passenger cars.",
    "attributes": {
        "source": "[ghg-emission-factors-hub.xslx](https://www.epa.gov/system/files/documents/2023-03/ghg-emission-factors-hub.xlsx) - table 3."
    },
    "tags": {
        "provider": "US EPA",
        "dataset": "Mobile Combustion CH4 and N2O for On-Road Gasoline Vehicles",
        "item": "Passenger Car 1973",
        "version": "2023"
    },
    "impacts": {
        "ghg_emissions": {
            "name": "GHG Emissions",
            "attributes": {
                "unit": "g / mile"
            },
            "components": {
                "ch4": {
                    "key": "CH4",
                    "value": 0.1696,
                    "type": "pollutant"
                },
                "n2o": {
                    "key": "N2O",
                    "value": 0.0197,
                    "type": "pollutant"
                }
            }
        }
    }
}
```

**Response**

```http
HTTP: 201 OK
Content-Type: application/json

{
    "id": "01gg3yg1gsq3ne5dzy3khxnstf",
	"name": "usepa:mobile_ch4_n2o_on_road_gas:passenger_1973",
    "description": "Mobile combustion based emission factors for gasoline 1973 passenger cars.",
    "attributes": {
        "source": "[ghg-emission-factors-hub.xslx](https://www.epa.gov/system/files/documents/2023-03/ghg-emission-factors-hub.xlsx) - table 3."
    },
    "tags": {
        "provider": "US EPA",
        "dataset": "Mobile Combustion CH4 and N2O for On-Road Gasoline Vehicles",
        "item": "Passenger Car 1973",
        "version": "2023"
    },
    "impacts": {
        "ghg_emissions": {
            "name": "GHG Emissions",
            "attributes": {
                "unit": "g / mile"
            },
            "components": {
                "ch4": {
                    "key": "CH4",
                    "value": 0.1696,
                    "type": "pollutant"
                },
                "n2o": {
                    "key": "N2O",
                    "value": 0.0197,
                    "type": "pollutant"
                }
            }
        }
    },
    "version": 1,
    "state": "enabled",
    "groups": [
        "/"
    ],
    "createdBy": "someone@example.com",
    "createdAt": "2022-10-24T02:52:37.274Z"
}
```

### Retrieving an Activity

You can fetch an activity using its `id`:

**Request**

```http
GET /activities/<activityId>
Accept: application/json
Accept-Version: 1.0.0
Authorization: <TOKEN>
```

**Response**

> Same response body as [Defining an Activity Impact](#defining_an_activity_impact)

Or, if you know the activities `name` but not its `id`, you can search by `name`:

**Request**

```http
GET /activities?name=<NAME>
Accept: application/json
Accept-Version: 1.0.0
Authorization: <TOKEN>
```

**Response**

```http
{
    "activities": [
        ...
    ]
}
```

### Listing Activities

View all activities for your group in context as follows:

**Request**

```http
GET /activities
Accept: application/json
Accept-Version: 1.0.0
Authorization: <TOKEN>
```

**Response**

```http
Content-Type: application/json

{
    "activities": [
        ...
    ]
}

```

### Updating an Activity

Activities are versioned. Any updates will create a new version:

```http
PATCH /activities/<activityId>
Accept: application/json
Accept-Version: 1.0.0
Content-Type: application/json
Authorization: <TOKEN>

{
	"description": "updated description"
}
```

**Response**

```http
HTTP: 200
Content-Type: application/json

{
    "description":"updated description",
    ...
    "version": 2,
    "updatedAt": "2022-10-24T02:59:38.746Z",
    "updatedBy": "someone@example.com"
}
```

### Listing Activity Versions

To view all versions of a specific activity:

**Request**

```http
GET /activities/<activityId>/versions
Accept: application/json
Accept-Version: 1.0.0
Authorization: <TOKEN>
```

**Response**

```http
Content-Type: application/json

{
    "activities": [
        ... all versions of the activity
    ]
}
```

### Listing Activities By Tags

To find all activities that were tagged with `provider` of `US EPA` (note the encoded `tags` attribute, which if unencoded would read `tags=provider=US EPA`):

**Request**

```http
GET /activities?tags=provider%3DUS$20EPA
Accept: application/json
```

**Response**

```http
Content-Type: application/json
{
    "activities": [
        ... all activities with matching tags
    ]
}
```



### Granting Group Access

By default, a new Impact Activity is only accessible to users within the same group hierarchy. To grant access to other groups:

**Request**

```http
PUT /activities/<ID>/groups<ENCODED_GROUP_ID>
Accept: application/json
Accept-Version: 1.0.0
Authorization: <TOKEN>

```

**Response**

```http
Content-Type: application/json

204
```

### Revoking Group Access

To revoke group access:

**Request**

```http
DELETE /activities/<ID>/groups<ENCODED_GROUP_ID>
Accept: application/json
Accept-Version: 1.0.0
Authorization: <TOKEN>

```

**Response**

```http
Content-Type: application/json

204
```

## Deeper Dive

If you'd like to delve deeper into the Impacts module:

- The above examples are working with activities. Review the [Swagger](./docs/swagger.json) to see how to interact with impacts and components directly.
- If you need to create activities in bulk, read about [Activity Tasks](/docs/activity-tasks.md).
- Refer to the [High Level Architecture](../../../../docs/design.md#impacts) to grasp how we utilize various AWS services.
