# Considerations of Running SIF in Production

The following is a list of recommendations and considerations when moving to a production deployment of SIF. This list is not exhaustive and will be updated over time. These recommendations were not implemented in the CDK / IaaC out of the box due to the many configurations, environments, and intended uses of SIF.

## Web Application Firewall

AWS strongly recommends using a web application firewall such as [AWS WAF](https://aws.amazon.com/waf/) in front of any publicly-available APIs.

## AWS Security Services

AWS strongly recommends use of [AWS Security Products](https://aws.amazon.com/products/security/) for any production deployment. Specific examples include:

* [AWS Security Hub](https://aws.amazon.com/security-hub/?c=sc&sec=srvm)
* [Amazon Guard Duty](https://aws.amazon.com/guardduty/?c=sc&sec=srvm)
* [AWS Shield](https://aws.amazon.com/shield/?c=sc&sec=srvm)
* [Amazon Macie](https://aws.amazon.com/macie/?c=sc&sec=srvm)

## MFA on Cognito

AWS strongly recommends enabling multi-factor authentication on Cognito login in a production environment.

## Cost Allocation Tags

See [here](../../infrastructure/README.md) for more information on enabling cost allocation tags.
