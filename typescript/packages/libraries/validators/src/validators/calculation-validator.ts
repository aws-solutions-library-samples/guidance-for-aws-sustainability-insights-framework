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
import { validateParameters } from './util.js';
import { CalculationDefinitionError } from '../common/errors.js';
import { CalculationParameters, CalculationOutputs, EntityType } from '../common/models.js';

export class CalculationValidator {
	private readonly log: BaseLogger;

	public constructor(log: BaseLogger) {
		this.log = log;
	}

	public validateParameters(formula: string, parameters: CalculationParameters): void {
		validateParameters(formula, parameters, this.log, EntityType.calculation);
	}

	public validateOutputs(outputs: CalculationOutputs): void {
		this.log.debug(`Validator> validateOutputs> in: outputs:${JSON.stringify(outputs)}`);

		// Validation - ensure outputs defined correctly
		if ((outputs?.length ?? 0) === 0) {
			throw new CalculationDefinitionError(`Calculation must have an output defined.`);
		}
		// Note: only 1 output support for launch. multiple outputs are post launch
		if ((outputs?.length ?? 0) > 1) {
			throw new CalculationDefinitionError(`Only 1 output per calculation is supported.`);
		}
	}
}
