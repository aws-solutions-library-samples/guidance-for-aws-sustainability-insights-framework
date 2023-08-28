# Invoking REST API(s) using Postman

## Postman collections

A [Postman collection](../postman/sif_core.postman_collection.json) as well as a [Postman environment template](../postman/sif_core.local.postman_environment.json) are provided which can be imported into Postman for use.

Alternatively, a helper script is available to create a Postman environment file by automatically looking up the configuration values from an existing deployment. To use this helper script:

```shell
# move to the integration tests module
guidance-for-aws-sustainability-insights-framework> cd typescript/packages/integrationTests

# run the script, replacing the tokens
guidance-for-aws-sustainability-insights-framework/typescript/packages/integrationTests> npm run generate:postman:environment <tenantId> <environment> '/' <administratorEmail> <password>
```

## Authentication

All SIF REST API requests need to contain an authorization token. A helper script is provided to generate one:

```shell
# The script is part of the integration tests module
guidance-for-aws-sustainability-insights-framework> cd typescript/packages/integrationTests

# Replace the tokens with your values (only provide <newPassword> if changing password)
guidance-for-aws-sustainability-insights-framework/typescript/packages/integrationTests> npm run generate:token -- <tenantId> <environment> <administratorEmail> <password> <newPassword>
```

The output of the command will be `token: <token>`. Make a note of the value of `<token>`.

To set up the authentication token with the Postman collection, double-click the collection root and set the Authorization Type Bearer to the value of `<token>`.
