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
import { FactNames } from './fact-tables.js';
import type { Construct } from 'constructs';
import { Stack, Token } from 'aws-cdk-lib';


export function getLambdaArchitecture(scope: Construct): Architecture {
	const preferredArchitecture = Stack.of(scope).regionalFact(FactNames.PREFERRED_LAMBDA_ARCHITECTURE, Architecture.X86_64.name);
	if (Token.isUnresolved(preferredArchitecture)) {
		return Architecture.custom(preferredArchitecture);
	}
	return preferredArchitecture === Architecture.ARM_64.name ? Architecture.ARM_64 : Architecture.X86_64;
}
