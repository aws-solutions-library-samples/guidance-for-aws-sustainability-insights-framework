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

export interface CallerContext {
	awsSdkVersion: string;
	clientId: string;
}

export interface UserAttributes {
	sub: string;
	'cognito:user_status': string;
	email: string;
}

export interface PrivateChallengeParameters {
	groups: string;
}

export interface ClientMetadata {
	[key: string]: string;
}

export interface VerifyAuthRequest {
	userAttributes: UserAttributes;
	privateChallengeParameters: PrivateChallengeParameters;
	challengeAnswer: string;
	clientMetadata: ClientMetadata;
}

export interface VerifyAuthResponse {
	answerCorrect?: any;
}

export interface VerifyAuthEvent {
	version: string;
	region: string;
	userPoolId: string;
	userName: string;
	callerContext: CallerContext;
	triggerSource: string;
	request: VerifyAuthRequest;
	response: VerifyAuthResponse;
}

export interface PreTokenGenerationResponse {
	claimsOverrideDetails?: {
		claimsToAddOrOverride?: { [key: string]: string };
		claimsToSuppress?: string[];
	};
}

export interface GroupConfiguration {
	groupsToOverride: string[];
	iamRolesToOverride: any[];
	preferredRole?: any;
}

export interface PreTokenGenerationRequest {
	userAttributes: UserAttributes;
	groupConfiguration: GroupConfiguration;
	clientMetadata: ClientMetadata;
}

export interface PreTokenGenerationEvent {
	version: string;
	region: string;
	userPoolId: string;
	userName: string;
	callerContext: CallerContext;
	triggerSource: string;
	request: PreTokenGenerationRequest;
	response: PreTokenGenerationResponse;
}
