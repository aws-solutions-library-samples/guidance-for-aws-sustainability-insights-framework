/*
 *  Copyright Amazon.com Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */
import select, { Separator } from '@inquirer/select';
import confirm from '@inquirer/confirm';
import { input, checkbox } from '@inquirer/prompts';
import { ACMClient, GetCertificateCommand, ListCertificatesCommand } from '@aws-sdk/client-acm';
import { EC2Client, DescribeVpcsCommand, DescribeSubnetsCommand, DescribeSubnetsCommandInput } from '@aws-sdk/client-ec2';
import type { JSONSchemaType } from 'ajv';
import Ajv from 'ajv';
import { InstanceType } from '@aws-cdk/aws-sagemaker-alpha';

interface ContextAnswer {
  maxClusterCapacity: number;
  minClusterCapacity: number;
  deleteBucket: boolean;
  clusterDeletionProtection: boolean;
  rdsConcurrencyLimit: number;
  // VpnClient settings
  includeVpnClient: boolean;
  certArn?: string;
  clientArn?: string;
  // Existing VPC settings
  useExistingVpc: boolean;
  existingVpcId?: string;
  existingIsolatedSubnetIds?: (string | undefined)[];
  existingPrivateSubnetIds?: (string | undefined)[];
  // Caml settings
  includeCaml: boolean;
  camlContainerTag?: string;
  camlRepositoryHash?: string;
  camlInstanceType?: string;
  useRepository: boolean;
  repositoryName?: string;
  repositoryArn?: string;
  imageTag?: string;
}

const deploymentContextArgs = {
  'max-cluster-capacity':
    {
      description: 'The maximum aurora serverless v2 cluster capacity? You can specify ACU values in half-step increments, such as 40, 40.5, 41, and so on',
      name: 'maxClusterCapacity',
      type: 'number',
      exclusive: ['headless']
    },
  'min-cluster-capacity':
    {
      description: 'The minimum aurora serverless v2 cluster capacity? You can specify ACU values in half-step increments, such as 8, 8.5, 9, and so on',
      name: 'minClusterCapacity',
      type: 'number',
      exclusive: ['headless']
    },
  'rds-concurrency-limit':
    {
      description: 'The maximum number of concurrent process allowed to access the Aurora RDS cluster',
      name: 'rdsConcurrencyLimit',
      type: 'number',
      exclusive: ['headless']
    },
  'include-vpn-client':
    {
      description: 'If specified, VPN client will be deployed to connection to aurora database remotely for SIF development purposes',
      name: 'includeVpnClient',
      type: 'boolean',
      exclusive: ['headless']
    },
    'use-existing-vpc':
    {
      description: 'If specified, SIF will use an existing VPC for deployment',
      name: 'useExistingVpc',
      type: 'boolean',
      exclusive: ['headless']
    },
  'cluster-deletion-protection':
    {
      description: 'If specified, RDS cluster will be not be removed when SIF is removed',
      name: 'clusterDeletionProtection',
      type: 'boolean',
      exclusive: ['headless']
    },
  'delete-bucket':
    {
      description: 'If specified, all provisioned s3 buckets will be deleted when SIF is removed',
      name: 'deleteBucket',
      type: 'boolean',
      exclusive: ['headless']
    },
  'include-caml':
    {
      description: 'If specified, Carbon Accounting with Machine Learning (CaML) will be enabled',
      name: 'includeCaml',
      type: 'boolean',
      exclusive: ['headless']
    },
};

const schema: JSONSchemaType<ContextAnswer> = {
  type: 'object',
  properties: {
    maxClusterCapacity: { type: 'number' },
    minClusterCapacity: { type: 'number' },
    deleteBucket: { type: 'boolean' },
    clusterDeletionProtection: { type: 'boolean' },
    rdsConcurrencyLimit: { type: 'number' },
    includeCaml: { type: 'boolean' },
    camlContainerTag: { type: 'string', nullable: true },
    camlRepositoryHash: { type: 'string', nullable: true },
    camlInstanceType: { type: 'string', nullable: true },
    includeVpnClient: { type: 'boolean' },
    certArn: { type: 'string', nullable: true },
    clientArn: { type: 'string', nullable: true },
    useExistingVpc: { type: 'boolean' },
    existingVpcId: { type: 'string', nullable: true },
    existingIsolatedSubnetIds: { type: 'array', items: { type: 'string', nullable: true }, nullable: true },
    existingPrivateSubnetIds: { type: 'array', items: { type: 'string', nullable: true }, nullable: true },
    useRepository: { type: 'boolean' },
    repositoryName: { type: 'string', nullable: true },
    repositoryArn: { type: 'string', nullable: true },
    imageTag: { type: 'string', nullable: true },
  },
  required: [],
  additionalProperties: false,
};

// This variable is hoisted into multiple functions
let answers: ContextAnswer = {
  clusterDeletionProtection: true,
  deleteBucket: false,
  includeCaml: false,
  useRepository: false,
  includeVpnClient: false,
  useExistingVpc: false,
  rdsConcurrencyLimit: 10,
  maxClusterCapacity: 16,
  minClusterCapacity: 0.5
};

const validateIfDefined = async (prop: string) => {
  if (answers[prop] && advancedValidator[prop]) {
    const result = await advancedValidator[prop](answers[prop]);
    if (result !== true) {
      throw new Error(result);
    }
  }
};

const getACMClient = (): ACMClient => {
  return new ACMClient({ region: process.env['SIF_REGION'] ?? process.env['AWS_REGION'] });
};

const getEc2Client = (): EC2Client => {
  return new EC2Client({ region: process.env['SIF_REGION'] ?? process.env['AWS_REGION'] });
}

const validateDeploymentContext = async (answersFromFile: ContextAnswer) => {
  answers = answersFromFile;

  const ajv = new Ajv();
  // Validate schema
  const validate = ajv.compile(schema);
  if (!validate(answers)) {
    throw new Error(JSON.stringify(validate.errors));
  }

  await validateIfDefined('minClusterCapacity');
  await validateIfDefined('maxClusterCapacity');

  if (answers.includeVpnClient) {
    await validateIfDefined('certArn');
    await validateIfDefined('clientArn');
  }

  if (answers.useExistingVpc) {
    await validateIfDefined('existingVpcId');
    await validateIfDefined('existingIsolatedSubnetIds');
    await validateIfDefined('existingPrivateSubnetIds');
  }
};

const advancedValidator = {
  maxClusterCapacity: (value: string): boolean | string => {
    const inputValue = parseFloat(value);
    if (inputValue > 128) {
      return 'The largest value that you can use is 128.';
    }
    if (inputValue < 0.5) {
      return 'The smallest value that you can use is 0.5.';
    }
    if (inputValue % 0.5 !== 0) {
      return 'ACU values in not in half-step increments';
    }
    return true;
  },
  minClusterCapacity: (value: string): boolean | string => {
    const inputValue = parseFloat(value);
    if (inputValue < 0.5) {
      return 'The smallest value that you can use is 0.5.';
    }
    if (inputValue >= answers.maxClusterCapacity) {
      return `Min cluster capacity should be less than max cluster capacity`;
    }
    if (inputValue % 0.5 !== 0) {
      return 'ACU values in not in half-step increments';
    }
    return true;
  },
  certArn: async (value: string): Promise<boolean | string> => {
    try {
      await getACMClient().send(new GetCertificateCommand({ CertificateArn: value }));
      return true;
    } catch (Exception) {
      return 'Certificate does not exists';
    }
  },
  clientArn: async (value: string): Promise<boolean | string> => {
    try {
      await getACMClient().send(new GetCertificateCommand({ CertificateArn: value }));
      return true;
    } catch (Exception) {
      return 'Certificate does not exists';
    }
  }
};

const retrieveDeploymentContext = async (existing?: ContextAnswer): Promise<any> => {
  if (existing) {
    existing = {
      ...answers,
      ...existing
    };
    await validateDeploymentContext(existing);
  }

  answers.useExistingVpc = await confirm({ message: 'Do you want to use an existing VPC? If not, the SIF deployment will create one for you.', default: answers.useExistingVpc ?? false });
  if (answers.useExistingVpc) {
    
    const existingVpcList = (await getEc2Client().send(new DescribeVpcsCommand({}))).Vpcs?.map((vpc) => {
      const vpcName = vpc.Tags?.find((t) => {
        return t.Key === 'Name';
      });
      
      return {
        name: vpcName ? vpcName.Value : vpc.VpcId,
        value: vpc.VpcId
      };
    }) ?? [];

    answers.existingVpcId = await select({
      message: 'Select the existing VPC to use when deploying SIF',
      choices: existingVpcList,
    });

    if (answers.existingVpcId === undefined) {
      throw new Error('VPC ID is required if using an existing VPC');
    }

    const describeSubnetsInput: DescribeSubnetsCommandInput = {
		  Filters: [{ Name: 'vpc-id', Values: [answers.existingVpcId] }],
	  };
    const existingVpcSubnets = (await getEc2Client().send(new DescribeSubnetsCommand(describeSubnetsInput))).Subnets?.map((s) => {
      const subnetName = s.Tags?.find((t) => {
        return t.Key === 'Name';
      });

      return {
        name: subnetName ? subnetName.Value : s.SubnetId,
        value: s.SubnetId
      };
    }) ?? [];

    answers.existingIsolatedSubnetIds = await checkbox({
      message: `Which subnets in vpc ${answers.existingVpcId}  should SIF use as isolated subnets?`,
      choices: existingVpcSubnets
    });

    const nonIsolatedSubnets: {name: string|undefined, value:string|undefined}[] = [];
    existingVpcSubnets.forEach((s) => {
      if (!answers.existingIsolatedSubnetIds?.some(esid => esid === s.value)) {
        nonIsolatedSubnets.push(s);
      }
    });

    answers.existingPrivateSubnetIds = await checkbox({
      message: `Which subnets in vpc ${answers.existingVpcId}  should SIF use as private subnets?`,
      choices: nonIsolatedSubnets
    });
  }

  const changeDefaultCapacity = await confirm({ message: 'Change default capacity settings?', default: false });

  if (changeDefaultCapacity) {
    answers.maxClusterCapacity = parseFloat(await input({
      message: 'What is the maximum aurora serverless v2 cluster capacity? You can specify ACU values in half-step increments, such as 40, 40.5, 41, and so on',
      default: answers.maxClusterCapacity.toString() ?? '16',
      validate: advancedValidator.maxClusterCapacity
    }));

    answers.minClusterCapacity = parseFloat(await input({
      message: 'What is the minimum aurora serverless v2 cluster capacity? You can specify ACU values in half-step increments, such as 8, 8.5, 9, and so on',
      default: answers.minClusterCapacity.toString() ?? '1',
      validate: advancedValidator.minClusterCapacity
    }));

    answers.rdsConcurrencyLimit = parseInt(await input({ message: 'Specify the number of concurrent process to access the RDS cluster', default: answers.rdsConcurrencyLimit.toString() ?? '10' }));
  }

  const changeDefaultDeletionProtection = await confirm({ message: 'Change default deletion settings?', default: false });

  if (changeDefaultDeletionProtection) {
    answers.deleteBucket = await confirm({ message: 'Do you want to delete all the provisioned s3 buckets when SIF is removed?', default: answers.deleteBucket ?? false });
    answers.clusterDeletionProtection = await confirm({ message: 'Do you want to prevent the RDS cluster from being deleted when SIF is removed?', default: answers.clusterDeletionProtection ?? false });
  }

  answers.includeCaml = await confirm({
    message: 'Include Carbon Accounting with Machine Learning (CaML) feature? There is an increased cost associated with this, therefore only include if you are intending to use it.',
    default: answers.includeCaml ?? false
  });

  if (answers.includeCaml) {
    const changeDefaultCamlSettings = await confirm({ message: 'Change default CamL settings?', default: false });
    answers.useRepository = await confirm({
      message: 'Do you wish to load the CaML model from an existing repository?',
      default: answers.useRepository ?? false
    });

    if (answers.useRepository) {
      answers.repositoryName = await input({ message: 'Name of the repository?' });
      answers.repositoryArn = await input({ message: 'Arn of the repository?' });
      answers.imageTag = await input({ message: 'Tag associated with the image?' });
    }

    if (changeDefaultCamlSettings) {
      answers.camlContainerTag = await input({ message: 'Specify the AWS Deep Learning container tag to run the CaML model', default: answers.camlContainerTag ?? '1.13.1-transformers4.26.0-gpu-py39-cu117-ubuntu20.04' });
      answers.camlRepositoryHash = await input({
        message: 'Specify the revision hash of Hugging Face sentence-transformers/all-mpnet-base-v2 model repository',
        default: answers.camlRepositoryHash ?? 'bd44305fd6a1b43c16baf96765e2ecb20bca8e1d'
      });
      answers.camlInstanceType = await select({
        message: 'Specify the Sagemaker Instance type to host CaML endpoint',
        choices: [
          {
            value: answers.camlInstanceType ?? InstanceType.G4DN_XLARGE.toString(),
            name: answers.camlInstanceType ?? InstanceType.G4DN_XLARGE.toString()
          },
          new Separator(),
          ...Object.values(InstanceType).map(o => o['instanceTypeIdentifier']).map(instanceType => {
            return {
              value: instanceType,
              name: instanceType
            };
          })]
      });
    }
  }

  answers.includeVpnClient = await confirm({ message: 'Include VPN Client? This is only required if there is a need to connect to the database directly remotely, such as if developing SIF.', default: answers.includeVpnClient ?? false });
  if (answers.includeVpnClient) {
    const certificates = (await getACMClient().send(new ListCertificatesCommand({}))).CertificateSummaryList?.map(o => {
      return {
        name: `${o.CertificateArn} (${o.DomainName})`,
        value: o.CertificateArn
      };
    }) ?? [];
    answers.certArn = await select({
      message: 'Enter the server certificate used in the VPN client',
      choices: certificates,
    });
    answers.clientArn = await select({
      message: 'Enter the client certificate used in the VPN client',
      choices: certificates,
    });
  }
  return answers;
};

const retrieveDeploymentContextFromArgs = (flags: Record<string, string>): Record<string, any> => {
  const answerFromArgs = {};
  Object.keys(deploymentContextArgs).forEach(k => {
    if (flags[k]) {
      if (deploymentContextArgs[k].type === 'number') {
        answerFromArgs[deploymentContextArgs[k].name] = parseFloat(flags[k]!);
      } else {
        answerFromArgs[deploymentContextArgs[k].name] = flags[k];
      }
    }
  });
  return answerFromArgs;
};

const isPlatformCompatibleWithTenant = (platformVersion: string, tenantVersion: string): boolean | undefined => {
  const versionMatrix = retrieveVersionCompatibilityMatrix();
  return versionMatrix?.[platformVersion]?.[tenantVersion];
};

const retrieveVersionCompatibilityMatrix = () => {
  const versionList = ['v1.9.0'];
  const versionCompatibilityMatrix = {};
  // initialise platform compatibility only if the platform and tenant version matches
  for (const p of versionList) {
    for (const t of versionList) {
      if (versionCompatibilityMatrix[p] === undefined) {
        versionCompatibilityMatrix[p] = {};
      }
      versionCompatibilityMatrix[p][t] = p === t;
    }
  }
  // set any platform compatibility for different version between platform and tenant
  // versionCompatibilityMatrix[<PLATFORM VERSION>][<TENANT VERSION>] = true;
  return versionCompatibilityMatrix;
};

export {
  retrieveDeploymentContext,
  validateDeploymentContext,
  retrieveDeploymentContextFromArgs,
  retrieveVersionCompatibilityMatrix,
  isPlatformCompatibleWithTenant,
  deploymentContextArgs,
};
