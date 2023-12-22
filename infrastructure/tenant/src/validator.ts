#!/usr/bin/env node
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

import confirm from '@inquirer/confirm';
import { input } from '@inquirer/prompts';
import type { JSONSchemaType } from 'ajv';
import Ajv from 'ajv';

interface ContextAnswer {
	administratorEmail: string,
	cognitoVerification: boolean,
	cognitoFromEmail?: string,
	cognitoVerifiedDomain?: string,
	cognitoFromName?: string,
	cognitoReplyToEmail?: string,
	enableDeleteResource: boolean,
	deleteBucket: boolean,
	includeCaml: boolean,
	outGoingAllowed: boolean,
	outGoingTenants?: string,
	outGoingPath?: string,
	outGoingTenantPaths?: string,
	externalSharingAllowed: boolean,
	externallySharedGroupIds?: string,
	downloadAuditFileParallelLimit: number,
	minScaling: number,
	maxScaling: number,
	decimalPrecision: number,
	triggerMetricAggregations: boolean
}


const schema: JSONSchemaType<ContextAnswer> = {
	type: 'object',
	properties: {
		administratorEmail: { type: 'string', nullable: false },
		cognitoVerification: { type: 'boolean' },
		cognitoFromEmail: { type: 'string', nullable: true },
		cognitoVerifiedDomain: { type: 'string', nullable: true },
		cognitoFromName: { type: 'string', nullable: true },
		cognitoReplyToEmail: { type: 'string', nullable: true },
		enableDeleteResource: { type: 'boolean' },
		deleteBucket: { type: 'boolean' },
		includeCaml: { type: 'boolean' },
		outGoingAllowed: { type: 'boolean' },
		outGoingTenants: { type: 'string', nullable: true },
		outGoingPath: { type: 'string', nullable: true },
		outGoingTenantPaths: { type: 'string', nullable: true },
		externalSharingAllowed: { type: 'boolean' },
		triggerMetricAggregations: { type: 'boolean' },
		externallySharedGroupIds: { type: 'string', nullable: true },
		downloadAuditFileParallelLimit: { type: 'number' },
		minScaling: { type: 'number' },
		maxScaling: { type: 'number' },
		decimalPrecision: { type: 'number' }
	},
	required: [],
	additionalProperties: false,
};


let answers: ContextAnswer = {
	administratorEmail: '',
	cognitoVerification: true,
	enableDeleteResource: false,
	deleteBucket: false,
	includeCaml: false,
	outGoingAllowed: false,
	externalSharingAllowed: false,
	downloadAuditFileParallelLimit: 5,
	minScaling: 1,
	maxScaling: 10,
	decimalPrecision: 16,
	triggerMetricAggregations: true
};

const restrictedAnswers = [
	'cognitoVerification',
	'outGoingAllowed',
	'externalSharingAllowed'
];


const deploymentContextArgs = {
	'administrator-email':
		{
			description: 'The administrator email used for the setup of the Tenant',
			name: 'administratorEmail',
			type: 'string',
			exclusive: ['headless']
		},
	'cognito-verification': {
		description: 'Enable congnito verification',
		name: 'cognitoVerification',
		type: 'boolean',
		exclusive: ['headless']
	},
	'cognito-from-email': {
		description: 'The verified Amazon SES email address that Cognito should use to send emails.',
		name: 'cognitoFromEmail',
		type: 'string',
		exclusive: ['headless']
	},
	'cognito-verified-domain': {
		description: 'The verified SES custom domain to be used to verify the user identities',
		name: 'cognitoVerifiedDomain',
		type: 'string',
		exclusive: ['headless']
	},
	'cognito-from-name': {
		description: 'The sender name sent along with the email',
		name: 'cognitoFromName',
		type: 'string',
		exclusive: ['headless']
	},
	'cognito-reply-to-email': {
		description: 'The destination that the receiver of the email should reply to',
		name: 'cognitoReplyToEmail',
		type: 'string',
		exclusive: ['headless']
	},
	'enable-delete-resource': {
		description: 'Enable the delete API endpoints,',
		name: 'enableDeleteResource',
		type: 'boolean',
		exclusive: ['headless']
	},
	'delete-bucket': {
		description: 'Enable deletion of the S3 bucket on tenant stack removal',
		name: 'deleteBucket',
		type: 'boolean',
		exclusive: ['headless']
	},
	'include-caml': {
		description: 'Deploy the CaML module',
		name: 'includeCaml',
		type: 'boolean',
		exclusive: ['headless']
	},
	'trigger-metric-aggregations': {
		description: 'Trigger metric aggregation when execution is finished',
		name: 'triggerMetricAggregations',
		type: 'boolean',
		exclusive: ['headless']
	},
	'out-going-allowed': {
		description: 'Allow access to shared resources of other tenant',
		name: 'outGoingAllowed',
		type: 'boolean',
		exclusive: ['headless']
	},
	'out-going-tenants': {
		description: 'The Id of the tenant we want to accesss',
		name: 'outGoingTenants',
		type: 'string',
		exclusive: ['headless']
	},
	'out-going-path': {
		description: 'The group path of the resources shared by the destination tenant',
		name: 'outGoingPath',
		type: 'string',
		exclusive: ['headless']
	},
	'out-going-tenant-paths': {
		description: 'The out going tenant paths used for accessing shared resources',
		name: 'outGoingTenantPaths',
		type: 'string',
		exclusive: ['headless']
	},
	externalSharingAllowed: {
		description: 'Enable sharing of the tenants resources with other tenants',
		name: 'externalSharingAllowed',
		type: 'boolean',
		exclusive: ['headless']
	},
	externallySharedGroupIds: {
		description: 'The group path we want to share with other tenants',
		name: 'externallySharedGroupIds',
		type: 'string',
		exclusive: ['headless']
	},
	downloadAuditFileParallelLimit: {
		description: 'The number of Audit log files that can be downloaded and process in parallel by our lambda function',
		name: 'downloadAuditFileParallelLimit',
		type: 'number',
		exclusive: ['headless']
	},
	minScaling: {
		description: 'The minimum scale of our calculator Lambda function',
		name: 'minScaling',
		type: 'number',
		exclusive: ['headless']
	},
	maxScaling: {
		description: 'The maximum concurrent Claculator lambda functions',
		name: 'maxScaling',
		type: 'number',
		exclusive: ['headless']
	},
	decimalPrecision: {
		description: 'The number of decimal points that can be stored in the DB',
		name: 'decimalPrecision',
		type: 'number',
		exclusive: ['headless']
	}
};


const advancedValidator = {
	email: (value: string): any => {
		const valid = /^\w+([\.-/+]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(value);
		if (!valid) {
			return 'Please enter a valid email.';
		}
		return true;
	}

};

const validateIfDefined = async (prop: string) => {
	if (answers[prop] && advancedValidator[prop]) {
		const result = await advancedValidator[prop](answers[prop]);
		if (result !== true) {
			throw new Error(result);
		}
	}
};


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


	if (answers.cognitoVerification) {
		await validateIfDefined('cognitoFromEmail');
		await validateIfDefined('cognitoVerifiedDomain');
		await validateIfDefined('cognitoFromName');
		await validateIfDefined('cognitoReplyToEmail');
	}

	if (answers.outGoingAllowed) {
		await validateIfDefined('outGoingTenants');
		await validateIfDefined('outGoingPath');
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

	answers.administratorEmail = await input({
		message: 'What is the administrator email to be used for this tenant?',
		validate: advancedValidator.email
	});

	answers.cognitoVerification = await confirm({ message: 'Should Cognito send verification emails to users?', default: true });
	if (answers.cognitoVerification) {

		answers.cognitoFromEmail = await input({
			message: 'What is the verified Amazon SES email address that Cognito should use to send emails?',
			validate: advancedValidator.email
		});

		answers.cognitoVerifiedDomain = await input({ message: 'What is the verified SES custom domain to be used to verify the identity?' });


		answers.cognitoFromName = await input({ message: 'What is the name that should be used as the senders name along with the email?' });

		answers.cognitoReplyToEmail = await input({
			message: 'What destination should the receiver of the email reply to?',
			validate: advancedValidator.email
		});
	}

	answers.triggerMetricAggregations = await confirm({ message: 'Trigger metric aggregation when pipeline execution finishes (if this set to false, you can trigger it manually using the aggregation API) ?', default: true });
	answers.enableDeleteResource = await confirm({ message: 'Enable the delete API endpoints, that can be used for deleting resources for testing purposes ?', default: false });
	answers.deleteBucket = await confirm({ message: 'Remove the S3 Bucket and its objects upon deletion of the tenant? (Warning: all stored resources on S3 will be lost if set to true)', default: false });
	answers.includeCaml = await confirm({ message: 'Deploy the CaML module as part of the deployment?', default: false });

	answers.outGoingAllowed = await confirm({ message: 'Do you want to access data shared by other tenants?', default: false });
	if (answers.outGoingAllowed) {

		answers.outGoingTenants = await input({
			message: 'What is the Id of tenant you want read from?'
		});

		answers.outGoingPath = await input({
			message: 'What is the group path you wish to access on the shared tenant?',
			default: '/shared',
			validate: (input: string): any => {
				if (!input.startsWith('/')) {
					return 'Please provide a valid group path starting from `/`';
				}
				return true;
			}
		});

	}

	if (answers.outGoingTenants && answers.outGoingPath) {
		answers.outGoingTenantPaths = `${answers.outGoingTenants}:${answers.outGoingPath}`;
	}

	answers.externalSharingAllowed = await confirm({ message: 'Do you want to share data with other tenants?', default: false });

	if (answers.externalSharingAllowed) {
		answers.externallySharedGroupIds = await input({
			message: 'What the group paths you would like to share with other tenants?',
			default: '/shared',
			validate: (input: string): any => {
				if (!input.startsWith('/')) {
					return 'Please provide a valid group path starting from `/`';
				}
				return true;
			}
		});
	}
	answers.downloadAuditFileParallelLimit = parseInt(await input({ message: 'The number of parallel downloads for retrieving the audit logs ?', default: '5' }));

	answers.minScaling = parseInt(await input({ message: 'The minimum scaling limit for the Calculator Lambda ?', default: '1' }));

	answers.maxScaling = parseInt(await input({ message: 'The maximum scaling limit for the Calculator Lambda ?', default: '10' }));

	answers.decimalPrecision = parseInt(await input({ message: 'The level of precision for numbers stored in the database ?', default: '16' }));

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


export {
	retrieveDeploymentContext,
	retrieveDeploymentContextFromArgs,
	validateDeploymentContext,
	deploymentContextArgs,
	restrictedAnswers
};
