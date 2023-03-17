# Managing Resource Group Authorization

## Introduction

Throughout the platform, any and all resources (e.g. reference data sets, emission factors, data pipelines) are assigned to an initial group at time of creation, and have the ability to be assigned to other groups as needed post creation. This exposes a number of actions that every resource module must implement:

- Verifying that a resource alternate id (e.g. `name` for calculation) is unique to its assigned groups (in contrast to the automatically created `id` which is globally unique)
- Granting a resource access to a group upon creation
- Granting a resource access to a group post creation
- Revoking a resource access to a group post creation
- Ensuring a user has acccess to the resource
- Listing resources per group

As groups are hierarchical in nature, and for some actions a resource's hierarchical group membership needs checking against a user's hierarchical group membership (and role), where possible these checks are carried out at the data layer as part of a query to reduce the DynamoDB RCU's consumed, but where not possible that check is carried out at the application level.

## Actions

Substitute the reference `resources` (`R` / `RN`) as a resource such as `calculations`, `referenceDatasets`, etc.

### Example DynamoDB item structure

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

### Verifying that a resource alternate id is unique to its assigned groups

This action needs to occur as part of a validation step prior to resource creation (e.g. `POST /resources`), or a validation step prior to granting access to the resource for a group (`e.g. PUT /resources/:id/groups/:groupId`).

```sql
SELECT * FROM "table"."siKey1-sk-index"
WHERE siKey1 = 'RN:<alternateId>' AND begins_with(sk, 'RN:<alternateId>:G:<groupId>')
```

Example:

As part of validation step of creating a new calculation (`POST /calculations`) or assigning an existing calculation to an existing group (`PUT /calculations/:id/groups/:groupId`) the following query is performed to ensure its alternate id (`name`) is not already in use in the groups.

```sql
SELECT * FROM "table"."siKey1-sk-index"
WHERE siKey1 = 'CA:abc123def' AND begins_with(sk, 'CA:vehicle_emissions:G:%2fusa%2fnorthwest')
```

### Granting a resource access to a group upon creation

As part of saving the resource (`POST /resources`), save its group membership details as well as marking that its alternate id is in use by the group.

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

Example:

To save a new calculation (`POST /calculations`):

The initial resource group membership:

```sql
INSERT INTO "table"
value {'pk' : 'C:abc123def', 'sk' : 'G:%2fusa%2fnorthwest'}
```

For alternate id uniqueness checks:

```sql
INSERT INTO "table"
value {'pk' : 'C:abc123def', 'sk' : 'CA:vehicle_emissions:G:%2fusa%2fnorthwest', 'siKey1' : 'CA:vehicle_emissions'}
```

### Granting a resource access to a group post creation

Existing resources may be assigned to other groups via `PUT /resources/:id/groups/:groupId`. This would be a multi-step process:

1. [Verifying that a resource alternate id is unique to its assigned groups](#Verifying-that-a-resource-alternate-id-is-unique-to-its-assigned-groups).
2. [Granting a resource access to a group upon creation](#granting-a-resource-access-to-a-group-upon-creation).

### Revoking a resource access to a group post creation

To revoke access to a resource by a group (`DELETE /resources/:id/groups/:groupId`):

First ensure that the resource will still have at least 1 other group remaining. If not the action should be prevented:

```sql
SELECT * from "table"
WHERE pk = 'R:<id>' AND begins_with(sk, 'G:')
```

Next, remove both the group membership item and the alternate id uniqueness check as part of a transaction:

```sql
DELETE FROM "table"
WHERE "pk" = 'R:<id>' AND "sk" = 'G:<groupId>'
```

```sql
DELETE FROM "table"
WHERE "pk" = 'R:<id>' AND "sk" = 'RN:G:<groupId>'
```

Example:

To remove a calculation from a group using `DELETE /calculations/abc123def/groups/%2fusa%2fnorthwest`:

First ensure at least 1 group membership will be remaining:

```sql
SELECT * from "table"
WHERE pk = 'C:abc123def' AND begins_with(sk, 'G:')
```

If ok to proceed perform the deletion as a transaction:

```sql
DELETE FROM "table"
WHERE "pk" = 'C:abc123def' AND "sk" = 'G:%2fusa%2fnorthwest'
```

```sql
DELETE FROM "table"
WHERE "pk" = 'C:abc123def' AND "sk" = 'CA:G:%2fusa%2fnorthwest'
```

### Ensuring a user has acccess to the resource

Refer to the main [README](../README.md) for details of how users are granted access to a group, and how the authorization details (email, allowed groups, and active groip context) are provided to the rest api handlers for use.

All REST endpoints should perform authorization checks. The swagger definition should describe the level of authorization check. The resource REST API module should import the authz plugin from the `@sif/authz` library to add the authorization details to the request. As part of the action implementation at the service layer the `@sif/authz` library should be to carry out the authorization check itself.

Example:

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

### Listing resources per group

The REST list endpoints should infer the active group context from the provided `x-activegroupid` request header. To retrieve the data would be a multi-step process as follows:

Step 1: Find resource ids assigned to group:

```sql
SELECT pk FROM "table"."siKey1-sk-index"
WHERE sk = 'G:<groupId>'
```

Step 2: retrieve the resources per page of group results:

```sql
SELECT * FROM "table"
WHERE pk IN ['R:<id>', 'R:<id>', ...]
```

Example:

Given the user is attempting to list all calculations for the group `/usa/northwest` which they are in the context of, using `GET /calculations` required the following:

Step 1: Find calculation ids assigned to group:

```sql
SELECT pk FROM "table"."siKey1-sk-index"
WHERE sk = 'G:%2fusa%2fnorthwest'
```

Step 2: retrieve the calculatios per page of group results:

```sql
SELECT * FROM "table"
WHERE pk IN ['C:abc123def', 'C:ghi456jkl', ...]
```
