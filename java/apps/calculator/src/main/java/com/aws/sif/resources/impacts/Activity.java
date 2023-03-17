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

package com.aws.sif.resources.impacts;

import lombok.Value;
import org.joda.time.DateTime;

import java.math.BigDecimal;
import java.util.Map;

@Value
public class Activity {
    String id;
    String name;
    String description;
    Map<String,String> attributes;
    Integer version;
    String state;
    Map<String,Impact> impacts;
    String[] groups;
    Map<String,String> tags;
    String createdBy;
    DateTime createdAt;
    String updatedBy;
    DateTime updatedAt;

    @Value
    public static class Impact {
        String name;
        Map<String,String> attributes;
        Map<String,Component> components;
    }

    @Value
    public static class Component {
        String key;
        BigDecimal value;
        String type;
        String label;
        String description;
    }
}
