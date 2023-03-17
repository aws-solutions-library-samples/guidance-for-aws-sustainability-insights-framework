# Calculations Overview

## Introduction

This module allows one to create user-defined calculations that can then be used as part of pipeline transforms, and/or called from other user-defined calculations.

## REST API

Refer to the [Swagger](docs/swagger.json) for a detailed list of the available REST API endpoints.

## Walkthrough

The following walkthrough introduces the different features available via this module.

### Step 1 : Define a new calculation

The following example defines a simple function that takes 2 numbers as an input and adds them together.

The `name` is what uniquely identifies the calculation within a group.

The `formula` represents the equation itself. Tokens prefixed with a `:` in the formula represent parameter inputs, therefore the equation `:left+:right` can be described as _take the parameter `left` and add it to the parameter `right`_.

The `parameters` section describes the required input for the `formula`. Any parameters used in the formula must be defined here. Parameters are referenced in a formula by prefixing the key with a `:`. The `index` of the parameters represents the sequence of the parameters to be provided when calling the function. The `index` must start at `0`, increment by `1` sequentially per each parameter.

The `outputs` section describes the output value.

Finally, an optional `tags` section can be provided which allows one to search and filter calculations based on the tag values.

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

### Step 2 : Retrieving the calculation

Calculations can be retrieved by using their `id` as follows:

**Request**

```http
GET /calculations/<ID>
Accept: application/json
Accept-Version: 1.0.0
Authorization: <TOKEN>
```

**Response**

```http
... same response as step 1
```

Alternatively, if the calculation `name` is known but not its `id`, the calculation can be retrieved by searching via `name` as follows:

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
    "calculations:[
        ... same response as step 1
    ]
}
```

### Step 3 : Updating a calculation

Calculations, just like any other resource, are versioned. Any updates to the calculation will cause a new version to be created. The following call is an example of updating a calculation:

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

### Step 4 : Listing version of a calculation

The following call lists all versions of a specific calculation:

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

### Step 5 : Granting access to a group

When a calculation is first created it can only be accessible by users within the same group. To grant to other groups run the following:

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

### Step 6 : Revoking access to a group

As an opposite step to step 5, access to a group can be revoked as follows:

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
