## Cognito implementation

The initial release of this module supports Cognito User Pool integration only. This may change as new requirements arise.

A dedicated Cognito User Pool is created per deployment.

Cognito users are configured to provide just an email which will also represent the username, and must be verified before use.

A Cognito Group is created per each group and role combination. For example, if creating the group `/usa/northwest` within the application then the Cognito Groups `/usa/northwest|||admin`, `/usa/northwest|||contributor`, and `/usa/northwest|||reader` are created. This module will manage a users Cognito Group membership based on the group and roles configured.

As part of the initial deployment the Cognito Groups `/|||admin`, `/|||contributor`, `/|||reader` are automatically created along with an administrator user assigned to the `/|||admin` Cognito Group.

All modules within the platform (beyond just this module) that expose REST API's via API Gateway are configured to use `COGNITO_USER_POOLS` type authentication. This ensures that all modules share the same Cognito User Pool. As part of the integration between API Gateway and Lambda, the `email` and `cognito:groups` claims are decoded, verified, and added to the request.

All API requests made against any modules are carried out within the context of a specific group. This is the users default group (as per their user profile) by default. To override the group context of a specific API, set the `x-groupcontextid` header to the required group.

### Cognito challenge flow to set group context

The Cognito that is deployed as part of `sif-core` is configured to use [Secure Remote Password (SRP) protocol](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-authentication-flow.html#Built-in-authentication-flow-and-challenges). The user's default group is inserted into the JWT claims as part of the [pre token generation](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-pre-token-generation.html) trigger. After successful authentication the id token can be used to authenticate API calls.

### Manually verifying a user's email

```shell
> aws cognito-idp admin-update-user-attributes --user-pool-id YOUR_USER_POOL_ID --username EMAIL --user-attributes Name="email_verified",Value="true"
```

### Generating a token

1. Run the command below inside the `packages/integrationTests` folder:

   a. New User

```shell
> npm run generate:token -- <tenantId> <environment> <username> <initialPassword> <newPassword>
```

   b. Existing User

```shell
> npm run generate:token -- <tenantId> <environment> <username> <password>
```

2. Use the id token from the previous step and provide it as the `Authorization` request header.
