# Amazon DataFabric Connector Overview

## Introduction

[Amazon DataZone](https://docs.aws.amazon.com/datazone/latest/userguide/what-is-datazone.html) is a data management service that makes it faster and easier for you to catalog, discover, share, and govern data stored across AWS, on-premises, and third-party sources. With Amazon DataZone, administrators who oversee organization’s data assets can manage and govern access to data using fine-grained controls. These controls help ensure access with the right level of privileges and context. Amazon DataZone makes it easy for engineers, data scientists, product managers, analysts, and business users to share and access data throughout an organization so they can discover, use, and collaborate to derive data-driven insights.

The SIF connector for Amazon DataFabric allows one to create a pipeline that uses data asset published in Amazon DataZone as an input. Amazon DataFabric connector currently support Glue and Redshift table asset types with more types to be added in the future. It assumes that the file will be of `csv` type with header on the first row.

## Walkthrough

### Step 1: Create a pipeline that uses the Amazon DataFabric Connector

The example below creates an `activities` pipeline that is configured with Amazon DataFabric connector.

```shell
POST <pipelinesUrl>/pipelines
x-groupcontextid: /
Accept-Type: application/json
Content-Type: application/json
Accept-Version: 1.0.0
Authorization: <token>
{
	// This sample payload only shows the important bit for the dataFabric connector, you will need to fill the rest of the payload
    "connectorConfig": {
        "input": [
            {
                "name": "sif-dataFabric-pipeline-input-connector"
            }
        ]
    },
    "type": "activities",
    ...
}
```

### Step 2: Trigger pipeline execution and include Amazon DataZone asset detail

When you create the pipeline execution, you need to specify the [domainId](https://docs.aws.amazon.com/datazone/latest/userguide/datazone-concepts.html#what-are-domains), [environmentId](https://docs.aws.amazon.com/datazone/latest/userguide/datazone-concepts.html#what-are-projects), [assetListingId](https://docs.aws.amazon.com/datazone/latest/APIReference/API_AssetListing.html) and region (where DataZone is configured). The connector will query the asset metadata to determine the type of the asset, retrieve the temporary credentials and then query the asset and use that as a pipeline input.

```shell
POST <pipelineProcessorsUrl>/pipelines/<pipelineId>/executions
x-groupcontextid: /
Accept-Type: application/json
Content-Type: application/json
Accept-Version: 1.0.0
Authorization: <token>
{
	// This sample payload only shows the important bit for the dataFabric connector, you will need to fill the rest of the payload
    "actionType": "create",
    "connectorOverrides": {
        "sif-dataFabric-pipeline-input-connector": {
            "parameters": {
                "domainId": "1111",
                "environmentId": "2222",
                "assetListingId": "3333",
                "region": "us-west-2"
            }
        }
    },
    ...
}
```
