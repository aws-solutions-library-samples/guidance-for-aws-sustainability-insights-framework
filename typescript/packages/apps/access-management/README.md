# Access Management Overview

## Introduction

The _Access Management_ module is responsible for:

- Managing groups and permissions
- User administration
- Authentication and authorization processes

This module enables the creation of group hierarchies that typically represent an organization's reporting boundaries (e.g. [determining organizational boundaries](https://www.epa.gov/climateleadership/determine-organizational-boundaries#:~:text=The%20GHG%20inventory%20guidance%20documents,scope%201%20and%20scope%202.) for use with GHG Protocol), along with representing anything significant to an organization by which permissions would be managed (e.g. internal team structures).

Groups are structured hierarchically. While a group can have multiple sub-groups, it can only have one parent group.

Upon user creation, they are associated with one or more groups and assigned a specific role within each group. The roles available are:

- `admin`
- `contributor`
- `reader`

For a breakdown of features available per role, refer to the respective module's Swagger documentation.

By default, a root group `/` is created, and an administrator user is added to this group with the `admin` role. This user's credentials are sent to the email provided during deployment.

For optimal permission management, it's recommended to set up group hierarchies as needed rather than assigning all users to the root group `/`. Group hierarchies should reflect the unique structure of each organization. Considering both broad organizational boundaries for GHG reporting and more detailed levels for permission management, example group hierarchy structures could include:

-  `/<holding company>/<subsidiary>/<geo>/<site>`
-  `/<geo>/<subsidiary>/<site>/<team>`
-  `/<business unit>/<site>/<team>`

Users must be associated with at least one group. For instance, a user with the `admin` role in `/acme corporation/acme plastics` can create sub-groups and users within that hierarchy. The same user, if granted the `reader` role in `/acme corporation/acme vehicle rentals`, would have read-only access to that hierarchy too.

Assigning a user to a specific group grants them that role for all sub-groups within the same hierarchy. For example, a user with `reader` access to `/acme corporation/acme vehicle rentals` also has reader access to all its sub-groups.

With SIF, all operations occur within the context of a group. Upon authentication, users are assigned a group in context based on their default group configuration.

When using SIF modules, the group context is derived from the user's authentication token. However, this can be overridden in any REST API call by setting the `x-groupcontextid` request header with a `groupId`. This feature is handy when a user wants to operate in another authorized group without re-authenticating.

## REST API

For a comprehensive list of available REST API endpoints and permissions, refer to the [Swagger documentation](./docs/swagger.json).

## Examples

To obtain the required authorization token for API invocation, execute the following command:

```shell
sif instance auth -e <environment> -t <tenant> -g <group id> -u <username> -p <password>
```

All examples assume the user is an admin of the root group `/`, derived from their authorization token. Alternatively, the `x-groupcontextid` header can be set to override the group context.

When providing a groupId as part of a path or a query string, it must be url encoded. E.g., if needing to provide the groupId `/acme corporation`, its url encoded version `%2Facme%20corporation` should be used instead.

- [Creating a new group](#creating-a-new-group)
- [Retrieve a group's details](#retrieve-a-groups-details)
- [Retrieve list of groups](#retrieve-list-of-groups)
- [Modify the description of a group](#modify-the-description-of-a-group)
- [Disable a group](#disable-a-group)
- [Delete a group](#delete-a-group)
- [Create a user within a different group](#create-a-user-within-a-different-group)
- [Retrieve details of a user](#retrieve-details-of-a-user)
- [List users](#list-users)
- [Change user password](#change-user-password)
- [Deactivating a user](#deactivating-a-user)
- [Deleting a user](#deleting-a-user)

### Creating a new group

Creates a new group named `Acme Corporation` belonging to the root group `/`. The new group will have the groupId `/acme corporation`.

**Request**

```sh
POST /groups
Accept: application/json
Accept-Version: 1.0.0
Content-Type: application/json
Authorization: <INSERT TOKEN>

{
  "name": "Acme Corporation"
}
```

**Response**

```sh
HTTP: 201 Created
Content-Type: application/json

{
    "id": "/acme corporation",
    "name": "Acme Corporation",
    "state": "active",
    "createdBy": "someone@example.com",
    "createdAt": "2022-10-27T01:08:18.407Z"
}
```

### Retrieve a group's details

Retrieves details of the group `/acme corporation`.


**Request**


```sh
GET /groups/%2Facme%20corporation
Accept: application/json
Accept-Version: 1.0.0
Authorization: <INSERT TOKEN>
```

**Response**

```sh
HTTP: 200 OK
Content-Type: application/json

{
    "id": "/acme corporation",
    "name": "Acme Corporation",
    "state": "active",
    "createdBy": "someone@example.com",
    "createdAt": "2022-10-27T01:08:18.407Z"
}

```

### Retrieve list of groups

Lists all sub-groups of `/`.



**Request**

```sh
GET /groups
Accept: application/json
Accept-Version: 1.0.0
Authorization: <INSERT TOKEN>
```

**Response**

```sh
HTTP: 200 OK
Content-Type: application/json

{
  "groups": [
     {
      "id": "/acme corporation",
      "name": "Acme Corporation",
      "state": "active",
      "createdBy": "someone@example.com",
      "createdAt": "2022-10-27T01:08:18.407Z"
    }
  ]
}
```

### Modify the description of a group

Sets the description of group `/acme corporation`.

**Request**

```sh

PATCH /groups/%2Facme%20corporation
Accept: application/json
Accept-Version: 1.0.0
Content-Type: application/json
Authorization: <INSERT TOKEN>

{
  "description": "this group has been modified"
}
```

**Response**

```sh
HTTP: 200 OK
Content-Type: application/json

{
  "id": "/acme corporation",
  "name": "Acme Corporation",
  "description": "this group has been modified"
  "state": "active",
  "createdBy": "someone@example.com",
  "createdAt": "2022-10-27T01:08:18.407Z",
  "updatedBy": "someone@example.com",
  "updatedAt": "2022-10-27T01:54:32.084Z"
}
```

### Disable a group

Disable the group `/acme corporation` which will prevent anyone from logging into the group.

**Request**

```sh
PATCH /groups/%2Facme%20corporation
Accept: application/json
Accept-Version: 1.0.0
Content-Type: application/json
Authorization: <INSERT TOKEN>

{
  "state": "disabled"
}
```

**Response**

```sh
HTTP: 200 OK
Content-Type: application/json

{
  "id": "/acme corporation",
  "name": "Acme Corporation",
  "state": "disabled",
  "createdBy": "someone@example.com",
  "createdAt": "2022-10-27T01:08:18.407Z",
  "updatedBy": "someone@example.com",
  "updatedAt": "2022-10-27T01:54:32.084Z"
}
```

### Delete a group

A group must be disabled (see example 5), as well as no longer having users associated, before it can be deleted.

**Request**

```sh
DELETE /groups/%2Facme%20corporation
Accept: application/json
Accept-Version: 1.0.0
Authorization: <INSERT TOKEN>
```

**Response**

```
HTTP: 204 No Content
```

### Create a user within a different group

Creates the user `someoneelse@example.com` as a `contributor` to the group `/acme corporation` which is different to the group `/` that the caller is logged into by overriding the group in context using the `x-groupcontextid` header.

**Request**

```sh
POST /users
Accept: application/json
Accept-Version: 1.0.0
Content-Type: application/json
Authorization: <INSERT TOKEN>
x-groupcontextid: /acme corporation

{
  "email": "someoneelse@example.com",
  "role": "contributor"
}
```

**Response**

```sh
HTTP: 200 OK
Content-Type: application/json

{
    "email": "someoneelse@example.com",
    "state": "invited",
    "groups": {
        "/acme corporation": "contributor"
    },
    "createdAt": "2022-10-27T02:25:40.237Z",
    "createdBy": "someone@example.com"
}
```

### Retrieve details of a user

Retrieves the details of `someoneelse@example.com`.

**Request**

```sh
GET /users/someoneelse%40example.com
Accept: application/json
Accept-Version: 1.0.0
Authorization: <INSERT TOKEN>
```

**Response**

```sh
HTTP: 200 OK
Content-Type: application/json

{
    "email": "someoneelse@example.com",
    "state": "invited",
    "groups": {
        "/": "contributor"
    },
    "createdAt": "2022-10-27T02:25:40.237Z",
    "createdBy": "someone@example.com"
}
```

### List users

Lists all users associated with the group `/` in context.
**Request**

```sh
GET /users
Accept: application/json
Accept-Version: 1.0.0
Authorization: <INSERT TOKEN>
```

**Response**

```sh
HTTP: 200 OK
Content-Type: application/json

{
    "users": [
        {
            "email": "someoneelse@example.com",
            "state": "invited",
            "groups": {
                "/": "contributor"
            },
            "createdAt": "2022-10-27T02:25:40.237Z",
            "createdBy": "someone@example.com"
        }
    ]
}
```

### Change user password

Update the password of "someoneelse@example.com".

**Request**

```sh
PATCH /users/someoneelse%40example.com
Accept: application/json
Accept-Version: 1.0.0
Content-Type: application/json
Authorization: <INSERT TOKEN>

{
  "password": "my_new_password"
}
```

**Response**

```sh
HTTP: 204 No Content
```

### Deactivating a user

Deactivating the user "someoneelse@example.com" so that user would no longer be able to log in.


**Request**

```sh
PATCH /users/someoneelse%40example.com
Accept: application/json
Accept-Version: 1.0.0
Content-Type: application/json
Authorization: <INSERT TOKEN>

{
  "state": "disabled"
}
```

**Response**

```sh
HTTP: 204 No Content
```

### Deleting a user

Deleting the user "someoneelse@example.com".

**Request**

```sh
DELETE /users/someoneelse%40example.com
Accept: application/json
Accept-Version: 1.0.0
Authorization: <INSERT TOKEN>
```

**Response**

```sh
HTTP: 204 No Content
```

## Deeper Dive

If you'd like to delve deeper into the design and implementation of the Access Management module:

- Refer to the [High Level Architecture](../../../../docs/design.md#access-Management) to grasp how we utilize various AWS services.
- For detailed insights on our authentication process, check out the [Cognito implementation](./docs/cognito.md).
- To learn about our data structure and storage, view the [Data Layer Design](./docs/datalayer.md).
- Our approach to granting authorization to resources is explained in[Managing Resource Group Authorization](./docs/resourceGroupMembership.md)
