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
import type { App } from 'aws-cdk-lib';

const tryGetBooleanContext = (app: App, contextName: string, defaultValue: boolean): boolean => {
	const contextValue = app.node.tryGetContext(contextName);
	if (contextValue === undefined) return defaultValue;
	// if it's boolean return as it is
	if (typeof contextValue === 'boolean') return contextValue;
	// if it's string check if its equal to 'true'
	return contextValue === 'true';
};

export {
	tryGetBooleanContext
};
