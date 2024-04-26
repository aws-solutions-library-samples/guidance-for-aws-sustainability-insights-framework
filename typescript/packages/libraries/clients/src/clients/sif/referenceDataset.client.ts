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


import { ClientServiceBase } from '../../common/common';
import type { BaseLogger } from 'pino';
import { Invoker, LambdaApiGatewayEventBuilder } from '@sif/lambda-invoker';
import type { LambdaRequestContext } from '../../common/models.js';
import type { EditReferenceDatasetResource, NewReferenceDatasetResource, ReferenceDatasetResource, ReferenceDatasetResourceList } from './referenceDataset.model.js';

export class ReferenceDatasetClient extends ClientServiceBase {
	constructor(private readonly log: BaseLogger, private readonly lambdaInvoker: Invoker, private readonly referenceDatasetFunctionName: string) {
		super();
	}

	public async get(referenceDatasetId: string, version?: number, requestContext?: LambdaRequestContext, verbose = true): Promise<ReferenceDatasetResource> {
		this.log.info(`ReferenceDatasetClient > get > in > referenceDatasetId: ${referenceDatasetId}, version : ${version}, verbose:${verbose}`);

		const additionalHeaders = {};

		if (requestContext.authorizer.claims.groupContextId) {
			additionalHeaders['x-groupcontextid'] = requestContext.authorizer.claims.groupContextId;
		}

		const event: LambdaApiGatewayEventBuilder = new LambdaApiGatewayEventBuilder()
			.setMethod('GET')
			.setRequestContext(requestContext)
			.setHeaders(super.buildHeaders(additionalHeaders))
			.setPath(version ? `referenceDatasets/${referenceDatasetId}/versions/${version}` : `referenceDatasets/${referenceDatasetId}`)
			.setQueryStringParameters({
				verbose: verbose.toString(),
			});

		const result = await this.lambdaInvoker.invoke(this.referenceDatasetFunctionName, event);
		this.log.info(`ReferenceDatasetClient > get > exit > result: ${JSON.stringify(result)}`);
		return result.body as ReferenceDatasetResource;
	}

	public async getByAlias(referenceDatasetName: string, requestContext?: LambdaRequestContext, verbose = true): Promise<ReferenceDatasetResource | undefined> {
		this.log.info(`ReferenceDatasetClient > getByAlias > in > referenceDatasetName: ${referenceDatasetName},verbose:${verbose}`);

		const additionalHeaders = {};

		if (requestContext.authorizer.claims.groupContextId) {
			additionalHeaders['x-groupcontextid'] = requestContext.authorizer.claims.groupContextId;
		}

		const event: LambdaApiGatewayEventBuilder = new LambdaApiGatewayEventBuilder()
			.setMethod('GET')
			.setRequestContext(requestContext)
			.setHeaders(super.buildHeaders(additionalHeaders))
			.setPath(`referenceDatasets?name=${referenceDatasetName}`)
			.setQueryStringParameters({
				verbose: verbose.toString(),
			});

		const result = await this.lambdaInvoker.invoke(this.referenceDatasetFunctionName, event);
		this.log.info(`ReferenceDatasetClient > getByAlias > exit > result: ${JSON.stringify(result)}`);
		const referenceDatasetResourceList = (result.body as ReferenceDatasetResourceList);

		return referenceDatasetResourceList.referenceDatasets.length < 1 ? undefined : referenceDatasetResourceList.referenceDatasets[0];
	}

	public async create(newActivity: NewReferenceDatasetResource, requestContext?: LambdaRequestContext): Promise<ReferenceDatasetResource> {
		this.log.info(`ReferenceDatasetClient> create> in> newActivity: ${newActivity}`);

		const additionalHeaders = {};

		if (requestContext.authorizer.claims.groupContextId) {
			additionalHeaders['x-groupcontextid'] = requestContext.authorizer.claims.groupContextId;
		}

		const event: LambdaApiGatewayEventBuilder = new LambdaApiGatewayEventBuilder()
			.setMethod('POST')
			.setRequestContext(requestContext)
			.setHeaders(super.buildHeaders(additionalHeaders))
			.setBody(newActivity)
			.setPath(`referenceDatasets`);

		const result = await this.lambdaInvoker.invoke(this.referenceDatasetFunctionName, event);
		this.log.info(`ReferenceDatasetClient> create> exit> result: ${JSON.stringify(result)}`);
		return result.body as ReferenceDatasetResource;
	}


	public async update(referenceDatasetId: string, editReferenceDatasetResource: EditReferenceDatasetResource, requestContext?: LambdaRequestContext): Promise<ReferenceDatasetResource> {
		this.log.info(`ReferenceDatasetsClient> update> in> editReferenceDatasetResource: ${editReferenceDatasetResource}`);

		const additionalHeaders = {};

		if (requestContext.authorizer.claims.groupContextId) {
			additionalHeaders['x-groupcontextid'] = requestContext.authorizer.claims.groupContextId;
		}

		const event: LambdaApiGatewayEventBuilder = new LambdaApiGatewayEventBuilder()
			.setMethod('PATCH')
			.setRequestContext(requestContext)
			.setHeaders(super.buildHeaders(additionalHeaders))
			.setBody(editReferenceDatasetResource)
			.setPath(`referenceDatasets/${referenceDatasetId}`);

		const result = await this.lambdaInvoker.invoke(this.referenceDatasetFunctionName, event);
		this.log.info(`ReferenceDatasetsClient> update> exit> result: ${JSON.stringify(result)}`);
		return result.body as ReferenceDatasetResource;
	}
}
