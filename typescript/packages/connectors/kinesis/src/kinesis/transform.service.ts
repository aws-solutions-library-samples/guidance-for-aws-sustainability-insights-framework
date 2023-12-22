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
import Handlebars from 'handlebars';
import type { BaseLogger } from 'pino';

const jsonHelper = function(context) {
	return JSON.stringify(context);
};

Handlebars.registerHelper('toJson', jsonHelper);

export class TransformService {
	private readonly handlebarsTemplateDelegate: HandlebarsTemplateDelegate;

	public constructor(
		private readonly log: BaseLogger,
		private readonly handlebarsTemplate: string
	) {
		this.handlebarsTemplateDelegate = Handlebars.compile(this.handlebarsTemplate);
	}

	public transformRecord(record: any): Object | undefined {
		this.log.debug(`transformService> transformRecord> in> }`);
		const data = Buffer.from(record.data, 'base64').toString('utf-8');
		try {
			const transformedData = this.handlebarsTemplate === '' ? JSON.parse(data) : JSON.parse(this.handlebarsTemplateDelegate(JSON.parse(data)));
			this.log.debug(`transformService> transformRecord> exit`);
			return transformedData;
		} catch (err) {
			this.log.error(`transformService> transformRecord> error: data could not be transformed validate your template, err: ${JSON.stringify(err)}`);
		}
		this.log.debug(`transformService> transformRecord> exit> transformation failed`);
		return undefined;
	}
}
