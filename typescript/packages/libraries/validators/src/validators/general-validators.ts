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

import validator from 'validator';
import { InvalidParameterError } from '../common/errors.js';

const MISSING_REQUIRED_PARAMETER = (name) => `Missing required parameter '${name}'`;

export const validateDefined = (value: unknown, name: string) => {
	if (value === undefined || value === null) {
		throw new InvalidParameterError(MISSING_REQUIRED_PARAMETER(name));
	}
};
export const validateNotEmpty = (value: unknown, name: string) => {
	if (value === undefined || value === null) {
		throw new InvalidParameterError(MISSING_REQUIRED_PARAMETER(name));
	} else if (Array.isArray(value)) {
		if ((value?.length ?? 0) === 0) {
			throw new InvalidParameterError(MISSING_REQUIRED_PARAMETER(name));
		}
	} else if (typeof value === 'string' && validator.isEmpty(value)) {
		throw new InvalidParameterError(MISSING_REQUIRED_PARAMETER(name));
	} else if (typeof value === 'object' && !(value instanceof Date) && (Object.keys(value)?.length ?? 0) === 0) {
		throw new InvalidParameterError(MISSING_REQUIRED_PARAMETER(name));
	}
};

export const validateAtLeast = (value: number, expected: number, name: string) => {
	if ((value ?? 0) < expected) {
		throw new InvalidParameterError(MISSING_REQUIRED_PARAMETER(name));
	}
};

export const validateHasSome = <T>(values: T[], names: string[]) => {
	const hasSome = (values ?? []).some((value) => value !== undefined && value !== null);
	if (!hasSome) {
		throw new InvalidParameterError(`At least one of ${names.join(', ')} is required`);
	}
};
