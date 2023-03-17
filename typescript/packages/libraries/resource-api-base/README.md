# resource-api-base library

## Introduction

This library acts as the base for all resource apis. It provides common authorization checks, tag, hierarchical group, config, and dependency injection functionality.

The library follows the pattern of exposing functionality at the service layer if it is isolated (e.g. asynchronously processing tag group summaries) bs exposing at the repository level if it is to be part of a wider transaction (e.g. providing the TransactWrites for creating tags to be part of a wider create resource transaction).

## Resource Data Access Assumptions

The library assumes the following data access assumptions are in place at the resource module level:

- Resource item:
  - Partition key `pk` - `<keyPrefix>:<id>`
  - Sort key `sk` - `<keyPrefix>`

## Process Flows

The following flows describe the basic patterns of how resource modules should be implemented using the library:

### Creating new resources

```mermaid
sequenceDiagram
	participant H as <<resource module>><br><br>Handler
	participant RS as <<resource module>><br><br>ResourceService
	participant GP as <<resource-api-base library>><br><br>GroupPermissions
	participant RR as <<resource module>><br><br>ResourceRepository
	participant TR as <<resource-api-base library>><br><br>TagRepository
	participant DC as <<aws-sdk/lib-dynamodb>><br><br>DynamoDBDocumentClient
	participant TS as <<resource-api-base library>><br><br>TagService

	H->>+RS: create

	RS->>+GP: isAuthorized()
	GP-->>-RS: isAuthorized
	opt not authorized
		RS-->>H: UnauthorizedError
	end

	RS->>+RS: validation
	deactivate RS
	RS->>+RR: create()
	RR->>+RR: getPutResourceTransactionWriteCommandInput()
	RR-->>-RR: TransactItems
	RR->>+TR: getTagTransactWriteCommandInput
	TR-->>-RR: TransactItems
	RR->>+DC: send(TransactWriteCommand)
	deactivate RR

	RS-)+TS: submitGroupSummariesProcess()
	deactivate TS

	RS-->>-H: resource
```

### Updating existing resources

```mermaid
sequenceDiagram
	participant H as <<resource module>><br><br>Handler
	participant RS as <<resource module>><br><br>ResourceService
	participant GP as <<resource-api-base library>><br><br>GroupPermissions
	participant RR as <<resource module>><br><br>ResourceRepository
	participant TR as <<resource-api-base library>><br><br>TagRepository
	participant DC as <<aws-sdk/lib-dynamodb>><br><br>DynamoDBDocumentClient
	participant TS as <<resource-api-base library>><br><br>TagService

	H->>+RS: update

	RS->>+GP: isAuthorized()
	GP-->>-RS: isAuthorized
	opt not authorized
		RS-->>H: UnauthorizedError
	end

	RS->>+RR: get
	RR-->>-RS: existing resource
	opt resource not found
		RS-->>H: NotFoundError
	end

	RS->>+GP: matchGroup()
	GP-->>-RS: isAllowed
	opt not authorized
		RS-->>H: UnauthorizedError
	end

	RS->>+RS: merge
	deactivate RS
	RS->>+RS: validation
	deactivate RS

	RS->>+TS: diff()
	TS-->>-RS: tag differences

	RS->>+RR: update()
	RR->>+RR: getPutResourceTransactionWriteCommandInput()
	RR-->>-RR: TransactItems
	RR->>+TR: getTagTransactWriteCommandInput
	TR-->>-RR: TransactItems
	RR->>+DC: send(TransactWriteCommand)
	deactivate RR

	RS-)+TS: submitGroupSummariesProcess()
	deactivate TS

	RS-->>-H: resource
```

### Get existing resource

```mermaid
sequenceDiagram
	participant H as <<resource module>><br><br>Handler
	participant RS as <<resource module>><br><br>ResourceService
	participant GP as <<resource-api-base library>><br><br>GroupPermissions
	participant RR as <<resource module>><br><br>ResourceRepository

	H->>+RS: get

	RS->>+GP: isAuthorized()
	GP-->>-RS: isAuthorized
	opt not authorized
		RS-->>H: UnauthorizedError
	end

	RS->>+RR: get
	RR-->>-RS: existing resource
	opt resource not found
		RS-->>H: NotFoundError
	end

	RS->>+GP: matchGroup()
	GP-->>-RS: isAllowed
	opt not authorized
		RS-->>H: UnauthorizedError
	end

	RS-->>-H: resource
```

### Delete existing resource

```mermaid
sequenceDiagram
	participant H as <<resource module>><br><br>Handler
	participant RS as <<resource module>><br><br>ResourceService
	participant GP as <<resource-api-base library>><br><br>GroupPermissions
	participant RR as <<resource module>><br><br>ResourceRepository
	participant DC as <<aws-sdk/lib-dynamodb>><br><br>DynamoDBDocumentClient
	participant TS as <<resource-api-base library>><br><br>TagService

	H->>+RS: delete

	RS->>+GP: isAuthorized()
	GP-->>-RS: isAuthorized
	opt not authorized
		RS-->>H: UnauthorizedError
	end

	RS->>+RR: get
	RR-->>-RS: existing resource
	opt resource not found
		RS-->>H: NotFoundError
	end

	RS->>+GP: matchGroup()
	GP-->>-RS: isAllowed
	opt not authorized
		RS-->>H: UnauthorizedError
	end

	RS->>+RR: delete
	RR->>+DC: send(QueryCommand)
	DC-->>-RR: resource related items
	RR->>+DC: send(TransactCommand)
	deactivate RR

	RS-)+TS: submitGroupSummariesProcess()
	deactivate TS
	deactivate RS

```

### List existing resource

```mermaid
sequenceDiagram
	participant H as <<resource module>><br><br>Handler
	participant RS as <<resource module>><br><br>ResourceService
	participant GP as <<resource-api-base library>><br><br>GroupPermissions
	participant RR as <<resource module>><br><br>ResourceRepository
	participant RSL as <<resource-api-base library>><br><br>ResourceService

	H->>+RS: list

	RS->>+GP: isAuthorized()
	GP-->>-RS: isAuthorized
	opt not authorized
		RS-->>H: UnauthorizedError
	end

	alt filter by name
		RS->>+RSL: getIdByAlternateId()
		RSL-->>-RS: resource id
		RS->>+RR: listByIds()
		RR-->>-RS: [resource]
	else
		RS->>+RSL: listIds()
		RSL-->>-RS: resource ids
		RS->>+RR: listByIds()
		RR-->>-RS: [resources]

	end

	RS-->>-H: resources
```

### List resource versions

```mermaid
sequenceDiagram
	participant H as <<resource module>><br><br>Handler
	participant RS as <<resource module>><br><br>ResourceService
	participant GP as <<resource-api-base library>><br><br>GroupPermissions
	participant RR as <<resource module>><br><br>ResourceRepository

	H->>+RS: list versions

	RS->>+GP: isAuthorized()
	GP-->>-RS: isAuthorized
	opt not authorized
		RS-->>H: UnauthorizedError
	end

	RS->>+RR: listVersions()
	RR-->>-RS: [resource versions]

	loop versions
		RS->>+GP: matchGroup()
		GP-->>-RS: isAllowed
		opt not allowed
			RS->>+RS: exclude
			deactivate RS
		end
	end

	RS-->>-H: resource versions
```

### Grant resource to group

```mermaid
sequenceDiagram
	participant H as <<resource module>><br><br>Handler
	participant RS as <<resource module>><br><br>ResourceService
	participant GP as <<resource-api-base library>><br><br>GroupPermissions
	participant GS as <<resource-api-base library>><br><br>GroupService
	participant RR as <<resource module>><br><br>ResourceRepository

	H->>+RS: grant

	RS->>+GP: isAuthorized()
	GP-->>-RS: isAuthorized
	opt not authorized
		RS-->>H: UnauthorizedError
	end

	RS->>+RR: get
	RR-->>-RS: existing resource
	opt resource not found
		RS-->>H: NotFoundError
	end

	RS->>+GS: isGroupExists
	GS-->>-RS: group exists
	opt resource not found
		RS-->>H: NotFoundError
	end

	RS->>GS: grant

	RS->>RR: update
```

### Revoke resource to group

```mermaid
sequenceDiagram
	participant H as <<resource module>><br><br>Handler
	participant RS as <<resource module>><br><br>ResourceService
	participant GP as <<resource-api-base library>><br><br>GroupPermissions
	participant GS as <<resource-api-base library>><br><br>GroupService
	participant RR as <<resource module>><br><br>ResourceRepository

	H->>+RS: revoke

	RS->>+GP: isAuthorized()
	GP-->>-RS: isAuthorized
	opt not authorized
		RS-->>H: UnauthorizedError
	end

	RS->>+RR: get
	RR-->>-RS: existing resource
	opt resource not found
		RS-->>H: NotFoundError
	end

	RS->>+GS: isGroupExists
	GS-->>-RS: group exists
	opt resource not found
		RS-->>H: NotFoundError
	end

	RS->>GS: revoke

	RS->>RR: update
```

## Steps for migrating existing modules to resource-api-base

Use the calculations module as a guide for the followig:

- DynamoDB utils refactor
  - Extract `PKType` into its own class
  - Replace `pkUtils.util.ts` and `dynamoDb.util.ts` with `@sif/dynamodb-utils`
- Implement library
  - Add `@sif/resource-api-base` dependency
  - Copy and repurpose the `calculations/groups/put.handler.ts` and `calculations/groups/delete.handler.ts` API endpoint handlers
  - Replace common schema, types, and responses, with base library
  - Wire up the provided `listTagsRoute` API endpoint handler from the library
  - Implement process flows as described above
  - Refactor config to merge with the library config
  - Refactor awilix to merge with the library awilix
- Integration tests
  - Copy and repurpose `calculations_groups.feature` and `calculations_tags.feature`
  - Ensure they pass
