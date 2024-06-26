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

package com.aws.sif;

import lombok.Getter;
import lombok.ToString;

import java.util.Map;

@ToString(callSuper = true)
public class S3TransformResponse extends TransformResponse {

	@Getter
	private S3Location errorLocation;

	public S3TransformResponse(S3Location errorLocation, boolean noActivitiesProcessed, String activityValueKey, Map<String, Map<String, String>> referenceDatasets, Map<String, Map<String, String>> activities) {
		this.errorLocation = errorLocation;
		this.noActivitiesProcessed = noActivitiesProcessed;
		this.activityValueKey = activityValueKey;
		this.activities = activities;
		this.referenceDatasets = referenceDatasets;
	}
}
