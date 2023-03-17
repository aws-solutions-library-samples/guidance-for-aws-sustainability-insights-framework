## The following env config needs defining per environment:

Running integration tests locally:

```ini
NODE_ENV=local
```

Running integration tests on a live environment:
NOTE: the admin user/pass needs to be confirmed and have password reset for new users.

```ini
NODE_ENV=
AWS_REGION=

ADMIN_USER_PASSWORD=
ADMIN_USER_USERNAME=
COGNITO_CLIENT_ID=

ACCESS_MANAGEMENT_BASE_URL=
IMPACTS_BASE_URL=
CALCULATIONS_BASE_URL=
PIPELINE_PROCESSOR_BASE_URL=
PIPELINES_BASE_URL=
REFERENCE_DATASETS_BASE_URL=

ACTIVITIES_TABLE_NAME=
```

Run the following command to run the tests

```shell
# if specifying each env var on the command line
> export <key>=<val>; rushx test

# or if instead having all the env vars stored in env.bash
> . <path_to_env_file>; rushx test
# or for specific tests...
> . <path_to_env_file>; rushx test -- dist/features/assetlibrary/<module>

```
