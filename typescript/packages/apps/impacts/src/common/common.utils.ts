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

import type { Impact } from '../impacts/schemas.js';
import type { NewImpact } from '../impacts/schemas';

export class CommonUtils {
	public impactsToLowerCase(impacts: Record<string, Impact>): void {
		impacts = this.toLowerKeys(impacts);
		Object.values(impacts)?.forEach((i) => this.impactToLowerCase(i));
	}

	public impactToLowerCase(i: Impact | NewImpact): void {
		i.components = this.toLowerKeys(i.components);
	}

	public toLowerKeys<T>(obj: Record<string, T>): Record<string, T> {
		if ((Object.keys(obj)?.length ?? 0) === 0) {
			return obj;
		}
		return Object.keys(obj).reduce((accumulator, key) => {
			accumulator[key.toLowerCase()] = obj[key];
			return accumulator;
		}, {});
	}
}
