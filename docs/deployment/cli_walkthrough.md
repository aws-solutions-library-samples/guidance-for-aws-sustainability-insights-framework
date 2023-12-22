# Getting Started

**The SIF Command Line Interface (sif-cli)** is an open-source tool that empowers you to interact with SIF components through commands in your command-line shell. With minimal configuration, `sif-cli` simplifies many of the complexities associated with managing SIF. Additionally, it incorporates various functionalities to ensure compatibility between your deployed version and the latest release of SIF.

> If you want to perform the deployment manually using cdk follow the instruction [here](./cdk_walkthrough.md).

To set up the CLI in `/usr/local/lib/sif` and `/usr/local/bin/sif`, run this script. The script requires sudo and isn’t Windows compatible.

```shell
curl https://raw.githubusercontent.com/aws-solutions-library-samples/guidance-for-aws-sustainability-insights-framework/main/scripts/install-cli.sh | sh
```

## Prerequisites

### Tools

The following tools are required in order use `sif-cli`. Please reference each tool's documentation linked for full installation instructions.

| Tool / Technology                                                    | Reason                                                           |
|----------------------------------------------------------------------|------------------------------------------------------------------|
| [git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git) | Used by `sif-cli` to clone and switch version of SIF repository. |
| [docker](https://docs.docker.com/get-docker/)                        | Used by `sif-cli` to build Java modules.                         |

### IAM Credentials

The command-line interface executes several AWS CDK commands (e.g., `cdk deploy`, `cdk destroy`) to deploy and remove AWS CloudFormation stacks in your target account. Please ensure that you have IAM credentials with the appropriate policies set up in your shell environment when running the scripts below.

### AWS Client VPN certificates

If you wish to enable AWS Client VPN during the deployment of platform shared components, please follow the steps outlined [here](https://docs.aws.amazon.com/vpn/latest/clientvpn-admin/client-authentication.html#mutual) to generate the  necessary certificates. Subsequently, upload these certificates to AWS Certificate Manager ([ACM](https://aws.amazon.com/certificate-manager/)).

After completing the deployment, you can establish a connection to the AWS Client VPN using either the AWS-provided client or the OpenVPN client, as specified [here](https://docs.aws.amazon.com/vpn/latest/clientvpn-user/client-vpn-user-what-is.html).

**Note** A Client VPN connection is not allowed if using an existing VPC.

### RDS Concurrency Limit

When deploying SIF for a specific environment, the Aurora serverless cluster is shared among multiple tenants within that same environment. As a result, the actions of one tenant can potentially negatively impact the experience of another tenant within the system.

SIF employs concurrency control to regulate the number of simultaneous activities that can be executed against the database. The pipeline processors state machine performs a series of operations that can consume database resources. Before each of these operations, a `StepFunction` task must acquire a lock that is shared among multiple tenants within an environment before proceeding. The concurrency limit represents the number of available locks that can be leased by processes from various tenants.

The appropriate value for the RDS concurrency limit depends on your specific usage pattern. If your usage typically involves infrequent uploads of a few large files, it may be sensible to use a smaller number of locks. However, if SIF is used by multiple users across various locations to frequently upload a small number of files, it may be more practical to have a larger number of available locks.

Requests to "acquire" or "release" locks, which contain the stepFunction taskToken necessary for callback execution, are transmitted to an `SQS` (Simple Queue Service). The `acquireLock` Lambda function reads these requests from the queue, acquires the lock, and subsequently resumes the StepFunction execution.

To ensure smooth SIF deployments, it's essential to verify that the `acquireLockQueue` and `releaseLockQueue` are empty prior to deployment. This precaution helps prevent messages from being processed incorrectly.

### SIF, VPCs, and Using an Existing VPC

A SIF environment deploys resources into a VPC. Resources such as the Aurora cluster are deployed using subnets with no connectivity outside of the subnet (no NAT, no IGW) other than a VPC endpoint to S3. For the purposes of SIF these are called `isolated` subnets. Lambda functions which require access to the database are deployed attached to subnets in the VPC with no external connectivity other than VPC endpoints to multiple AWS services. For the purposes of SIF these are called `private` subnets.

A default deployment of SIF creates the VPC and subnets for you. You also have the option to use an exsiting VPC. This can be done during a platform deployment by specifying the VPC ID as well as the subnet IDs for the SIF `isolated` and SIF `private` subnets. An existing VPC must be configured with both `isolated` and `private` subnets. It is recommended to created at least 2 subnets of each type for high-availablity. The `isolated` subnet type should be configured with no external connectivity, meaning no NAT gateway, no internet gateway (IGW), and only a VPC endpoint connection to S3. The `private` subnets should be configured with no external connectivity except VPC endpoints for the following services:

* DYNAMODB
* S3
* KMS
* ATHENA
* CLOUDFORMATION
* EVENTBRIDGE
* SQS
* XRAY
* SECRETS_MANAGER
* ECS
* CLOUDWATCH_LOGS
* ECR
* ECR_DOCKER
* SSM
* RDS
* GLUE
* CLOUDWATCH
* LAMBDA
* STEP_FUNCTIONS

Take a look at how SIF creates a VPC in the [Network CDK construct](../../infrastructure/platform/src/shared/network.construct.ts) for a detailed example of the required configuration of an existing VPC.

## Installing

### 1. Initializing Your Development Environment

To initialize your current development environment with all the required software for SIF deployment, run the following command:

```shell
sif init
```

### 2. Clone SIF Repository

You can clone SIF from the GitHub repository into a folder named sif-core within the current folder where sif-cli is running by executing the following command:

```shell
sif core clone
```

```
USAGE
  $ sif core clone [-r <value>]

FLAGS
  -r, --repositoryUrl=<value>  Url of sif repository

DESCRIPTION
  Clone SIF into current folder

EXAMPLES
  $ sif core clone -r https://github.com/aws-solutions-library-samples/guidance-for-aws-sustainability-insights-framework

  $ sif core clone
```


### 3. List SIF Release Versions

To list available SIF versions for deployment, run the following command. This list is retrieved from the SIF GitHub [releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases).

```shell
sif core releases
```

```
USAGE
  $ sif core releases [--json]

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Listing the existing tags in the SIF repository

EXAMPLES
  $ sif core releases
```

By default, sif core clone should configure the latest version as your selected version. To check which SIF version is currently checked out, use the following command:

```shell
sif core version
```

```
USAGE
  $ sif core version [--json]

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Print the release tag currently checked out. If there is no release tag, show the branch and commit id

EXAMPLES
  $ sif core version
```

### 4. Build SIF Projects

Now that you have selected the version you want to deploy, run the following command to build SIF. This will build all the modules in the SIF monorepo:

```shell
sif core build
```
```
USAGE
  $ sif core build

DESCRIPTION
  Performs incremental build of all SIF modules

EXAMPLES
  $ sif core build
```


### 5. Deploying SIF Environment

To start the environment deployment process, execute the following command. In this example, we specify `demo` as the name of the environment. `sif-cli` will guide you through a list of configurable settings that you can apply to your SIF environment deployment:

```shell
sif environment install -e demo
```
```
USAGE
  $ sif environment install -e <value> [-r <value>] [--json] [-h -c <value>]

FLAGS
  -c, --config=<value>       Path to configuration file used for environment upgrade
  -e, --environment=<value>  (required) An environment represents an isolated deployment of tenantId(s)
  -h, --headless             Perform SIF environment upgrade in headless mode, if specified you also need to specify the
                             configuration file
  -r, --region=<value>       AWS region used when running the subcommands

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Install SIF for the specified environment

EXAMPLES
  $ sif environment install -e stage

  $ sif environment install -e stage -h -c <PATH_TO_CONFIG_FILE>
```


You can then list the deployed environments by running the following command, which should include `demo` as one of the deployed environments:

```shell
sif environment list
```
```
USAGE
  $ sif environment list [-r <value>] [--json]

FLAGS
  -r, --region=<value>  AWS region used when running the subcommands

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List SIF installed environments

EXAMPLES
  $ sif environment list
```
### 6. Modifying configuration of SIF Environment

If you want to modify any of the configurable values for your environment, you can run the following command to re-deploy the SIF environment:

```shell
sif environment configure -e demo
```
```
USAGE
  $ sif environment configure -e <value> [-r <value>] [--json] [-h -c <value>]

FLAGS
  -c, --config=<value>       Path to configuration file used for deployment
  -e, --environment=<value>  (required) An environment represents an isolated deployment of tenantId(s)
  -h, --headless             If provided, you also need to specify the path configuration file using -c
  -r, --region=<value>       AWS region used when running the subcommands

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Modify SIF configuration for the specified environment

EXAMPLES
  $ sif environment configure -e stage

  $ sif environment configure -e stage -h -c <PATH_TO_CONFIG_FILE>
```

> You can only configure an environment with the same version as your cloned SIF repository. Use sif environment upgrade to upgrade your SIF environment to the latest version.


### 7. Deploying SIF Tenant

To deploy a tenant named `sampleTenant` to your demo environment, run the following command. Similar to environment deployment, the command-line interface will guide you through a list of configurable settings that you can apply to your SIF instance deployment:

```shell
sif instance install -e demo -t sampleTenant
```

```
USAGE
  $ sif instance install -e <value> -t <value> [-r <value>] [-h -c <value>]

FLAGS
  -c, --config=<value>       Path to configuration file used for deployment
  -e, --environment=<value>  (required) The environment to deploy the tenant to
  -h, --headless             If provided, bypass the questions. You will also need to specify the path configuration
                             file using -c
  -r, --region=<value>       AWS region used when running the subcommands
  -t, --tenantId=<value>     (required) The id of the tenant to deploy

DESCRIPTION
  Walks the user through an interactive list of questions needed to deploy sif core.

EXAMPLES
  $ sif instance install -t demo -e prod -r us-west-2
```

To list the tenants currently deployed for that environment, use the following command. This should return `sampleTenant` as one of the items in the list:

```shell
sif instance list -e prod
```

```
USAGE
  $ sif instance list -e <value> [-r <value>]

FLAGS
  -e, --environment=<value>  (required) An environment represents an isolated deployment of tenantId(s)
  -r, --region=<value>       Region used for listing of sif tenants

DESCRIPTION
  Lists all deployed tenants within a specific environment

EXAMPLES
  $ sif instance list -t demo -e prod -r us-west-2 -a 1234567
```

### 8. Modifying configuration of SIF Tenant

If you want to modify any of the configurable values for your tenant, you can run the following command to re-deploy the SIF instance:

```shell
sif instance configure -e demo -t sampleTenant
```
```
USAGE
  $ sif instance configure -e <value> -t <value> [-r <value>] [-h -c <value>]

FLAGS
  -c, --config=<value>       Path to configuration file used for deployment
  -e, --environment=<value>  (required) The environment to redeploy the same instance version to
  -h, --headless             If provided, bypass the questions. You will also need to specify the path configuration
                             file using -c
  -r, --region=<value>       AWS region used when running the subcommands
  -t, --tenantId=<value>     (required) The id of the tenant to redeploy

DESCRIPTION
  Redeploys the same instance version.

EXAMPLES
  $ sif instance configure -t demo -e prod -r us-west-2
```


> You can only configure an environment with the same version as your cloned SIF repository. Use sif environment upgrade to upgrade your SIF environment to the latest version.

## Testing

### 1. Generating the Postman Environment

You can download the SIF Postman collection from [here](../postman/sif_core.postman_collection.json). Run the following command to generate the SIF [Postman environment](https://learning.postman.com/docs/sending-requests/managing-environments/) to be uploaded to Postman for testing your tenant deployment:

```shell
sif instance postman -e demo -t sampleTenant
```

```
USAGE
  $ sif instance postman -e <value> -t <value> [-r <value>]

FLAGS
  -e, --environment=<value>  (required) The environment used to generate the postman environment file
  -r, --region=<value>       AWS region used when running the subcommands
  -t, --tenantId=<value>     (required) The tenantId used to generate the postman environment file

DESCRIPTION
  Walks the user through the process to generate the postman environment file.

EXAMPLES
  $ sif instance postman -t demo -e prod -r us-west-2 -a 1234567
```

### 2. Generating authentication token

To generate the authentication token required by Postman, run the following command:

```shell
sif instance auth -e demo -t sampleTenant -g / -u test@user.com -p password
```

```
USAGE
  $ sif instance auth -e <value> -t <value> -u <value> -p <value> -g <value> [-r <value>]

FLAGS
  -e, --environment=<value>  (required) The environment to authenticate against
  -g, --groupId=<value>      (required) [default: /] The groupId for the token
  -p, --password=<value>     (required) The password of the user
  -r, --region=<value>       AWS region used when running the subcommands
  -t, --tenantId=<value>     (required) The id of the tenant to authenticate against
  -u, --username=<value>     (required) The username to generate the token for

DESCRIPTION
  Walks the user through the authentication process to get a JWT token to be used for API calls.

EXAMPLES
  $ sif instance auth -t demo -e prod -r us-west-2 -a 1234567
```


### 3. Running SIF module API locally

To initiate the local API server for one of the SIF modules for testing, use the following command:

```shell
sif instance start -e demo -t sampleTenant -g -m pipelines
```

```
USAGE
  $ sif instance start -e <value> -t <value> -m <value> [-r <value>]

FLAGS
  -e, --environment=<value>  (required) SIF environment to use for starting the module
  -m, --module=<value>       (required) SIF module to run
  -r, --region=<value>       AWS region used when running the subcommands
  -t, --tenantId=<value>     (required) SIF tenantId to use for starting the module

DESCRIPTION
  Run the selected SIF module locally

EXAMPLES
  $ sif instance start -m pipelines
```


## Upgrading

### 1. Upgrading SIF Environment

Switch to the version that you want to upgrade:

```shell
sif core switch -r v1.8.1
```

```
USAGE
  $ sif core switch [-c <value> | [-r <value> | -b <value> | ] | ]

FLAGS
  -b, --branch=<value>    SIF repository branch
  -c, --commitId=<value>  SIF revision commit hash
  -r, --release=<value>   SIF release version

DESCRIPTION
  Switch the local SIF repository to the specified RELEASE, BRANCH or COMMIT ID

EXAMPLES
  $ sif core switch -b main

  $ sif core switch -c ead2b1d

  $ sif core switch -r v1.7.1

  $ sif core switch -r LATEST
```

Run the following command to upgrade your environment deployment to the version specified above:

```shell
sif environment upgrade -e demo
```

```
USAGE
  $ sif environment upgrade -e <value> [-r <value>] [--json] [-u <value>] [-h -c <value>]

FLAGS
  -c, --config=<value>          Path to configuration file used for environment upgrade
  -e, --environment=<value>     (required) An environment represents an isolated deployment of tenantId(s)
  -h, --headless                Perform SIF environment upgrade in headless mode, if specified you also need to specify
                                the configuration file
  -r, --region=<value>          AWS region used when running the subcommands
  -u, --upgradeTenants=<value>  Upgrade all tenants to match the local version

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Perform upgrade of SIF environment version

EXAMPLES
  $ sif environment upgrade -e stage

  $ sif environment upgrade -e stage -h -c <PATH_TO_CONFIG_FILE>
```

> You can only upgrade SIF to a version higher than your current deployed version.

### 2. Upgrading SIF Tenant

Switch to the version that you want to upgrade:

```shell
sif core switch -r v1.8.1
```

Run the following command to upgrade your instance deployment to the version specified above:

```shell
sif instance upgrade -e demo -t sampleTenant
```

```
USAGE
  $ sif instance upgrade -e <value> -t <value> [-r <value>] [-h -c <value>]

FLAGS
  -c, --config=<value>       Path to configuration file used for upgrade
  -e, --environment=<value>  (required) The environment to upgrade the tenant for
  -h, --headless             If provided, bypass the questions. You will also need to specify the path configuration
                             file using -c
  -r, --region=<value>       AWS region used when running the subcommands
  -t, --tenantId=<value>     (required) The id of the tenant to upgrade

DESCRIPTION
  Perform upgrade of SIF instance version

EXAMPLES
  $ sif instance upgrade -t demo -e prod -r us-west-2 -a 1234567
```

> Depending on the release version, not all tenant upgrades will require environment upgrades. `sif-cli` will validate the compatibility version between your environment and tenant before performing the deployment. In cases where tenant upgrade is incompatible, you need to perform an environment upgrade first.


## Tear Down

### 1. Deleting SIF Environment

To remove a tenant from your environment, use the following command:

```shell
sif instance delete -e demoEnvironment -t demoTenant
```
```
USAGE
  $ sif environment delete -e <value> [-r <value>] [--json] [-f]

FLAGS
  -e, --environment=<value>  (required) An environment represents an isolated deployment of tenantId(s)
  -f, --force                If specified, will also delete all tenants on the environment
  -r, --region=<value>       AWS region used when running the subcommands

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Delete SIF environment

EXAMPLES
  $ sif environment delete -e stage

  $ sif environment delete -e stage --force
```
### 2. Deleting SIF Instance

Once all the tenants associated with the environment have been removed, you can remove the environment by running the following command:

```shell
sif environment delete -e demoEnvironment
```

```
USAGE
  $ sif instance delete -e <value> -t <value> [-r <value>]

FLAGS
  -e, --environment=<value>  (required) The environment to delete the tenant from
  -r, --region=<value>       AWS region used when running the subcommands
  -t, --tenantId=<value>     (required) The id of the tenant to delete

DESCRIPTION
  Delete the sif tenant.
```

For more information about the complete commands supported by SIF, you can find them here.


