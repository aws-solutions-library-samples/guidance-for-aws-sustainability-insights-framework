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

package com.aws.sif.audits;

import com.google.gson.GsonBuilder;
import lombok.Data;

import java.io.Serializable;

@Data
public class AuditMessageBlob implements Serializable, Cloneable {
    private String json;
    private String key;

    public AuditMessageBlob(AuditMessage message, String objectKey) {

        var gson = new GsonBuilder().create();
        this.json = gson.toJson(message);
        this.key = objectKey;
    }
}
