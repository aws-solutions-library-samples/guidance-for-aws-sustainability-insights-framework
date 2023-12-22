# Deployment

## Deployments Steps

Refer to the [deployment walkthrough](../docs/deployment/cli_walkthrough.md).

## Deploying Certificates (Optional)

Download AWS VPN Client from [here](https://docs.aws.amazon.com/vpn/latest/clientvpn-user/client-vpn-user-what-is.html)

Follow the step outline in this [documentation](https://docs.aws.amazon.com/vpn/latest/clientvpn-admin/client-authentication.html#mutual).

## Cost Allocation Tags

All platform shared resources deployed through the CDK are tagged with the following tags:

```
{
    "sif:environment":[environment passed in during CDK deployment]
}
```

All tenant resources deployed through the CDK are tagged with the following tags:

```
{
    "sif:tenantId":[tenant ID passed in during CDK deployment],
    "sif:environment":[environment passed in during CDK deployment]
}
```

These tags can be used as [user-defined cost allocation tags](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/custom-tags.html) in a multi-tenant deployment to track AWS costs per tenant. To activate the above tags as cost allocation tags see [here](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/activating-tags.html). This can be done in the AWS console or through the CLI using the `aws ce update-cost-allocation-tags-status` command. Note: tags may take up to 24 hours after being created (any resource is tagged with that key) before they are available for activating as cost allocation tags. Also note that this [CDK request](https://github.com/aws/aws-cdk/issues/19977) shows why these aren't currently managed by the deployment.
