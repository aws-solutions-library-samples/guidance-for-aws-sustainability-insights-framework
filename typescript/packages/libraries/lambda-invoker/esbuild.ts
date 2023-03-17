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

import { execSync } from 'child_process';
import esbuild from 'esbuild';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const dist = join(process.cwd(), 'dist');

if (!existsSync(dist)) {
	mkdirSync(dist);
}

const entryPoints = ['src/index.ts', 'src/invoker.ts', 'src/models.ts'];

// esm output bundle
esbuild
	.build({
		entryPoints,
		outdir: 'dist/esm',
		bundle: false,
		sourcemap: true,
		minify: false,
		format: 'esm',
		platform: 'node',
		target: ['node16'],
		plugins: [
			{
				name: 'TypeScriptDeclarationsPlugin',
				setup(build) {
					build.onEnd((result) => {
						if (result.errors.length > 0) return;
						execSync('tsc');
					});
				},
			},
		],
	})
	.catch(() => process.exit(1));

// cjs output bundle
esbuild
	.build({
		entryPoints: ['src/index.ts'],
		outdir: 'dist/cjs',
		bundle: true,
		sourcemap: true,
		minify: false,
		format: 'cjs',
		outExtension: {
			'.js': '.cjs',
		},
		platform: 'node',
		target: ['node16'],
	})
	.catch(() => process.exit(1));

// an entry file for cjs at the root of the bundle
writeFileSync(join(dist, 'index.js'), "export * from './esm/index.js';");

// // an entry file for esm at the root of the bundle
writeFileSync(join(dist, 'index.cjs'), "module.exports = require('./cjs/index.cjs');");
