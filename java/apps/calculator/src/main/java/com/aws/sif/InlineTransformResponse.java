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

import lombok.Builder;
import lombok.Getter;
import lombok.ToString;

import java.util.List;
import java.util.Map;

@Getter
@ToString(callSuper = true)
public class InlineTransformResponse extends TransformResponse {

    private final List<String> headers;
    private final List<String> data;
    private List<String> errors;

    @Builder
    public InlineTransformResponse(List<String> headers, List<String> data, List<String> errors, boolean noActivitiesProcessed, String activityValueKey, Map<String, Map<String, String>> referenceDatasets, Map<String, Map<String, String>> activities) {
        this.headers = headers;
        this.data = data;
        this.errors = errors;
		this.noActivitiesProcessed = noActivitiesProcessed;
        this.activityValueKey = activityValueKey;
        this.activities = activities;
        this.referenceDatasets = referenceDatasets;
    }
}
