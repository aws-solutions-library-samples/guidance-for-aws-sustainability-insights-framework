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

import url from 'url';
import { buildApp } from './app.js';

const startServer = async (): Promise<void> => {
	const app = await buildApp();
	try {
		await app.listen({ port: app.config.PORT, host: '0.0.0.0' });
	} catch (err) {
		app.log.error(err);
		process.exit(1);
	}
};

// if called directly, e.g. local dev, start the fastify server
const path: string = process.argv[1] as string;
const href: string = url.pathToFileURL(path).href;
if (import.meta.url === href) {
	await startServer();
}
