# Migration of backward incompatible changes

While we endeavor to always make backward compatible changes, there may be times when we need to make changes that are not backward compatible. If these changes are made at the API level then the affected modules REST API vendor mime types
will be versioned supporting both new and old versions, as well as the modules minor version bumped. But if the change affect something else such as how configuration is handled, or how applications are deployed, then the major versions of
the modules will be bumped with migration notes added here.

## Migrating from Tag [RELEASE-LIVE-20230316012742](https://gitlab.aws.dev/sif/sif-core/-/tags/RELEASE-LIVE-20230316012742)

### Automatic Migration

In release after `RELEASE-LIVE-20230316012742` , we're introducing a new column `type` on the `Activity` table in the RDS database as part of the pipeline aggregation feature. When you deploy the `Calculator` stack, the schema migration will be done
automatically `Custom::DatabaseSeeder` custom resource. It will insert `raw` to the new column of the existing rows.

### Manual Migration

To migrate the schema manually, run the command below:

1. To connect to the RDS cluster environment outside the VPC, you can deploy the shared platform stack with AWS Client VPN included (more can be found [here](deployment/walkthrough.md)). The rest of steps assume that your machine has connected the AWS Client VPN deployed inside your `SIF` VPC.
2. Follow the backup and restore instruction [here](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Managing.Backups.html) to copy your production database to your staging environment.
3. Get the administrator `username` and `password` from AWS Secrets Manager [console](https://console.aws.amazon.com/secretsmanager/listsecrets). The secret name will be `sif-<environment>-credentials` (e.g. for `staging` environment, it would be `sif-staging-credentials`).
4. Get the Amazon RDS cluster (**not the Proxy**) `writer endpoint` from Amazon RDS [console](https://console.aws.amazon.com/rds/home). Database name will the concatenation of tenantId and environment (e.g. for tenantId `test` and environment `staging`, your database name will be `teststaging`)
5. The migration folder can be found in [here](../infrastructure/tenant/src/calculator/assets).
6. Run the command below to perform the migration on your copied RDS instance (use the information retrieved from step 3 and 4).
    ```shell
    $ DATABASE_URL=postgres://<username>:<password>@<aurora writer endpoint>:5432/<databasename> rush migrate -m <path to the parent of migration scripts folder>
    ```
7. If the migration in staging is successful, repeat step 3-6 in your production environment.


