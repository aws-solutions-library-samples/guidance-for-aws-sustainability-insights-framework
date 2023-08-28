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

import { Architecture } from 'aws-cdk-lib/aws-lambda';

export interface RegionMapping {
	[region: string]: string;
}
interface FactMappings {
	[factName: string]: RegionMapping;
}

// Fact names
export const FactNames = {
	PREFERRED_LAMBDA_ARCHITECTURE: "PREFERRED_LAMBDA_ARCHITECTURE",
}

// Fact mappings
// https://aws.amazon.com/lambda/pricing/
const preferredLambdaArchitectures: RegionMapping = {
	'us-east-1': Architecture.ARM_64.name, //	US East (N. Virginia)
	'us-east-2': Architecture.ARM_64.name, //	US East (Ohio)
	'us-west-1': Architecture.ARM_64.name, //	US West (Northern California)
	'us-west-2': Architecture.ARM_64.name, //	US West (Oregon)
	'af-south-1': Architecture.ARM_64.name, //	Africa (Cape Town)
	'ap-east-1': Architecture.ARM_64.name, //	Asia Pacific (Hong Kong)
	'ap-south-2': Architecture.ARM_64.name, //	Asia Pacific (Hyderabad)
	'ap-southeast-3': Architecture.ARM_64.name, //	Asia Pacific (Jakarta)
	'ap-southeast-4': Architecture.ARM_64.name, //	Asia Pacific (Melbourne)
	'ap-south-1': Architecture.ARM_64.name, //	Asia Pacific (Mumbai)
	'ap-northeast-3': Architecture.ARM_64.name, //	Asia Pacific (Osaka)
	'ap-northeast-2': Architecture.ARM_64.name, //	Asia Pacific (Seoul)
	'ap-southeast-1': Architecture.ARM_64.name, //	Asia Pacific (Singapore)
	'ap-southeast-2': Architecture.ARM_64.name, //	Asia Pacific (Sydney)
	'ap-northeast-1': Architecture.ARM_64.name, //	Asia Pacific (Tokyo)
	'ca-central-1': Architecture.ARM_64.name, //	Canada (Central)
	'eu-central-1': Architecture.ARM_64.name, //	Europe (Frankfurt)
	'eu-west-1': Architecture.ARM_64.name, //	Europe (Ireland)
	'eu-west-2': Architecture.ARM_64.name, //	Europe (London)
	'eu-south-1': Architecture.ARM_64.name, //	Europe (Milan)
	'eu-west-3': Architecture.ARM_64.name, //	Europe (Paris)
	'eu-south-2': Architecture.X86_64.name, //	Europe (Spain)
	'eu-north-1': Architecture.ARM_64.name, //	Europe (Stockholm)
	'eu-central-2': Architecture.X86_64.name, //	Europe (Zurich)
	'me-south-1': Architecture.ARM_64.name, //	Middle East (Bahrain)
	'me-central-1': Architecture.X86_64.name, //	Middle East (UAE)
	'sa-east-1': Architecture.ARM_64.name, //	South America (Sao Paulo)
	'us-gov-east-1': Architecture.X86_64.name, //	AWS GovCloud (US-East)
	'us-gov-west-1': Architecture.X86_64.name, //	AWS GovCloud (US-West)
}

export const factMappings: FactMappings = {
	[FactNames.PREFERRED_LAMBDA_ARCHITECTURE]: preferredLambdaArchitectures
}
