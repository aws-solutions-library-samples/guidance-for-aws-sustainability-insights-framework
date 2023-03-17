# Cross Tenant Data Sharing

## Introduction

This component facilitates data sharing between tenants. Tenants can be configured to expose activities, calculations, and reference datasets, of specific groups to be accessible externally by other tenants within the same SIF environment and AWS region.

When content is shared, it is shared as read only to other tenants,

## Walkthrough

### Dictionary

- *Requesting Tenant:*  a tenant that requests shared resources from another tenant.
- *Sharing Tenant:* a tenant that shares resources with other tenants.

### Pre-requisite

For this walkthrough, we assume that you have AWS CLI access and have admin permissions to run the CDK deploy commands.

### Deploying the tenants

To enable data sharing between tenants they need to be deployed with the correct configurations.

There are two fields that need to be passed during CDK deploy command:

- *externallySharedGroupIds* : Defines the `groupId` that is shared by the sharing tenant.

- *outgoingTenants* : this field is set in the requesting tenant and follow `<tenantId>:<groupId>` format.

Sample call to deploy a tenant sharing content:

```shell
cdk deploy -c enableDeleteResource=true \
-c tenantId=tenant001 \
-c environment=dev \
-c administratorEmail=someone@somewhere.com \
-c externallySharedGroupIds=/shared \
--all \
--require-approval never \
--concurrency=5
```

Sample call to deploy a tenant able to access content from another:

```shell
cdk deploy -c enableDeleteResource=true \
-c tenantId=tenant002 \
-c environment=dev \
-c administratorEmail=someone@somewhereelse.com \
-c outgoingTenantPaths=tenant001:/shared \
 --all \
 --require-approval never \
 --concurrency=5
```

#### Request

The Requesting Tenant will act as a proxy and forward any calls meant for the sharing tenant.

To gain access to data from the tenant sharing content, the request needs to contain the `x-tenant` header with the value defined as `<tenantId>:<groupId>`.

*Note* As shared data is readonly, only GET and OPTIONS calls are supported.

```shell
GET /activities/<id>
Accept: application/json
Accept-Version: 1.0.0
Authorization: <INSERT TOKEN>
x-tenant: <tenantId>:<groupId>
```
