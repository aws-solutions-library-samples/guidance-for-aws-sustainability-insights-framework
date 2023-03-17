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

import type { BaseLogger } from 'pino';
import { CalculationDefinitionError } from '../common/errors.js';
import { CalculationParameter, EntityType, TransformerParameter } from '../common/models.js';

type Parameters = CalculationParameter[] | TransformerParameter[];

export function validateParameters(formula: string, parameters: Parameters, log: BaseLogger, entityType: EntityType): void {
	log.debug(`Validator> validateParameters> in: formula:${formula}, parameters:${JSON.stringify(parameters)}`);
	// transform parameters are not required to be in sequence or can be multiple ones which can or cannot be referenced in the formula
	if (entityType === EntityType.calculation) {
		// Validation - ensure no extra parameters to what is expected is defined
		const parametersDefined = parameters?.length ?? 0;

		if (parametersDefined > 0) {
			parameters?.sort((a, b) => (a.index > b.index ? 1 : -1));

			// Validation - check sequence begins at 0
			if (parameters?.[0]?.index !== 0) {
				throw new CalculationDefinitionError('The position of the parameters (their `index`) must begin from 0.');
			}

			// Validation - index sequence must not be skipping or missing a position
			for (let i = 0; i < parameters.length; i++) {
				if (i !== parameters[i]?.index) {
					throw new CalculationDefinitionError(`The order of the parameters (their 'index') must not be skipping or missing a position.`);
				}
			}
		}
	}
}
