# Calculations Data Layer Design

A single datastore is used: DynamoDB.

## DynamoDB

Single table pattern with GSI overloading.

Keys and access patterns defined as follows:

### Key Prefixes

- `C`: calculation
- `CV`: calculation version

The following are managed by the `resource-management` library:

- `AID`: calculation alternate id (name)
- `G`: group
- `T`: tag
- `TA`: distinct tag

### Base Table

- Partition key: `pk`
- Sort key: `sk`

description                                      | owner               | pk                  | sk                 | siKey1
-------------------------------------------------|---------------------|---------------------|--------------------|--------------
Calculation (latest version)                     | module              | `C:<id>`            | `C`                | `C`
Calculation version                              | module              | `C:<id>`            | `CV:<version>`     |
Group membership                                 | resource-management | `C:<id>`            | `G:<groupId>`      | `G:<groupId>`
Name uniqueness within group                     | resource-management | `AID:<name>`        | `G:<groupId>`      |
Group hierarchy                                  | resource-management | `G:<parentGroupId>` | `G:<groupId>`      |
Calculation tag (applies to latest version only) | resource-management | `T:<key>`           | `T:<value>:C:<id>` |
Distinct list of tags                            | resource-management | `TA:<key>`          | `TA:<value>`       | `TA`

> **Decision**: `T:<key>` could become a hot partition key depending on customer usage patterns. For launch we will rely on [adaptive capacity](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-design.html) and its auto-balancing of data across partitions rather than trying to pre-optimize.

### GSI 1 (siKey1-pk-index)

description                  | owner               | siKey1        | pk         | sk
-----------------------------|---------------------|---------------|------------|--------------
Calculation (latest version) | module              | `C`           | `C:<id>`   | `C:<id>`
Group membership             | resource-management | `G:<groupId>` | `C:<id>`   | `G:<groupId>`
Distinct list of tags        | resource-management | `TA`          | `TA:<key>` | `TA:<value>`

### Full item examples

#### Calculation

> **Decision**: a copy of `groups` and `tags` to be stored (denormalized) against the calculation items so that 1/ data retrieval is simple, and 2/ tags and groups are versioned along with the versioned calculation items.

> **Decision**: hierarchical groups to be expanded when saving to simplify reads. changes to group hierarchies will be published by Access Management module, and managed via the resource-management library.

> **Decision**: Opting to store some attributes as sets / json documents (`parameters`, `output`, denormalized `groups`, and denormalized `tags`) as no filtering will be carried out on these, and they will be updated either as a set item or as a whole.

attribute     | value
--------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
`pk`          | `C:03d66e78-5eac-4781-aede-e1bed34d1e81`
`sk`          | `C:<id>`
`siKey`       | `C`
`name`        | `vehicle_emissions`
`summary`     | `Calculates vehicle CO2eq emissions using the GHG Protocol.`
`description` | `If the no. of passengers is provided, the CO2 emissions are calculated by looking up the requested pollutant for the provided 'vehicle_type' from the 'passenger_vehicles' emission factor data and multiplied by the provided distance and passengers. If not, the CO2 emissions are calculated by looking up the requested pollutant for the provided 'vehicle_type' from the 'vehicles' emission factor data and multiplied by the provided distance.`
`formula`     | `IF(COALESCE(:passengers,0)>0,IMPACT('passenger_vehicles',:vehicleType,:pollutant)*:distance*:passengers,IMPACT('vehicles',:vehicleType,:pollutant)*:distance)`
`parameters`  | `[{index: 0,key: 'vehicleType',label: 'Vehicle Type',description: 'Type of vehicle',type: 'string',required: true}, {index: 1,key: 'pollutant',label: 'CO2eq pollutant',description: 'The CO2eq pollutant to lookup fron the emission factor',type: 'string',required: true}, {index: 2,key: 'distance',label: 'Distance (Miles)',description: 'Distance (in miles)',type: 'number',required: true}, {index: 3,key: 'passengers',label: 'Passengers',description: 'No. of passengers',type: 'number',required: false}]`
`outputs`     | `[{description: 'The calculated CO2eq pollutant.',type: 'number'}]`
`groups`      | `['/usa']`
`tags`        | `[{key: 'Datasource',value: 'GHG Protocol'}, {key: 'Type',value: 'Transportation'}]`
`version`     | `1`
`state`       | `enabled`
`createdAt`   | `2022-08-10T23:55:20.322Z`
`createdBy`   | `someone@somewhere.com`
`updatedAt`   | `2022-08-10T23:55:20.322Z`
`updatedBy`   | `someone@somewhere.com`

#### Calculation Version

Duplicate of _calculation_ item, but with `sk`=`CV:<version>`, and `siKey1` removed.

#### Group membership

An item will exist for each exploded group including groups inheriting from parent (example below is for a calculation explictly granted to `/usa` groups, but is inherited by the `/usa/northwest` and `/usa/southeast` sub-groups):

attribute | value
----------|-----------------------------------------
`pk`      | `C:03d66e78-5eac-4781-aede-e1bed34d1e81`
`sk`      | `G:/usa`
`siKey`   | `G:/usa`

attribute | value
----------|-----------------------------------------
`pk`      | `C:03d66e78-5eac-4781-aede-e1bed34d1e81`
`sk`      | `G:/usa/northwest`
`siKey`   | `G:/usa/northwest`

attribute | value
----------|-----------------------------------------
`pk`      | `C:03d66e78-5eac-4781-aede-e1bed34d1e81`
`sk`      | `G:/usa/southeast`
`siKey`   | `G:/usa/southeast`

#### Name uniqueness within a group

An item will exist for each explicitly granted group:

attribute | value
----------|---------------------------------------
`pk`      | `AID:vehicle_emissions:`
`sk`      | `G:/usa`
`groupId` | `/usa`
`id`      | `03d66e78-5eac-4781-aede-e1bed34d1e81`

#### Calculation tags

TODO: update this based on resource-management library implementation.

An item will exist for each exploded tag:

attribute | value
----------|----------------------------------------------------
`pk`      | `T:type`
`sk`      | `T:material:C:03d66e78-5eac-4781-aede-e1bed34d1e81`
`value`   | `material`

attribute | value
----------|----------------------------------------------------------
`pk`      | `T:type`
`sk`      | `T:material#metal:C:03d66e78-5eac-4781-aede-e1bed34d1e81`
`value`   | `metal`

attribute | value
----------|----------------------------------------------------------------
`pk`      | `T:type`
`sk`      | `T:material#metal#steel:C:03d66e78-5eac-4781-aede-e1bed34d1e81`
`value`   | `steel`

#### Distinct tags

An item will exist for distinct tag and value within the group:

TODO: update this based on resource-management library implementation.

attribute | value
----------|--------------
`pk`      | `TA:type`
`sk`      | `TA:material`
`value`   | `material`
`count`   | 17

attribute | value
----------|--------------------
`pk`      | `TA:type`
`sk`      | `TA:material#metal`
`value`   | `metal`
`count`   | 12

attribute | value
----------|--------------------------
`pk`      | `TA:type`
`sk`      | `TA:material#metal#steel`
`value`   | `steel`
`count`   | 5

### Access Patterns

#### Process _group created_ Access Management event

**Owner: `resource-management`** Step 1: Find all calculations that have been granted to the parent group

```typescript
QueryCommand:
  IndexName: `siKey1-pk-index`,
  KeyConditionExpression: `siKey1='G:<parentGroupId>' AND begins_with(pk, 'C:')`,
```

**Owner: `resource-management`** Step 2: For each calculation belonging to the parent group follow [Grant access of the calculation to a group](#grant-access-of-the-calculation-to-a-group).

#### Process _group deleted_ Access Management event

**Owner: `resource-management`** Step 1: Find all calculations that belong to group

```typescript
QueryCommand:
  IndexName: `siKey1-pk-index`,
  KeyConditionExpression: `siKey1='G:<groupId>' AND begins_with(pk, 'C:')`,
```

**Owner: `resource-management`** Step 2: Delete all calculations

For each calculation from step 1:

```typescript
DeleteCommand:
  Key:
    pk: 'C:<id>'
 sk: 'G:<groupId>'

DeleteCommand:
  Key:
    pk: 'C:<id>'
 sk: 'G:<groupId>:AID'
```

TODO: what about tags?

#### Create a new calculation

**Owner: `module`** Step 1: Save calculation definition:

```typescript
TransactWriteCommand:

  // The calculation item (current version):
  Put:
 Item:
  pk: 'C:<id>'
  sk: `C`
  siKey: 'C'

 // The calculation item (versioned):
  Put:
 Item:
  pk: 'C:<id>'
  sk: 'CV:<version>'

 // For each exploded tag:
 // **Owner: `module`**
  Put:
    Item:
      pk: 'T:<key>'
      sk: 'T:<value>[#<hierarchy]:C:<id>'
```

Step 2: Follow [Grant access of the calculation to a group](#grant-access-of-the-calculation-to-a-group) for the initial group.

#### Ensure uniqueness of an name within a group

**Owner: `resource-management`** Step 1: Check to see if theres a potential clash when creating a new calculation with an existing in a sub group:

```typescript
QueryCommand:
  KeyConditionExpression: `pk='AID:<name>' AND begins_with(sk,'G:<groupId>')`,
  Limit: 1
```

**Owner: `resource-management`** Step 2: Check to see if theres a potential clash when creating a new calculation with an existing in a parent group:

```typescript
BatchGet (for each level in group hierarchy):
 Key:
  pk: 'AID:<name>'
  sk: 'G:<groupHierarchyId...>'
```

#### Grant a group access to a calculation

Step 1: Follow [Ensure uniqueness of an name within a group](#ensure-uniqueness-of-an-name-within-a-group).

**Owner: `resource-management`** Step 2: If ok, insert group membership items

```typescript
TransactWriteCommand:
  Put:
 Item:
  pk: 'C:<id>'
  sk: 'G:<groupId>'
  siKey1: 'G:<groupId>'
  Put:
 Item:
  pk: 'AID:<name>'
  sk: 'G:<groupId>'
```

**Owner: `resource-management`** Step 3: Publish _calculation group membership granted_ event

#### Process _calculation group membership granted_ event

**Owner: `resource-management`** Step 1: Retrieve affected child groups

```typescript
QueryCommand:
  KeyConditionExpression: `pk='G:<groupId>' AND begins_with(sk,'G:')`,
```

Step 2: For each affected child group, follow [Grant access of the calculation to a group](#grant-access-of-the-calculation-to-a-group)

#### Revoke a groups access to a calculation

**Owner: `resource-management`** Step 1: Remove group membership items:

```typescript
TransactWriteCommand:
 Delete:
  Key:
   pk: 'C:<id>'
   sk: 'G:<groupId>'
 Delete:
  Key:
   pk: 'AID:<name>'
   sk: 'G:<groupId>'
```

> TODO: remove group tag items?

**Owner: `resource-management`** Step 2: Publish _calculation group membership revoked_ event

#### Process _calculation group membership revoked_ event

**Owner: `resource-management`** Step 1: Retrieve affected child groups

```typescript
QueryCommand:
  KeyConditionExpression: `pk='G:<groupId>' AND begins_with(sk,'G:')`,
```

Step 2: For each affected child group, follow [Revoke a groups access to a calculation](#revoke-a-groups-access-to-a-calculation)

#### Retrieve latest version of calculation

**Owner: `resource-management`** Step 1: Verify group permissions

```typescript
QueryCommand:
  KeyConditionExpression: `pk='C:<id>' AND sk='G:<groupId>'`
```

**Owner: `module`** Step 2: If granted, retrieve calculation (latest version)

Note: tags are denormalized at the calculation level for easy retrieval.

```typescript
QueryCommand:
  KeyConditionExpression: `pk='C:<id>' AND sk='C:<id>'`
```

#### Retrieve specific version of calculation

**Owner: `resource-management`** Step 1: Verify group permissions

```typescript
QueryCommand:
  KeyConditionExpression: `pk='C:<id>' AND sk='G:<groupId>'`
```

**Owner: `module`** Step 2: Retrieve calculation (specific version)

```typescript
QueryCommand:
  KeyConditionExpression: `pk='C:<id>' AND sk='CV:<version>'`
```

#### List calculations for a group

**Owner: `resource-management`** Step 1: Find calculation ids of group:

```typescript
QueryCommand:
  IndexName: `siKey1-pk-index`,
  KeyConditionExpression: `siKey1='G:<groupId>' and begins_with(pk,'C:')`,
```

**Owner: `module`** Step 2: retrieve the calculations per page of group results:

```typescript
BatchGetCommand:
  for each calculation....
    GetCommand:
      KeyConditionExpression: `pk='C:<id>' AND sk='C:<id>'`
```

#### List calculations for a group, filtered by tag

**Owner: `resource-management`**

TODO: document once we have this approach finalized.

#### Update calculation

Step 1: Follow [Retrieve latest version of calculation](#retrieve_latest_version_of_calculation)

**Owner: `resource-management`** Step 2: Check that calculation is part of group

```typescript
GetCommand:
  KeyConditionExpression: `pk='C:<id>' AND sk='G:<groupId>'`
```

Step 3: Follow [Create a new calculation](#create_a_new_calculation)

**Owner: `resource-management`** Step 4: Remove any tags no longer in use

**Owner: `resource-management`** Step 5: Remove any groups no longer in use

#### List version of a calculations

**Owner: `resource-management`** Step 1: Check that calculation is part of group

```typescript
GetCommand:
  KeyConditionExpression: `pk='C:<id>' AND sk='G:<groupId>'`
```

**Owner: `module`** Step 2: Retrieve all version of the calculation

```typescript
QueryCommand:
  KeyConditionExpression: `pk='C:<id>' AND begins_with(sk, 'CV:')`
```

#### Retrieve calculation by name

**Owner: `resource-management`** Step 1: Find calculation IDs based on group hierarchy chain

```typescript
BatchGet (for each level in group hierarchy):
 Key:
  pk: 'AID:<name>'
  sk: 'G:<hroupHierarchyId...>'
```

Step 2: Follow [Retrieve latest version of calculation](#retrieve_latest_version_of_calculation) steps
