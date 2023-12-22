import { LambdaClient } from '@aws-sdk/client-lambda';
import pino from 'pino';
import { Invoker, LambdaApiGatewayEventBuilder } from '@sif/lambda-invoker';
import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'assert';

export type PlatformResource = { id: string, status: string }
const getPlatformResourceManagerInvoker = (): Invoker => {
	const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION as string });
	const logger = pino();
	return new Invoker(logger, lambdaClient);
};

export async function createResourceAction(id: string, action: string): Promise<void> {
	const event = new LambdaApiGatewayEventBuilder()
		.setMethod('POST')
		.setPath('/actions')
		.setHeaders({
			Accept: 'application/json',
			'Accept-Version': '1.0.0',
			'Content-Type': 'application/json'
		})
		.setBody({
			id, action
		});
	await getPlatformResourceManagerInvoker().invoke(process.env.PLATFORM_RESOURCE_MANAGER_FUNCTION_NAME, event);
}

export async function getPlatformResource(id: string): Promise<PlatformResource> {
	const event = new LambdaApiGatewayEventBuilder()
		.setMethod('GET')
		.setPath(`/resources/${id}`)
		.setHeaders({
			Accept: 'application/json',
			'Accept-Version': '1.0.0',
			'Content-Type': 'application/json'
		});
	const result = await getPlatformResourceManagerInvoker().invoke(process.env.PLATFORM_RESOURCE_MANAGER_FUNCTION_NAME, event);
	return result.body as PlatformResource;
}

Given(/^platform (.*) status is (.*)$/, async function(id: string, status: string) {
	const resource = await getPlatformResource(id);
	assert(resource.status, status);
});

When(/^I perform action (.*) on platform resource (.*)$/, async function(action: string, id: string) {
	const resource = await createResourceAction(id, action);
	console.log(resource);
});

Then(/^I wait until platform resource (.*) status are (.*) with (.*)s timeout$/, { timeout: -1 }, async function(id: string, expectedStatus: string, timeout: number) {
	const toEndAt = Date.now() + (timeout * 1000);
	console.log(`\n***** setting interval`);
	return new Promise((resolve, reject) => {
		const t = setInterval(async () => {
			if (Date.now() > toEndAt) {
				clearInterval(t);
				reject('timeout when waiting for platform resource state update');
			}
			const resource = await getPlatformResource(id);
			if (expectedStatus === resource.status) {
				console.log(`\n***** all complete!`);
				clearInterval(t);
				resolve(null);
			}
		}, 5000);
	});
});
