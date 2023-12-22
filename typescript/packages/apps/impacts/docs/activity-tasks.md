# Activity Tasks

## Introduction

This document describes how to use the _Activity Task_ feature which allows activities to be uploaded in bulk and created asynchronously.
## REST API

For a comprehensive list of available REST API endpoints, please refer to the [Swagger documentation](./docs/swagger.json).

## Examples

- [Creating Activities in Bulk](#creating-activities-in-bulk)
- [Retrieving an Activity Task](#retrieving-an-activity-task)
- [Listing Items Associated with a Task](#listing-items-associated-with-a-task)
- [Listing All Activity Tasks](#listing-all-activity-tasks)

### Creating Activities in Bulk

**Request**

Activities may be created in bulk by means of a activity task as follows:

```http
POST /activityTasks
Accept: application/json
Accept-Version: 1.0.0
Authorization: <INSERT TOKEN>

{
    "type": "create",
    "activities": [
        ... list of activities
    ]
}
```

**Response**

```http
HTTP: 201 OK
Content-Type: application/json

{
    "type": "create",
    "id": "01ght23j2ra2dspc9ak50a01e3",
    "taskStatus": "waiting",
    "batchesTotal": 1,
    "batchesCompleted": 0,
    "itemsTotal": 3,
    "itemsSucceeded": 0,
    "itemsFailed": 0,
    "progress": 0,
    "groups": [
        "/"
    ],
    "createdAt": "2022-11-14T03:14:41.881Z",
    "createdBy": "someone@example.com"
}
```

### Retrieving an Activity Task

Retrieve the status of the activity task using its `id` as follows:

**Request**

```http
GET /activityTask/<taskId>
Accept: application/json
Accept-Version: 1.0.0
Authorization: <INSERT TOKEN>
```

**Response**

```http
HTTP: 200 OK
Content-Type: application/json

{
    "type": "create",
    "id": "01ght23j2ra2dspc9ak50a01e3",
    "taskStatus": "success",
    "batchesTotal": 1,
    "batchesCompleted": 1,
    "itemsTotal": 3,
    "itemsSucceeded": 1,
    "itemsFailed": 0,
    "progress": 100,
    "groups": [
        "/"
    ],
    "createdAt": "2022-11-14T03:14:41.881Z",
    "createdBy": "someone@example.com",
    "updatedAt": "2022-11-14T03:16:17.578Z",
    "updatedBy": "someone@example.com"
}

```

### Listing Items Associated with a Task

A task item maps to each original activity provided as part of the task at time of creation.

**Request**

```http
GET /activityTasks/<TASK_ID>/taskItems
Accept: application/json
Accept-Version: 1.0.0
Authorization: <INSERT TOKEN>
```

**Response**

```http
HTTP: 200 OK
Content-Type: application/json

{
    "taskItems": [
        {
            "name": "test:activity:1",
            "taskId": "test:activity:1",
            "status": "failure",
            "statusMessage": "Name 'test:activity:1' already in use."
        },
        ... more task items
    ]
}
```

Task items can be filtered by status, e.g. to list all failed tasks:

**Request**

```http
GET /activityTasks/<TASK_ID>/taskItems?status=failure
Accept: application/json
Accept-Version: 1.0.0
Authorization: <INSERT TOKEN>
```

**Response**

```http
HTTP: 200 OK
Content-Type: application/json

{
    "taskItems": [
        ... all failed task items
    ]
}
```

### Listing All Activity Tasks

Activity Tasks may be listed as follows:

**Request**

```http
GET /activityTasks
Accept: application/json
Accept-Version: 1.0.0
Authorization: <INSERT TOKEN>
```

**Response**

```http
HTTP: 200 OK
Content-Type: application/json
{
    "tasks": [{
        ... list of activity tasks
    }]
}

```
