# Metrics Migrator

## Introduction

This module migrates metrics from dynamodb to RDS. This applies to the latest release of SIF which includes changes to the metrics datastore.

## How does it work ?

To run the migration this tool exposes a command which should be executed to kick off the migration process. The migration process will scan the old dynamodb metrics table and write an output file to S3. Once the file is loaded to s3 then the tool will queue a sqs message to kick off the next stage of migration which is to ingest the output file to RDS. The file gets written to a temporary table and then the  metrics are copied from the temporary table to the actual metric tables.


### Run the Migration

> THINGS TO NOTE BEFORE EXECUTING THIS TOOL
> * HAVE AWS SDK SETUP WITH CREDENTIALS
> * BACKUP THE RDS DATABASE


```shell
>  cd sif-core/typescript/tools/migrator

# Replace <tenant> and <environment> with actual values
# NOTE: ENSURE THE CORRECT AWS_REGION is exported
sif-core/typescript/tools/migrator>  npm run migrate:metrics -- <tenant> <environment>
```
