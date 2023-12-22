# Cognito Implementation

## Overview

- This module currently supports only Cognito User Pool integration.
- Each deployment gets its own dedicated Cognito User Pool.
- Users need to provide an email, which will also serve as their username. This email must be verified before it can be used.
- All modules with REST API's via API Gateway use the `COGNITO_USER_POOLS` authentication type, ensuring a shared Cognito User Pool across all modules.

## User Groups and Roles

- A unique Cognito Group is created for each combination of SIF group and role. For instance, creating the group `/usa/northwest` in the application will lead to the creation of Cognito Groups: `/usa/northwest|||admin`, `/usa/northwest|||contributor`, and `/usa/northwest|||reader`.
- The module manages an instances Cognito Group membership based on the group and roles set.
- During the initial deployment, Cognito Groups `/|||admin`, `/|||contributor`, and `/|||reader` are created. An administrator user is also created and assigned to the `/|||admin` Cognito Group.

## API Requests

- All API requests are executed within the context of a specific group, which defaults to the user's default group. To change the group context for a specific API, use the `x-groupcontextid` header.
- As part of the integration between API Gateway and Lambda, the `email` and `cognito:groups` claims are decoded, verified, and added to the request.

### Cognito Challenge Flow

- The deployed Cognito uses the [Secure Remote Password (SRP) protocol](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-authentication-flow.html#Built-in-authentication-flow-and-challenges).
- The user's default group is added to the JWT claims during the [pre token generation](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-pre-token-generation.html) trigger.
- After successful authentication, the id token can be used for API call authentication.

### Manual Email Verification

To manually verify a user's email:

```shell
> aws cognito-idp admin-update-user-attributes --user-pool-id YOUR_USER_POOL_ID --username EMAIL --user-attributes Name="email_verified",Value="true"
```

### Token Generation

To obtain the required authorization token for API invocation, execute following command using [sif-cli](https://github.com/aws-solutions-library-samples/guidance-for-aws-sustainability-insights-framework-cli) :

- For a new user:

```shell
sif instance auth -e <environment> -t <tenant> -u <username> -p <initialPassword> -n <newPassword>
```

- For an existing user:

```shell
sif instance auth -e <environment> -t <tenant> -u <username> -p <password>
```

Use the `id` token from the previous step and provide it as the `Authorization` request header.
