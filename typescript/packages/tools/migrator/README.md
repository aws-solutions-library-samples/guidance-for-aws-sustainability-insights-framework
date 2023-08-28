# Pipeline Executions Migrator

This module migrates the pipeline execution data from v1 (`sif-<TENANT_ID>-<ENVIRONMENT>-pipelineProcessors`) to v2 table (`sif-<TENANT_ID>-<ENVIRONMENT>-pipelineProcessorsV2`)). This applies when you migrate from  `v1.7.2` or lower version	.

## How does it work ?

To run the migration this tool exposes a command which should be executed to kick off the migration process. The migration process will scan the old dynamodb metrics table ,convert item to the new structure and insert into the v2 tables.

### Run the Migration

> THINGS TO NOTE BEFORE EXECUTING THIS TOOL
> * HAVE AWS SDK SETUP WITH CREDENTIALS
> * LATEST VERSION OF SIF HAS BEEN DEPLOYED (THE LATEST DEPLOYMENT WILL NOT DELETE V1 DYNAMODB TABLE)

```shell
>  cd guidance-for-aws-sustainability-insights-framework/typescript/packages/tools/migrator

# Replace <tenant> and <environment> with actual values
# NOTE: ENSURE THE CORRECT AWS_REGION is exported
guidance-for-aws-sustainability-insights-framework/typescript/packages/tools/migrator>  npm run migrate:executions -- <tenant> <environment>
```

# Metrics Migrator

This module migrates metrics from dynamodb to RDS. This applies to the latest release of SIF which includes changes to the metrics datastore.

## How does it work ?

To run the migration this tool exposes a command which should be executed to kick off the migration process. The migration process will scan the old dynamodb metrics table and write an output file to S3. Once the file is loaded to s3 then
the tool will queue a sqs message to kick off the next stage of migration which is to ingest the output file to RDS. The file gets written to a temporary table and then the metrics are copied from the temporary table to the actual metric
tables.

### Run the Migration

> THINGS TO NOTE BEFORE EXECUTING THIS TOOL
> * HAVE AWS SDK SETUP WITH CREDENTIALS
> * BACKUP THE RDS DATABASE

```shell
>  cd guidance-for-aws-sustainability-insights-framework/typescript/packages/tools/migrator

# Replace <tenant> and <environment> with actual values
# NOTE: ENSURE THE CORRECT AWS_REGION is exported
guidance-for-aws-sustainability-insights-framework/typescript/packages/tools/migrator>  npm run migrate:metrics -- <tenant> <environment>
```
