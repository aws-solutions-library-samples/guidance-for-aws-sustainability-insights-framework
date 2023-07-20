# Cloud9 Developer Environment

You can use the `@sif/ide` to deploy Cloud9 developer environment. This environment allows you build, deploy and run all the helper scripts to
streamline your development process.

## Pre-requisites

We're going to launch the Cloud09 instance as a ["non ingress EC2 instances"](https://docs.aws.amazon.com/cloud9/latest/user-guide/ec2-ssm.html) so we don't
need to open any inbound ports to that instance.

Run the following AWS CLI commands to create the service role and instance profile that will be needed to launch this type of Cloud9 instance.

```shell
aws iam create-role --role-name AWSCloud9SSMAccessRole --path /service-role/ --assume-role-policy-document '{"Version": "2012-10-17","Statement": [{"Effect": "Allow","Principal": {"Service": ["ec2.amazonaws.com","cloud9.amazonaws.com"]      },"Action": "sts:AssumeRole"}]}'
aws iam attach-role-policy --role-name AWSCloud9SSMAccessRole --policy-arn arn:aws:iam::aws:policy/AWSCloud9SSMInstanceProfile
aws iam create-instance-profile --instance-profile-name AWSCloud9SSMInstanceProfile --path /cloud9/
aws iam add-role-to-instance-profile --instance-profile-name AWSCloud9SSMInstanceProfile --role-name AWSCloud9SSMAccessRole
```

More details on the permission can be found [here](https://docs.aws.amazon.com/cloud9/latest/user-guide/ec2-ssm.html#aws-cli-instance-profiles)

## Deploying the Cloud9 Developer Environment

### Bundling

To install all the dependencies

```sh
rush update
```

To build

```sh
rush build
```

### First time setup

First timers need to bootstrap

```shell
npm run cdk -- bootstrap -c environment=? --all
```

More details on the context that you can provide when deploying the cdk application can be found below:

| Context Name  | Detail                                                                                                                                                                                          | Required |                                                  Default                                                  |
|---------------|:------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|:---------|:---------------------------------------------------------------------------------------------------------:|
| environment   | The value will be used as prefix when creating Cloud9 resources.                                                                                                                                | &#9989;  |                                                                                                           |
| ownerArn      | The owner of the `Cloud9` instance. This ARN can be the ARN of any AWS Identity and Access Management principal.                                                                                | &#9989;  |                                                                                                           |
| repositoryUrl | Url of your repository, if your repository is private, the username and password has to be included in the curl, e.g. <br /> `git clone https://username:password@github.com/aws/sif-core.git`. | &#10060; | `https://github.com/aws-solutions-library-samples/guidance-for-aws-sustainability-insights-framework.git` |
| instanceType  | The type of instance to connect to the environment (if none specified, default is `t2.large`).                                                                                                  | &#10060; |                                                `t2.large`                                                 |

### Making the deployment

```shell
npm run cdk -- deploy \
 -c environment=? \
 -c repositoryUrl=? \
 -c instanceType=? \
 -c ownerArn=? \
 --all --require-approval never
```

## Using the Cloud9 Developer Environment

Once the deployment finish, you can go to cloud9 console and click on `Open IDE` on the environment you had just created. The name of the environment would be `sustainability-<tenant>-<environment>-ide`

The repository that you had specified in the context argument can be located under the `sif` folder under the home directory.

![location for sif-core repository](../ide/images/sif-core-folder.png)

All the pre-requisites mentioned in [here](../../../docs/development/prereqs.md) are installed in your Cloud9 environment, go to the [deployment section](../../../infrastructure/README.md) to deploy sif-core into your AWS account.
