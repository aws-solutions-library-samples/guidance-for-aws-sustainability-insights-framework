# Access Management Overview

## Introduction

The _Access Management_ module has accountability for:

- Groups and permission management
- User management

It allows for the creation of user defined groups that represent something significant to the customer by which
permissions are managed. Examples include an organization business unit structure, internal team structure, end customer
accounts and sub accounts, or any combination of.

Groups are hierarchical (groups may have any number of sub groups, but a group may only have a single parent).

When users are created they are granted access to one or more of these groups along with a role assigned specific to
that group. The supported roles are:

- `admin`
- `contributor`
- `reader`

Out of the box, a global group `/` is automatically created which grants access to the entire platform. An administrator
user is created (email to be provided at deployment time) and added as a member to the global `/` group with the `admin`
role.

It is recommended that sub-groups are created as needed to manage permissions rather than assigning all users (with
exception of admins) to `/`.

The following example grants `admin` access to the `/usa/northwest` group and all its child groups, and `contributor`
access to the `/usa/southwest` group and all its child groups. It would not however grant any access to any other
children of `/usa` such as `/usa/southeast`.

**Follow [this](./docs/simpleTenant.md) example for a use-case specific walkthrough for a simple compartmentalized tenant onboarding**

```json
{
	"email": "someone@somewhere.com",
	"groups": {
		"/usa/northwest": "admin",
		"/usa/southwest": "contributor"
	}
}
```

## REST API

Refer to the [Swagger](./docs/swagger.json) for a detailed list of the available REST API endpoints.

## Walkthrough

### Pre-requisite

As part of the `sif-core` deployment, a root (`/`) group and a user assigned to the group will be created by
the [seed construct](../../../../infrastructure/tenant/src/accessManagement/accessManagementSeed.construct.ts).

You will need to log on as this admin user under the context of the root group to run the following examples.

### Example 1 - Creating a new sub-group

Only `admin` of the group in context may create new groups.

A sub-group can be created belonging to the root `/` group by running the following command:

#### Request

```sh
POST /groups
Accept: application/json
Accept-Version: 1.0.0
Content-Type: application/json
Authorization: <INSERT TOKEN>

{
  "name": "USA"
}
```

#### Response

```sh
HTTP: 201 Created
Content-Type: application/json

{
    "id": "/usa",
    "name": "USA",
    "state": "active",
    "createdBy": "someone@example.com",
    "createdAt": "2022-10-27T01:08:18.407Z"
}
```

### Example 2 - Retrieve group details

Only members of the group in context may retrieve details of a group.

You can retrieve the detail of a group by running the following command.

Note that whenever providing a group id as part of a path it must be url encoded, therefore the group `/usa` would be passed as `%2fusa`:

#### Request


```sh
GET /groups/<encoded_group_id>
Accept: application/json
Accept-Version: 1.0.0
Authorization: <INSERT TOKEN>
```

#### Response

```sh
HTTP: 200 OK
Content-Type: application/json

{
	"id": "/usa",
	"name": "USA",
	"state": "active",
	"createdBy": "someone@example.com",
	"createdAt": "2022-10-27T01:08:18.407Z"
}

```

### Example 3 - Retrieve list of sub-groups

Only members of the group in context may list its sub-groups.

You can list all the groups that have been created in the systems by running the following command:

#### Request

```sh
GET /groups
Accept: application/json
Accept-Version: 1.0.0
Authorization: <INSERT TOKEN>
```

#### Response

```sh
HTTP: 200 OK
Content-Type: application/json

{
    "groups": [
        {
            "id": "/usa",
            "name": "USA",
            "state": "active",
            "createdBy": "someone@example.com",
            "createdAt": "2022-10-27T01:08:18.407Z"
        }
    ]
}
```

### Example 4 - Modify the description of a group

Only `admin` of the group in context may modify the detail of the group.

You can modify the group description by issuing the following command:

#### Request

```sh

PATCH /groups/<encoded_group_id>
Accept: application/json
Accept-Version: 1.0.0
Content-Type: application/json
Authorization: <INSERT TOKEN>

{
  "description": "group USA has been modified"
}
```

#### Response

```sh
HTTP: 200 OK
Content-Type: application/json

{

    "id": "/usa",
    "description": "group USA has been modified",
    "updatedBy": "someone@example.com",
    "updatedAt": "2022-10-27T01:54:32.084Z"
}
```

### Example 5 - Set group state To disabled (prior to deletion)

Only `admin` of the group in context may modify `state` of the group.

You can set the group state to `disabled` by issuing the following command:

#### Request

```sh
PATCH /groups/<encoded_group_id>
Accept: application/json
Accept-Version: 1.0.0
Content-Type: application/json
Authorization: <INSERT TOKEN>

{
  "state": "disabled"
}
```

#### Response

```sh
HTTP: 200 OK
Content-Type: application/json

{
    "id": "/usa",
    "state": "disabled",
    "updatedBy": "someone@example.com",
    "updatedAt": "2022-10-27T01:54:32.084Z"
}
```

### Example 6 - Delete group

A group must be disabled before it can be deleted (see example 5).

Only `admin` of the group in context may delete the group.

You can delete the group from the system by running the following command:

#### Request

```sh
DELETE /groups/<encoded_group_id>
Accept: application/json
Accept-Version: 1.0.0
Authorization: <INSERT TOKEN>
```

#### Response

```
HTTP: 204 No Content
```

### Example 7 - Create user in a group

To run all the examples below, we will log on using our admin user under the group `/usa` that we had created in the
previous example. Only users with role `reader` and above can list all users in context.

You can create user under the `/usa` group by running the following command:

#### Request

```sh
POST /users
Accept: application/json
Accept-Version: 1.0.0
Content-Type: application/json
Authorization: <INSERT TOKEN>

{
  "email": "your@user.com",
  "role": "contributor"
}
```

#### Response

```sh
HTTP: 200 OK
Content-Type: application/json

{
    "email": "your@user.com",
    "state": "invited",
    "groups": {
        "/usa": "contributor"
    },
    "createdAt": "2022-10-27T02:25:40.237Z",
    "createdBy": "someone@example.com"
}
```

### Example 8 - Retrieve details of a user

Only users with role `reader` and above can retrieve details of an existing user.

You can retrieve a user's details by running the following command. Note that the email will need to be url encoded as its provided as part of the url path,
e.g. `your%40user.com` is the url encoding of `your@user.com`:

#### Request

```sh
GET /users/<encoded_email>
Accept: application/json
Accept-Version: 1.0.0
Authorization: <INSERT TOKEN>
```

#### Response

```sh
HTTP: 200 OK
Content-Type: application/json

{
	"email": "your@user.com",
	"state": "invited",
	"groups": {
		"/usa": "contributor"
	},
	"createdAt": "2022-10-27T02:25:40.237Z"
}
```

### Example 9 - List all users for the group in context

Only users with role `reader` and above can list all users in context.

You can list all the users by running the following command:

#### Request

```sh
GET /users
Accept: application/json
Accept-Version: 1.0.0
Authorization: <INSERT TOKEN>
```

#### Response

```sh
HTTP: 200 OK
Content-Type: application/json

{
    "users": [
        {
            "email": "your@user.com",
            "state": "invited",
            "groups": {
                "/usa": "contributor"
            },
            "createdAt": "2022-10-27T02:25:40.237Z"
        },
        {
            "email": "someone@example.com",
            "state": "active",
            "groups": {
                "/": "admin"
            },
            "createdAt": "2022-10-05T00:21:27.477Z",
            "createdBy": "installer"
        }
    ]
}
```

### Example 10 - Modify user password

Only users with role `reader` and above can update their own password. Users with `admin` role may update any user
status where they are themselves an admin of all the groups the user is a member of.

You can update the user password by running the following command:

#### Request

```sh
PATCH /users/<encoded_email>
Accept: application/json
Accept-Version: 1.0.0
Content-Type: application/json
Authorization: <INSERT TOKEN>

{
  "password": "my_new_password"
}
```

#### Response

```sh
HTTP: 204 No Content
```

### Set user To inactive

Only users with role `admin` can set user to inactive.

You can disable a user by running the following command:

#### Request

```sh
PATCH /users/<encoded_email>
Accept: application/json
Accept-Version: 1.0.0
Content-Type: application/json
Authorization: <INSERT TOKEN>

{
  "state": "inactive"
}
```

#### Response

```sh
HTTP: 204 No Content
```

### Delete user

Only users with role `admin` can set user to delete user.

You can disable user by running the following command:

#### Request

```sh
DELETE /users/<encoded_email>
Accept: application/json
Accept-Version: 1.0.0
Authorization: <INSERT TOKEN>
```

#### Response

```sh
HTTP: 204 No Content
```

## High Level Architecture

![hla](docs/images/access-management.hla-physical-runtime.drawio.png)

