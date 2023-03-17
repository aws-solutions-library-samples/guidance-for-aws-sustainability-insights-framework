# Access Management Data Layer Design

Two datastores are used: a Cognito User Pool, and DynamoDB.

## Cognito

TODO: To document...

## DynamoDB

Single table pattern with GSI overloading.

Keys and access patterns defined as follows:

### Key Prefixes

- `U`: calculation
- `G`: group

### Base Table

- Partition key: `pk`
- Sort key: `sk`

description      | pk            | sk                 | siKey1
-----------------|---------------|--------------------|-------
User             | `U:<email>`   | `U:<email>`        | `U`
Group membership | `U:<email>`   | `G:<groupId>`      |
Group            | `G:<groupId>` | `G:<groupId>`      | `G`
Group hierarchy  | `G:<groupId>` | `G:<childGroupId>` | `GH`

### GSI 1 (siKey1-pk-index)

description     | siKey1 | pk            | sk
----------------|--------|---------------|-------------------
User            | `U`    | `U:<email>`   | `U:<email>`
Group           | `G`    | `G:<groupId>` | `G:<groupId>`
Group hierarchy | `GH`   | `G:<groupId>` | `G:<childGroupId>`

### Full item examples

#### User

attribute   | value
------------|---------------------------
`pk`        | `U:someone@example.com`
`sk`        | `U`
`siKey`     | `U`
`email`     | `someone@example.com`
`state`     | `enabled`
`createdAt` | `2022-08-10T23:55:20.322Z`
`createdBy` | `someone@example.com`
`updatedAt` | `2022-08-10T23:55:20.322Z`
`updatedBy` | `someone@example.com`

#### Group membership

attribute   | value
------------|---------------------------
`pk`        | `U:someone@example.com`
`sk`        | `G:/usa/northwest`
`role`      | `admin`
`createdAt` | `2022-08-10T23:55:20.322Z`
`createdBy` | `someone@example.com`

#### Group

attribute     | value
--------------|---------------------------
`pk`          | `G:/usa/northwest`
`sk`          | `G:/usa/northwest`
`siKey`       | `G`
`id`          | `/usa/northwest`
`name`        | `Northwest`
`description` | `Northwest group`
`state`       | `enabled`
`createdAt`   | `2022-08-10T23:55:20.322Z`
`createdBy`   | `someone@example.com`
`updatedAt`   | `2022-08-10T23:55:20.322Z`
`updatedBy`   | `someone@example.com`

#### Hierarchy

attribute | value
----------|-------------------
`pk`      | `G:/usa`
`sk`      | `G:/usa/northwest`
`siKey1`  | `GH`

### Access Patterns

#### Create a new group

Step 1: Create Cognito user pool groups

Step 2: Save application group items:

The group item:

```typescript
TransactWriteCommand:
  Item:
    pk: 'G:<groupId>'
    sk: 'G:<groupId>'
    siKey: 'G'
```

The hierarchy:

```typescript
TransactWriteCommand:
  Item:
    pk: 'G:<groupId>'
    sk: 'G:<childGroupId>'
    siKey: 'GH'
```

Step 3: Publish _group created_ event

#### Delete a group

Step 1: Delete group item:

The group item:

```typescript
DeleteCommand:
  Key:
    pk: 'G:<groupId>'
    sk: 'G:<groupId>'
```

Step 2: Delete Cognito user pool groups

Step 3: Publish _group deleted_ event

#### Retrieve a group

```typescript
GetCommand:
  Key:
    pk: 'G:<groupId>'
	sk: 'G:<groupId>'
```

#### List child groups

Step 1: Find child group ids:

```typescript
QueryCommand:
  IndexName: `siKey1-pk-index`,
  KeyConditionExpression: `siKey1='GH' AND pk='G:<groupId>'`
```

Step 2: Retrieve group definitions:

```typescript
BatchGetCommand:
  KeyConditionExpression: `pk='G:<groupId>' AND sk='G:<groupId>'`
```


#### Create a user

Ste1 1: Register user within Cognito

Step 2: Save user item

```typescript
PutCommand:
  Item:
    pk: `U:<email>`
    sk: `U:<email>`
    siKey: `U`
```

Step 3: Follow [#### Grant a user access to a group](#grant-a-user-access-to-a-group)

Step 4: Publish _user created_ event

#### Grant a user access to a group

Step 1: Add user to relevant Cognito group for the role

Step 2: Save group membership item

```typescript
PutCommand:
  Item:
    pk: `U:<email>`
    sk: `G:<groupId>`
```

Step 3: Publish _user granted_ event

#### Revoke a user access to a group

Step 1: Remove user from relevant Cognito group for the role

Step 2: Delete group membership item

```typescript
DeleteCommand:
  Key:
    pk: `U:<email>`
    sk: `G:<groupId>`
```

Step 3: Publish _user revoked_ event

Step 4: Check users cognito group membership. If zero, follow [Delete a user](#delete-a-user)

#### Delete a user

Ste1 1: Deregister user from Cognito

Step 2: Delete user item

```typescript
DeleteCommand:
  Item:
    pk: `U:<email>`
```

Step 3: Publish _user delete_ event

