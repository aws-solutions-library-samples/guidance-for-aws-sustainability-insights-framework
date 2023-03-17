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

package com.aws.sif.resources.calculations;

import lombok.Value;
import org.joda.time.DateTime;

import java.util.Map;

@Value
public class Calculation {
    String id;
    String name;
    String summary;
    String description;
    String formula;
    Parameter[] parameters;
    Output[] outputs;
    Integer version;
    String state;
    String[] groups;
    Map<String,String> tags;
    String createdBy;
    DateTime createdAt;
    String updatedBy;
    DateTime updatedAt;

    @Value
    public static class Parameter {
        Integer index;
        String key;
        String label;
        String description;
        String type;
    }

    @Value
    public static class Output {
        String name;
        String description;
        String type;
    }
}
