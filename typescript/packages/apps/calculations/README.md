# Calculations Overview

## Introduction

The Calculations module enables users to define custom calculations. These calculations can be integrated into pipeline transformations or invoked within other user-defined calculations.

## REST API

For a comprehensive list of available REST API endpoints, please refer to the [Swagger documentation](./docs/swagger.json).

## Examples

The following examples introduce the different features available via this module.

- [Defining a New Calculation](#defining-a-new-calculation)
- [Retrieving a calculation](#retrieving-a-calculation)
- [Updating a Calculation](#updating-a-calculation)
- [Listing Calculation Versions](#listing-calculation-versions)
- [Granting Group Access](#granting-group-access)
- [Revoking Group Access](#revoking-group-access)

To learn more about the expressions that can be used to build new functions, refer to the [calculator expressions](../../../../java/apps/calculator/docs/expressions.md).

### Defining a New Calculation

Below is an example of a simple function that adds two numbers:

- `name`: A unique identifier for the calculation within a group.
- `formula`: The equation itself. Tokens with a : prefix in the formula denote parameter inputs. For instance, the equation :left+:right means add the left parameter to the right parameter.
- `parameters`: Describes the required input for the formula. Parameters used in the formula must be defined here and are referenced by prefixing the key with a :.
- `outputs`: Describes the output value.
- `tags` (optional): Allows for searching and filtering calculations based on tag values.

**Request**

```http
POST /calculations
Accept: application/json
Accept-Version: 1.0.0
Content-Type: application/json
Authorization: <TOKEN>

{
    "name": "custom_add",
    "summary": "Adds 2 numbers.",
    "formula": ":left+:right",
    "parameters": [
        {
            "index": 0,
            "key": "left",
            "label": "left",
            "description": "left side of operand",
            "type": "number"
        },
        {
            "index": 1,
            "key": "right",
            "label": "right",
            "description": "right side of operand",
            "type": "number"
        }
    ],
    "outputs": [{
        "name": "sum",
        "description": "The total.",
        "type": "number"
    }],
    "tags": {
        "datasource": "GHG Protocol",
        "type": "Material/Metal/Steel"
    }
}
```

**Response**

```http
Content-Type: application/json

{
    "id": "01arz3ndektsv4rrffq69g5fav".
    "name": "custom_add",
    "summary": "Adds 2 numbers.",
    "formula": ":left+:right",
    "parameters": [
        {
            "index": 0,
            "key": "left",
            "label": "left",
            "description": "left side of operand",
            "type": "number"
        },
        {
            "index": 1,
            "key": "right",
            "label": "right",
            "description": "right side of operand",
            "type": "number"
        }
    ],
    "outputs": [{
        "name": "sum",
        "description": "The total.",
        "type": "number"
    }],
    "tags": {
        "datasource": "GHG Protocol",
        "type": "Material/Metal/Steel"
    },
    "groups": ["/"],
    "version": 1,
    "state": "enabled",
    "createdBy": "someone@example.com",
    "createdAt": "2022-08-10T23:55:20.322Z"
}
```

Once created, the above calculation would be referenced in transforms and formulas as `#custom_add(?,?)` where the first parameter represents the value for `left` and the second for `right`. Note that when referencing custom functions their `name` is prefixed with `#`.

### Retrieving a Calculation

You can fetch a calculation using its `id`:

**Request**

```http
GET /calculations/<ID>
Accept: application/json
Accept-Version: 1.0.0
Authorization: <TOKEN>
```

**Response**

> same response body as as [Defining a New Calculation](#defining-a-new-calculation)

Or, if you know the calculation's `name` but not its `id`, you can search by `name`:

**Request**

```http
GET /calculations?name=<NAME>
Accept: application/json
Accept-Version: 1.0.0
Authorization: <TOKEN>
```

**Response**

```http
{
    "calculations": [
        ...
    ]
}
```

### Updating a Calculation

Calculations are versioned. Any updates will create a new version:

**Request**

```http
PATCH /calculations/<ID>
Accept: application/json
Accept-Version: 1.0.0
Content-Type: application/json
Authorization: <TOKEN>

{
    "summary": "Adds 2 numbers together."
}
```

**Response**

```http
Content-Type: application/json

{
    "id": "01arz3ndektsv4rrffq69g5fav".
    "name": "custom_add",
    "summary": "Adds 2 numbers together.",
    "formula": ":left+:right",
    "parameters": [
        {
            "index": 0,
            "key": "left",
            "label": "left",
            "description": "left side of operand",
            "type": "number"
        },
        {
            "index": 1,
            "key": "right",
            "label": "right",
            "description": "right side of operand",
            "type": "number"
        }
    ],
    "outputs": [{
        "name": "sum",
        "description": "The total.",
        "type": "number"
    }],
    "tags": {
        "datasource": "GHG Protocol",
        "type": "Material/Metal/Steel"
    },
    "groups": ["/"],
    "version": 2,
    "state": "enabled",
    "createdBy": "someone@example.com",
    "createdAt": "2022-08-10T23:55:20.322Z",
    "updatedBy": "someone@example.com",
    "updatedAt": "2022-08-13T05:23:55.966Z"
}
```

### Listing Calculation Versions

To view all versions of a specific calculation:

**Request**

```http
GET /calculations/<ID>/versions
Accept: application/json
Accept-Version: 1.0.0
Authorization: <TOKEN>
```

**Response**

```http
Content-Type: application/json

{
    "calculations:[
        ... all versions of the calculation
    ]
}
```

### Granting Group Access

By default, a new calculation is only accessible to users within the same group hierarchy. To grant access to other groups:

**Request**

```http
PUT /calculations/<ID>/groups<ENCODED_GROUP_ID>
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
DELETE /calculations/<ID>/groups<ENCODED_GROUP_ID>
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

If you'd like to delve deeper into the Calculations module:

- Refer to the [High Level Architecture](../../../../docs/design.md#calculations) to grasp how we utilize various AWS services.
- To learn about our data structure and storage, view the [Data Layer Design](./docs/datalayer.md).

