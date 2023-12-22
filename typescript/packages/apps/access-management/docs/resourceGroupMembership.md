# Managing Resource Group Authorization

## Overview

This document provides guidance on how resources (like reference data sets, emission factors, and data pipelines) are associated with groups within the platform. Resources are initially linked to a group upon creation and can be associated to other groups as needed.

## Key Concepts

- **Resource Alternate ID**: A unique identifier for a resource within its assigned groups. This is different from the globally unique id.
- **Group Membership**: Resources can belong to multiple groups. This membership determines access and visibility.
- **Authorization Checks**: Ensures that a user has the necessary permissions to access a resource.


## Actions

Substitute the reference `resources` (`R` / `RN`) as a resource such as `calculations`, `referenceDatasets`, etc.

### DynamoDB Table Structure

All of the actions described below make use of the following data access pattern:

#### Key Prefixes

- `R`: resource
- `RN`: resource alternate id (e.g. `name`)
- `G`: group

#### Base Table

- Partition key: `pk`
- Sort key: `sk`

description                          | pk       | sk               | siKey1
-------------------------------------|----------|------------------|-------------------
Group membership                     | `R:<id>` | `G:<groupId>`    | `G:<groupId>`
Alternate ID uniqueness within group | `R:<id>` | `RN:G:<groupId>` | `RN:<alternateId>`

#### GSI 1 (siKey1-sk-index)

description                          | siKey1        | pk       | sk
-------------------------------------|---------------|----------|-------------------------------
Alternate ID uniqueness within group | `RN:<name>`  | `R:<id>` | `RN:<alternateId>:G:<groupId>`
Group membership                     | `G:<groupId>` | `R:<id>` | `G:<groupId>`

### 1. Verifying Resource Alternate ID Uniqueness

Before creating a resource (e.g. `POST /resources`) or assigning it to a group (`e.g. PUT /resources/:id/groups/:groupId`), ensure its alternate ID is unique within the group.

```sql
SELECT * FROM "table"."siKey1-sk-index"
WHERE siKey1 = 'RN:<alternateId>' AND begins_with(sk, 'RN:<alternateId>:G:<groupId>')
```

Example:

As part of validation step of creating a new calculation (`POST /calculations`) or assigning an existing calculation to an existing group (`PUT /calculations/:id/groups/:groupId`) the following query is performed to ensure its alternate id (`name`) is not already in use within the target group.

```sql
SELECT * FROM "table"."siKey1-sk-index"
WHERE siKey1 = 'CA:abc123def' AND begins_with(sk, 'CA:vehicle_emissions:G:%2fusa%2fnorthwest')
```

### 2. Granting Resource Access to a Group

When creating a resource (`POST /resources`), it's essential to assign it to a group and mark its alternate ID as used by that group.

The initial resource group membership:

```sql
INSERT INTO "table"
value {'pk' : 'R:<id>', 'sk' : 'G:<groupId>'}
```

For alternate id uniqueness checks:

```sql
INSERT INTO "table"
value {'pk' : 'R:<id>', 'sk' : 'RN:<name>:G:<groupId>', 'siKey1' : 'RN:<name>'}
```

**Example:** To save a new calculation (`POST /calculations`):

The initial calculation group membership:

```sql
INSERT INTO "table"
value {'pk' : 'C:abc123def', 'sk' : 'G:%2fusa%2fnorthwest'}
```

For alternate id uniqueness checks:

```sql
INSERT INTO "table"
value {'pk' : 'C:abc123def', 'sk' : 'CA:vehicle_emissions:G:%2fusa%2fnorthwest', 'siKey1' : 'CA:vehicle_emissions'}
```

### 3. Assigning Resource to Additional Groups

Existing resources can be linked to other groups. This involves:

- [Verifying the alternate ID's uniqueness](#1-verifying-resource-alternate-id-uniqueness).
- [Granting access to the new group](#2-granting-resource-access-to-a-group).

### 4. Revoking Resource Access from a Group

To remove a resource from a group (e.g. `DELETE /resources/:id/groups/:groupId`):

1. Ensure the resource belongs to at least one other group.

```sql
SELECT * from "table"
WHERE pk = 'R:<id>' AND begins_with(sk, 'G:')
```

2. Remove the group membership and alternate ID uniqueness check.

```sql
DELETE FROM "table"
WHERE "pk" = 'R:<id>' AND "sk" = 'G:<groupId>'
```

```sql
DELETE FROM "table"
WHERE "pk" = 'R:<id>' AND "sk" = 'RN:G:<groupId>'
```

**Example:** To remove a calculation from a group using `DELETE /calculations/abc123def/groups/%2fusa%2fnorthwest`:

1. Ensure the calculation belongs to at least one other group.

```sql
SELECT * from "table"
WHERE pk = 'C:abc123def' AND begins_with(sk, 'G:')
```

2. Remove the group membership and alternate ID uniqueness check.

```sql
DELETE FROM "table"
WHERE "pk" = 'C:abc123def' AND "sk" = 'G:%2fusa%2fnorthwest'
```

```sql
DELETE FROM "table"
WHERE "pk" = 'C:abc123def' AND "sk" = 'CA:G:%2fusa%2fnorthwest'
```

### 5. User Authorization for Resource Access

All REST endpoints should perform authorization checks. Their swagger definition will specify the required authorization level. The resource REST API module should use the `@sif/authz` library for these checks.

**Example:**

Within the calculations module `app.ts` the authz plugin is registered:

```typescript
import { authzPlugin } from '@sif/authz';

export const buildApp = async (): Promise<FastifyInstance> => {
  ...
  await app.register(authzPlugin);
  ...
}
```

Within the swagger definition for the `POST /calculations` endpoint its `description` contains details of the authorization needed:

`create.handler.ts`:
```typescript
		schema: {
			...
			description: `Define a new custom calculation that can be referenced in transforms by prefixing its name with \`#\`.

Permissions:
- Only \`admin\` and above may create new calculations.
`,
```

Within the action implementation for the above the authorization check is carried out as follows:

`service.ts`:
```typescript

public async create(securityContext: SecurityContext, calculation: NewCalculation): Promise<Calculation> {
  ...
  // Authz check - Only `admin` and above may create new calculations.
  const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastAdmin, 'all');
  if (!isAuthorized) {
    throw new UnauthorizedError(`The caller is not an \`admin\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
  }
  ...
}
```

### 6. Listing Resources by Group

To list resources for a specific group:

1. Identify resource IDs linked to the group.

```sql
SELECT pk FROM "table"."siKey1-sk-index"
WHERE sk = 'G:<groupId>'
```

2. Retrieve the resources based on the identified IDs.

```sql
SELECT * FROM "table"
WHERE pk IN ['R:<id>', 'R:<id>', ...]
```

**Example:** Given the user is attempting to list all calculations for the group `/usa/northwest` which they are in the context of, using `GET /calculations` required the following:

1. Identify calculation IDs linked to the group.

```sql
SELECT pk FROM "table"."siKey1-sk-index"
WHERE sk = 'G:%2fusa%2fnorthwest'
```

2. Retrieve the calculations based on the identified IDs.

```sql
SELECT * FROM "table"
WHERE pk IN ['C:abc123def', 'C:ghi456jkl', ...]
```
