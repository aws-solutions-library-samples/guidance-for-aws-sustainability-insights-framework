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

import com.aws.sif.audits.Auditor;
import com.aws.sif.execution.Calculator;
import com.aws.sif.execution.DynamicTypeValue;
import com.aws.sif.execution.NullValue;
import com.aws.sif.execution.output.DataTypeOutputWriter;
import com.aws.sif.execution.output.OutputType;
import com.aws.sif.resources.users.UsersClient;
import com.google.gson.Gson;
import com.typesafe.config.Config;
import lombok.extern.slf4j.Slf4j;
import org.jetbrains.annotations.NotNull;

import javax.inject.Inject;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
public class DataTypeCalculatorService extends AbstractCalculatorService<DataTypeRecord> {

    @Inject
    public DataTypeCalculatorService(Calculator calculator, S3Utils s3, Auditor auditor, Config config, DataTypeOutputWriter outputWriter, UsersClient usersClient, Gson gson) {
        super(calculator, s3, auditor, config, outputWriter, usersClient, gson);
    }

    @NotNull
    Map<String, String> getOutputMap(TransformRequest req) {
        Map<String, String> outputMap = new HashMap<>();
        req.getTransforms().forEach(t -> t.getOutputs().forEach(o -> outputMap.put(o.getKey(), o.getType())));
        return outputMap;
    }

    @NotNull
    Map<String, DynamicTypeValue> getValueMap(TransformRequest req, Map<String, DynamicTypeValue> outputRow) {
        // loop through the values and generate a value column mapping
        this.valueMap.clear();
        // if action type is deletion insert null values
        if (isDeletion(req)) {
            for (Map.Entry<String, DynamicTypeValue> entry : outputRow.entrySet()) {
                this.valueMap.put(entry.getKey(), new NullValue());
            }

        } else {
            this.valueMap = outputRow.entrySet().stream().filter(x -> (OutputType.uniqueId.equals(x.getValue().getOutputType()) || OutputType.time.equals(x.getValue().getOutputType()) || OutputType.value.equals(x.getValue().getOutputType()) || OutputType.groupId.equals(x.getValue().getOutputType()))).collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
        }
        return this.valueMap;
    }

    @NotNull
    DataTypeRecord buildRecord(TransformRequest req, Map<String, DynamicTypeValue> outputRow) {
        var values = this.getValueMap(req, outputRow);
        return new DataTypeRecord(values);
    }

}
