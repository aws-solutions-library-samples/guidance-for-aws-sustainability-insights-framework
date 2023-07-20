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

import { build } from 'esbuild';

const banner = `
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
`;

console.log(`Processing release build...`);
build({
	bundle: true,
	entryPoints: ['src/lambdas/dynamodb-seeder/index.ts'],
	minify: false,
	format: 'esm',
	platform: 'node',
	target: 'node18.16',
	sourcemap: false,
	sourcesContent: false,
	outfile: 'dist/lambdas/dynamodb-seeder/index.mjs',
	banner: {
		js: banner,
	},
});
