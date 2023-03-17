# Simple Tenant onboard and compartmentalization of resources

In this walk-through we will deploy SIF in a multi-tenant mode, where the framework owners are able to host compartmentalized (isolated) customers while also having the ability to access resources shared by the owner

A fresh installation of this framework will automatically create the root admin for the tenant who has full access to any groups created within that tenant. Based on our scenario above, how can we create other users and onboard customers without compromising security?

Business rules to be followed (for the purpose of this walk through)

- shared resources (activities, calculations) which are "readable" by all customers
- compartmentalized resources (activities, calculations, reference-datasets, pipelines) which are unique to customers
- shared resources can be modified only by the framework admins but can be read by all customers
- compartmentalized resources can only be modified by customer "admins", "contributors" and read by "readers"

Some terminology to understand

- A customer in our example above can be referenced as a "tenant".
- The types of users in the framework are
  - "admin" (can read, write, delete within their assigned (and child) groups)
  - "contributor" (can read, write, within their assigned (and child) groups)
  - "reader" (can read, within their assigned (and child) groups)

Moving further in this example we will be using tenant as a customer and the roles as is.

Let's assume we have deployed `sif` to our AWS account and ready to start using it. We need to get from an empty slate to a point where can onboard new tenants. In order to that we need to set up groups/users and possibly create resources which can be shared.

We will track the state of our resources as we go along this walk through.

### Step 1: create a root groups for the company

#### Request

```sh
POST /groups
Accept: application/json
Accept-Version: 1.0.0
Content-Type: application/json
Authorization: <INSERT TOKEN>

{
  "name": "corp"
}
```

#### Response

```sh
HTTP: 201 Created
Content-Type: application/json

{
    "id": "/corp",
    "name": "corp",
    "state": "active",
    "createdBy": "someone@example.com",
    "createdAt": "2022-10-27T01:08:18.407Z"
}
```

#### Request

```sh
POST /groups
Accept: application/json
Accept-Version: 1.0.0
Content-Type: application/json
Authorization: <INSERT TOKEN>
x-groupcontextid: /corp

{
  "name": "tenants"
}
```

#### Response

```sh
HTTP: 201 Created
Content-Type: application/json

{
    "id": "/corp/tenants",
    "name": "tenants",
    "state": "active",
    "createdBy": "someone@example.com",
    "createdAt": "2022-10-27T01:08:18.407Z"
}
```

### Step 2: create a group which can house shared resources in the "corp" group

#### Request

```sh
POST /groups
Accept: application/json
Accept-Version: 1.0.0
Content-Type: application/json
Authorization: <INSERT TOKEN>
x-groupcontextid: /corp

{
  "name": "shared"
}
```

#### Response

```sh
HTTP: 201 Created
Content-Type: application/json

{
    "id": "/corp/shared",
    "name": "shared",
    "state": "active",
    "createdBy": "someone@example.com",
    "createdAt": "2022-10-27T01:08:18.407Z"
}
```

### Step 3: create an activity in the "/corp/shared" group (this group is where all customers can view their shared)

```shell
POST /activityTasks
Accept: application/json
Accept-Version: 1.0.0
Content-Type: application/json
Authorization: <INSERT TOKEN>
x-groupcontextid: /corp/shared


body:
{
    "type": "create",
    "activities": [
        {
            "name": "activity:shared:1",
            "description": "test activity",
            "impacts": {
                "co2e": {
                    "name": "CO2e",
                    "components": {
                        "co2": {
                            "key": "co2",
                            "value": 5.304733389,
                            "type": "pollutant"
                        }
                    }
                }
            }
        },
        {
            "name": "activity:shared:2",
            "description": "test activity 1",
            "impacts": {
                "co2e": {
                    "name": "CO2e",
                    "components": {
                        "co2": {
                            "key": "co2",
                            "value": 5.304733389,
                            "type": "pollutant"
                        }
                    }
                }
            }
        }
    ]
}
```

### Step 4: create a new group called acme for the new tenant

#### Request

```sh
POST /groups
Accept: application/json
Accept-Version: 1.0.0
Content-Type: application/json
Authorization: <INSERT TOKEN>
x-groupcontextid: /corp/tenants

{
  "name": "acme"
}
```

#### Response

```sh
HTTP: 201 Created
Content-Type: application/json

{
    "id": "/corp/tenants/acme",
    "name": "acme",
    "state": "active",
    "createdBy": "someone@example.com",
    "createdAt": "2022-10-27T01:08:18.407Z"
}
```

### Step 5: create activities for the tenant in group "/corp/tenants/acme"

```shell
POST /activityTasks
Accept: application/json
Accept-Version: 1.0.0
Content-Type: application/json
Authorization: <INSERT TOKEN>
x-groupcontextid: /corp/tenants/acme


body:
{
    "type": "create",
    "activities": [
        {
            "name": "activity:acme:1",
            "description": "test activity",
            "impacts": {
                "co2e": {
                    "name": "CO2e",
                    "components": {
                        "co2": {
                            "key": "co2",
                            "value": 5.304733389,
                            "type": "pollutant"
                        }
                    }
                }
            }
        },
        {
            "name": "activity:acme:2",
            "description": "test activity 1",
            "impacts": {
                "co2e": {
                    "name": "CO2e",
                    "components": {
                        "co2": {
                            "key": "co2",
                            "value": 5.304733389,
                            "type": "pollutant"
                        }
                    }
                }
            }
        }
    ]
}
```

#### Response

```sh
HTTP: 201 Created
Content-Type: application/json

{
    "type": "create",
    "id": "01gje9qsnk7jt113b57r9gd76e",
    "taskStatus": "waiting",
    "batchesTotal": 1,
    "batchesCompleted": 0,
    "itemsTotal": 2,
    "itemsSucceeded": 0,
    "itemsFailed": 0,
    "groups": [
        "/"
    ],
    "createdAt": "2022-11-21T23:52:53.684Z",
    "createdBy": "someone@example.com"
}
```

### Step 6: onboard an admin for the acme tenant "/corp/tenants/acme"

#### Request

```sh
POST /users
Accept: application/json
Accept-Version: 1.0.0
Content-Type: application/json
Authorization: <INSERT TOKEN>
x-groupcontextid: /corp/tenants/acme

{
  "email": "someone@example.com",
  "role": "admin"
}
```

#### Response

```sh
HTTP: 200 OK
Content-Type: application/json

{
   "email": "someone@example.com",
    "state": "invited",
    "groups": {
        "/corp/tenants/acme": "admin"
    },
    "createdAt": "2022-10-27T02:25:40.237Z",
    "createdBy": "someone@example.com"
}
```

### Step 7: allow the acme tenant admin to have access to shared resources in group "/corp/shared" as a reader

#### Request

```sh
POST /users
Accept: application/json
Accept-Version: 1.0.0
Content-Type: application/json
Authorization: <INSERT TOKEN>
x-groupcontextid: /corp/shared

{
  "email": "someone@example.com",
  "role": "reader"
}
```

#### Response

```sh
HTTP: 200 OK
Content-Type: application/json

{
  "email": "someone@example.com",
    "state": "invited",
    "groups": {
        "/corp/tenants/acme": "admin",
        "/corp/shared": "reader"
    },
    "createdAt": "2022-10-27T02:25:40.237Z",
    "createdBy": "someone@example.com"
}
```

### Step 8: create a acme tenant contributor user in group "/corp/tenants/acme"

#### Request

```sh
POST /users
Accept: application/json
Accept-Version: 1.0.0
Content-Type: application/json
Authorization: <INSERT TOKEN>
x-groupcontextid: /corp/tenants/acme

{
  "email": "contributor@acme.com",
  "role": "contributor"
}
```

#### Response

```sh
HTTP: 200 OK
Content-Type: application/json

{
    "email": "contributor@acme.com",
    "state": "invited",
    "groups": {
        "/corp/tenants/acme": "contributor"
    },
    "createdAt": "2022-10-27T02:25:40.237Z",
    "createdBy": "someone@example.com"
}
```

### Step 9: allow tenant contributor to have access to shared resources in group "/corp/shared" as a reader

#### Request

```sh
POST /users
Accept: application/json
Accept-Version: 1.0.0
Content-Type: application/json
Authorization: <INSERT TOKEN>
x-groupcontextid: /corp/shared

{
  "email": "contributor@acme.com",
  "role": "contributor"
}
```

#### Response

```sh
HTTP: 200 OK
Content-Type: application/json

{
    "email": "contributor@acme.com",
    "state": "invited",
    "groups": {
        "/corp/tenants/acme": "contributor",
        "/corp/shared": "reader"
    },
    "createdAt": "2022-10-27T02:25:40.237Z",
    "createdBy": "someone@example.com"
}
```

### Step 10 (Optional): repeat the above steps 3 - 8 to create a new tenant called "umbrella" and create the following activites

activities to create:

- activity:umbrella:1
- activity:umbrella:2

modify the payload for step 5 to create activities for umbrella tenant

#### How the users, permission, groups and resources look like

| resource | name                | group                  | created By            |
|----------|---------------------|------------------------|-----------------------|
| activity | activity:shared:1   | /corp/shared           | super admin           |
| activity | activity:shared:2   | /corp/shared           | super admin           |
| activity | activity:acme:1     | /corp/tenants/acme     | acme tenant admin     |
| activity | activity:acme:2     | /corp/tenants/acme     | acme tenant admin     |
| activity | activity:umbrella:1 | /corp/tenants/umbrella | umbrella tenant admin |
| activity | activity:umbrella:2 | /corp/tenants/umbrella | umbrella tenant admin |

#### Access by individual resources

| resource            | super admin | acme tenant admin | acme tenant contributor | umbrella tenant admin |
|---------------------|-------------|-------------------|-------------------------|-----------------------|
| activity:shared:1   | R/W         | R                 | R                       | R                     |
| activity:shared:2   | R/W         | R                 | R                       | R                     |
| activity:acme:1     | R/W         | R/W               | R/W                     | X                     |
| activity:acme:2     | R/W         | R/W               | R/W                     | X                     |
| activity:umbrella:1 | R/W         | X                 | X                       | R/W                   |
| activity:umbrella:2 | R/W         | X                 | X                       | R/W                   |

#### The structure of the hierarchy

```shell
/corp
 /private     private for super admins
 /shared      shared by all tenants (explicit grant access to this group for each tenant by super admin)
 /tenants
   /acme    compartmentalized tenant (acme)
     /shared  shared resources down the hierarchy (explicit grant access to this group by tenant)
     /private private resources which are not shared by anyone but tenant admin
   /umbrella   compartmentalized tenant (umbrella)
     /shared  shared resources down the hierarchy (explicit grant access to this group by tenant)
     /private private resources which are not shared by anyone but tenant admin
```

## Concepts and Patterns

- framework Admin **can** revoke/grant access to anyone to any groups **up** or **down** a hierarchy
- Tenant Admin **can** revoke/grant access to anyone to any group **below** their hierarchy
- Tenant Contributors **cannot** revoke/grant access to anyone **up** or **down** a hierarchy
- Tenant Reader **cannot** revoke/grant access to anyone **up** or **down** a hierarchy
- Tenants Admin cannot **R/W** to any other group hierarchies besides their own group hierarchies unless provided access
- framework Admin can **R/W** to any group
- A shared space for resources be created for tenants by explicitly providing access to it
- A private space specific to tenant can be created by creating a sibling group isolated in the hierarchy
