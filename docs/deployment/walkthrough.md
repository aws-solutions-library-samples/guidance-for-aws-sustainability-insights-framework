# Deployment Walkthrough

## Prerequisites

### AWS Client VPN certificates

If you want to deploy the platform shared components with AWS Client VPN, then follow the step outlined in [here](https://docs.aws.amazon.com/vpn/latest/clientvpn-admin/client-authentication.html#mutual), to generate the necessary
certificates and upload it to [ACM](https://aws.amazon.com/certificate-manager/).

Once the deployment is finished, you can connect to the AWS Client VPN, by using AWS provided client or OpenVPN client as specified [here](https://docs.aws.amazon.com/vpn/latest/clientvpn-user/client-vpn-user-what-is.html).

### RDS Concurrency Limit

When you deploy SIF for a particular environment, the Aurora serverless cluster is being shared by multiple tenants within the same environment. Because of this, the activity of one tenant can have negative impact of another tenant's use of
the system.

SIF uses concurrency control to throttle the number of activities that can be performed at any one time against the database. The [pipeline processors](../../typescript/packages/apps/pipeline-processors/README.md) state machine performs a
list of operations that has a potential to consume the database resources. Before each of this operation, a **StepFunction** task needs to acquire a lock (shared by the multiple tenants within an environment) before it can proceed. The
concurrency limit is the number of locks that are available to be leased by processed in multiple tenant.

The value of the `RDS concurrency limit` will depend on your usage pattern. If your pattern of usage is to upload a few big files infrequently, it makes sense to use a small number of locks. If SIF is being used by multiple users in
multiple location to upload a small number of files frequently, then a large number of locks makes more sense.

The `acquire/release lock` requests (contains the stepfunction `taskToken` that will be used in a callback to resume the execution) is being sent to an SQS, `acquireLock` lambda will read the request from the queue, acquire the lock and resume the StepFunction execution.

Ensure that these queues (`acquireLockQueue` and `releaseLockQueue`) are empty before a SIF deployment to avoid messages being processed incorrectly.

### Tools

The following tools are required in order to clone the repositories, build, then deploy the framework. Please reference each tool's documentation linked for full installation instructions.

| Tool / Technology                                                                                | Reason                                                                                                                             |
|--------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------|
| [nvm](https://github.com/nvm-sh/nvm#installing-and-updating)                                     | [typescript modules] Simple way to manage multiple versions of Node.js.                                                            |
| Node.js v16.x                                                                                    | [typescript modules] Once `nvm` is installed, run `nvm install 16`, and/or switch to it using `nvm use 16`, to install nodejs v16. |
| [rush](https://rushjs.io/pages/developer/new_developer/)                                         | [typescript modules] Typescript monorepo manager.                                                                                  |
| [git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)                             | [all modules] Repository manager.                                                                                                  |
| [aws cli (v2)](http://docs.aws.amazon.com/cli/latest/userguide/installing.html)                  | [all modules] Used as part of some deployment scripts.                                                                             |
| [AWS CDK](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html#getting_started_install) | [all modules] Infrastructure as code.                                                                                              |
| [java 17](https://openjdk.org/projects/jdk/17/)                                                  | [java modules] Java runtime.                                                                                                       |
| [maven](https://maven.apache.org/install.html)                                                   | [java modules] Java build tool.                                                                                                    |
| [docker](https://docs.docker.com/get-docker/)                                                    | [java modules] Java CDK build process.                                                                                             |

### Decisions

Before starting, the following decisions need to be made. Replace the referenced tokens (e.g. `<environment>`) where referenced in the installation steps with the chosen value.

| Question                                                                                                                                                                                           | Mandatory? | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Token                         |
|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------|
| Region?                                                                                                                                                                                            | Y          | The AWS region to deploy SIF into.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `<region>`                    |
| Name of environment?                                                                                                                                                                               | Y          | An environment represents an isolated deployment of tenantId(s). E.g. it could follow CI/CD usage of environments such as `dev`, `test`, `prod`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `<environment>`               |
| Tenant ID?                                                                                                                                                                                         | Y          | SIF has multiple development modes. The simplest being a customer deploying a single instance of SIF for use (single-tenant mode), in comparison to a SaaS operator deploying multiple instances of SIF for their own customers to use within a specific environment (siloed multi-tenant mode). The tenant id uniquely identifies a specific SIF installation within a specific `<environment>`. Note that tenant IDs must begin with a letter [a-zA-Z].                                                                                                                                                          | `<tenantId>`                  |
| Admin email?                                                                                                                                                                                       | Y          | Each instance of SIF deployed is configured with a single admin user. This email represents the user. This must be a real valid email address.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `<administratorEmail>`        |
| Use SES to send out Cognito emails?                                                                                                                                                                | N          | By default Cognito sends out emails, such as passwords to new users, using its own built-in email functionality. This has [limitations](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-email.html#user-pool-email-default). Using the default is fine for developing against or trying out SIF, but for real world production deployments it is recommended that Amazon SES is configured to send out Cognito emails. If you want to use SES to send email from Cognito you first need to [create identities](https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html) within SES. |                               |
| If using SES, using [email address identity](https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html#verify-email-addresses-procedure)?                                                 | N          | As above, part of the Cognito SES configuration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `<verifiedEmail>`             |
| If using SES email address identity, an optional reply to email                                                                                                                                    | N          | As above, part of the Cognito SES configuration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `<replyToEmail>`              |
| If using SES email address identity, an optional from name                                                                                                                                         | N          | As above, part of the Cognito SES configuration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `<fromName>`                  |
| If using SES, using a [verified domain](https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html#verify-domain-procedure)?                                                               | N          | As above, part of the Cognito SES configuration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `<verifiedDomain>`            |
| Use AWS Client VPN to connect to resources inside VPC                                                                                                                                              | N          | By default, Client VPN is not included in the platform shared components, but if you need to access to resources inside VPC (e.g. RDS clusters), then set this to true                                                                                                                                                                                                                                                                                                                                                                                                                                             |                               |
| If using AWS Client VPN, an optional server certificate arn                                                                                                                                        | N          | As above, part of the Client VPN configuration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `<certArn>`                   |
| If using AWS Client VPN, an optional client certificate arn                                                                                                                                        | N          | As above, part of the Client VPN configuration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `<clienArn>`                  |
| Remove Aurora cluster on stack deletion?                                                                                                                                                           | N          | By default, Aurora cluster will not be removed when you deleted the SIF stacks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `<clusterDeletionProtection>` |
| Remove S3 bucket on stack deletion?                                                                                                                                                                | N          | By default, S3 buckets will not be removed when you deleted the SIF stacks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `<deleteBucket>`              |
| If you want to increase/decrease the concurrency limit that throttle operations on the database cluster?                                                                                           | N          | By default, RDS concurrency limit is set to 10.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `<rdsConcurrencyLimit>`       |
| If you want to perform text similarity matching using [CaML](https://www.amazon.science/publications/caml-carbon-footprinting-of-household-products-with-zero-shot-semantic-text-similarity) model | N          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `<includeCaml>`               |
| If using CaML, an optional s3 bucket                                                                                                                                                               | N          | By default, when CaML is enabled, the deployment process will download the pre-trained model and upload it to S3. This will bypass the process and using the existing model in S3.                                                                                                                                                                                                                                                                                                                                                                                                                                 | `<camlArtifactBucket>`        |
| If using CaML, an optional s3 object key                                                                                                                                                           | N          | By default, when CaML is enabled, the deployment process will download the pre-trained model and upload it to S3. This will bypass the process and using the existing model in S3.                                                                                                                                                                                                                                                                                                                                                                                                                                 | `<camlArtifactKey>`           |
| If using CaML, an optional deep learning model container tag for [Hugging Face](https://docs.aws.amazon.com/sagemaker/latest/dg-ecr-paths/ecr-us-east-2.html#huggingface-us-east-2.title)          | N          | By default, Hugging Face container tag is set to `1.13.1-transformers4.26.0-gpu-py39-cu117-ubuntu20.04`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `<camlContainerTag>`          |
| If using CaML, an optional version (using commit hash) used for checking out `sentence-transformers/all-mpnet-base-v2` repository to pull the pre-trained model                                    | N          | By default, the hash for the repository `sentence-transformer/all-mpnet-base-v2 repository` is set to `bd44305fd6a1b43c16baf96765e2ecb20bca8e1d`                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `<camlRepositoryHash>`        |
| If using CaML, an optional sagemaker instance type used to host the real time inference endpoint                                                                                                   | N          | By default, the instance type is set to `ml.g4dn.xlarge`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `<camlInstanceType>`          |
## Step 1 - Cloning the repository

```shell
> git clone git@github.com:aws-solutions-library-samples/guidance-for-aws-sustainability-insights-framework.git
```

## Step 2 - Deploy the typescript modules

### Initialize and build the code

```shell
>  cd sif-core/typescript

sif-core/typescript>  rush update --bypass-policy
sif-core/typescript>  rush build
```

### First time setup

First time installers will need to bootstrap their AWS accounts (a requirement of using AWS CDK):

```shell
# move to the platform infrastructure folder
sif-core/typescript>  cd ../infrastructure/platform

# bootstrap
infrastructure/platform>  npm run cdk -- bootstrap \
    -c environment=<environment> \
    --all
```

### Deploying platform shared components

> Note: This only needs to be run once per environment.

The platform components represent infrastructure that is created and shared across a specific environment, e.g. a shared Aurora cluster. An environment can compose of many SIF deployments such as to represent individual siloed tenants.
Multiple environments may be created per each AWS account / region.

If the _First time setup_ step was skipped, make sure are you running the commands from the `sif-core/infrastructure/platform` directory:

```shell
# deploy
sif-core/infrastructure/platform>  npm run cdk -- deploy \
    -c environment=<environment> \

	# [OPTIONAL] if using AWS Client VPN then set the following:
 	-c includeVpnClient=true -c certArn=<certArn> -c clientArn=<clientArn> \

 	# [OPTIONAL] by default, CaML is disabled, set this to true if you want to enable CaML:
 	-c includeCaml=true -c camlInstanceType <camlInstanceType> -c camlContainerTag=<camlContainerTag> -c camlRepositoryHash=<camlRepositoryHash> -c camlArtifactKey=<camlArtifactKey> -c camlArtifactBucket=<camlArtifactBucket> \

 	# [OPTIONAL] by default, the number of rdsConcurrencyLimit is 5:
 	-c rdsConcurrencyLimit=<rdsConcurrencyLimit> \

 	# [OPTIONAL] by default, all s3 buckets are retained when stack is deleted, set this to true if you want the bucket to be deleted:
 	-c deleteBucket=true \

	# [OPTIONAL] by default, RDS clusters are retained when stack is deleted, set this to false if you want the cluster to be deleted:
 	-c clusterDeletionProtection=false \

    --all
```

### Deploying tenant components

These components represent the infrastructure that is unique to each SIF instance deployed within an environment.

Note that the `deploy` command following has some optional arguments as described in their related comments:

```shell
# move to the tenant infrastructure folder
sif-core/infrastructure/platform>  cd ../tenant

# deploy
sif-core/infrastructure/tenant> npm run cdk -- deploy \
 -c tenantId=<tenantId> \
 -c environment=<environment> \
 -c administratorEmail=<administratorEmail> \

 # [OPTIONAL] by default, deletion of any resources (e.g. emission factors) are not allowed as these are all versioned
 # and tracked for auditing and traceability purposes. But if just trying out, or deploying where you will be executing
 # the frameworks own integration tests, set the following value to true:
 -c enableDeleteResource=true \

 # [OPTIONAL] by default, CaML is disabled, set this to true if you want to enable CaML:
 -c includeCaml=true \

 # [OPTIONAL] by default, all s3 buckets are retained when stack is deleted, set this to true if you want the bucket to be deleted:
 -c deleteBucket=true \

 # [OPTIONAL] by default, pipeline processors download 5 audit files in parallel to avoid hitting the API limit, you can modify this limit:
 -c downloadAuditFileParallelLimit=<downloadAuditFileParallelLimit> \

 # [OPTIONAL] if using SES email address identity with Cognito then set the following:
 -c cognitoFromEmail=<verifiedEmail> \

 # [OPTIONAL] if using SES email address identity with Cognito it is also possible to change the reply from email and name:
 -c cognitoReplyToEmail=<replyToEmail> -c cognitoFromName=<fromName> \

 # [OPTIONAL] if using SES domain verification with Cognito then set the following:
 -c sesVerifiedDomain=<verifiedDomain> \

 --all --require-approval never --concurrency=10
```

## Step 3 - Set the Cognito admin user's password

As part of the deployment a Cognito user is created with their temporary password emailed to `<administratorEmail>`. Use the temporary password to change it as follows:

```shell
# move to the core integration tests project where helper scripts are available
sif-core/infrastructure/platform>  cd ../../typescript/packages/integrationTests

# change the password
sif-core/typescript/packages/integrationTests>   npm run generate:token -- <tenantId> <environment> <administratorEmail> <temporaryPassword> <newPassword>
```

**Note:** If the temporary password generated by Cognito contains characters other than letters or numbers (e.g. `<`), then the temporary password will need to be enclosed in quotes:

```
sif-core/typescript/packages/integrationTests>   npm run generate:token -- <tenantId> <environment> <administratorEmail> '<temporaryPassword>' <newPassword>
```

## Finished

SIF is now deployed and available for use. Interaction with SIF is done through the REST APIs exposed by each module. The API endpoints for these APIs can be found as outputs in the terminal during the deployment or as outputs in the
CloudFormation console after the deployment completes. Alternatively, a script exists to generate a Postman environment file containing the endpoints. See [the Postman doc](../integration/postman.md) for more on running this script.

Visit the [user guide walkthrough](../walkthrough.md) to learn how to use the framework.
