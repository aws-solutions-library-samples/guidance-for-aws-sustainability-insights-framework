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

package com.aws.sif.execution;

import com.jayway.jsonpath.InvalidJsonException;
import com.jayway.jsonpath.InvalidPathException;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
public class GetValueTest extends CalculatorBaseTest {

    private static String getValueFunction(String json, String query) {
        return String.format("get_value('%s','%s')", json, query);
    }

    private static Stream<Arguments> providerForSuccess() {

        String json = "{\"name\": \"co2e\",\"attributes\": {\"unit\": \"kg\",\"isTest\":true},\"components\": [{\"key\": \"co2\",\"value\": 5.304733389,\"type\": \"pollutant\",\"label\": null,\"description\": \"\"},{\"key\": \"ipcc 2016 ar4 gwp 100\",\"value\": 4.310182088,\"type\": \"impactFactor\",\"label\": \"\",\"description\": \"\"}]}";
        return Stream.of(
                // Validate value retrieval from 1st Level
                Arguments.of( getValueFunction(json, "$.name"), EvaluateResponse.builder().result(new StringTypeValue("co2e")).evaluated(Map.of(getValueFunction(json, "$.name"), "co2e")).build()),
                Arguments.of( getValueFunction(json, "$.components[:1].key"), EvaluateResponse.builder().result(new ListTypeValue(List.of(new StringTypeValue("co2")))).evaluated(Map.of(getValueFunction(json, "$.components[:1].key"), "[\"co2\"]")).build()),
                Arguments.of( getValueFunction(json, "$.attributes.unit"), EvaluateResponse.builder().result(new StringTypeValue("kg")).evaluated(Map.of(getValueFunction(json, "$.attributes.unit"), "kg")).build()),
                Arguments.of( getValueFunction(json, "$.components[:1].value"), EvaluateResponse.builder().result(new ListTypeValue(List.of(new NumberTypeValue(5.304733389)))).evaluated(Map.of(getValueFunction(json, "$.components[:1].value"), "[5.304733389]")).build()),
                Arguments.of( getValueFunction(json, "$.components[:1].label"), EvaluateResponse.builder().result(new ListTypeValue(List.of(new NullValue()))).evaluated(Map.of(getValueFunction(json, "$.components[:1].label"), "[null]")).build()),
                Arguments.of( getValueFunction(json, "$.attributes.isTest"), EvaluateResponse.builder().result(new BooleanTypeValue(true)).evaluated(Map.of(getValueFunction(json, "$.attributes.isTest"), "true")).build()),
                Arguments.of( getValueFunction(json, "$.components[*].missingKey"), EvaluateResponse.builder().result(new ListTypeValue(new ArrayList<>())).evaluated(Map.of(getValueFunction(json, "$.components[*].missingKey"), "[]")).build()));
    }

    @ParameterizedTest
    @MethodSource("providerForSuccess")
    void success(String expression, EvaluateResponse expected) {

        when(executionVisitorProvider.get()).then(invocation -> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient, camlClient, gson));

        var evaluateExpressionRequest = CalculatorImpl.EvaluateExpressionRequest.builder().pipelineId(PIPELINE_ID).executionId(EXECUTION_ID).groupContextId(GROUP_CONTEXT_ID).expression(expression).build();
        var actual = underTest.evaluateExpression(evaluateExpressionRequest);
        assertEquals(expected, actual);
    }

    private static Stream<Arguments> providerForInvalidJsonFailure() {

        return Stream.of(
                // JSON is invalid
                Arguments.of("get_value('{[,}','$.name')", "Unable to parse json: Unexpected character ([) at position 1."),
                Arguments.of("get_value('{{,]}','$.name')", "Unable to parse json: Unexpected character ({) at position 1."),
                Arguments.of("get_value('{','$.name')", "Unable to parse json: Unexpected End Of File position 0: null"),
                Arguments.of("get_value('}','$.name')", "Unable to parse json: Unexpected character (}) at position 0."));
    }
    @ParameterizedTest
    @MethodSource("providerForInvalidJsonFailure")
    void invalidJsonFailure(String expression, String expected) {
        when(executionVisitorProvider.get()).then(invocation -> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient, camlClient, gson));;


        Exception exception = assertThrows(ArithmeticException.class, () -> {
            var evaluateExpressionRequest = CalculatorImpl.EvaluateExpressionRequest.builder().pipelineId(PIPELINE_ID).executionId(EXECUTION_ID).groupContextId(GROUP_CONTEXT_ID).expression(expression).build();
            underTest.evaluateExpression(evaluateExpressionRequest);
        });
        assertEquals(expected, exception.getMessage());
    }

    private static Stream<Arguments> providerForInvalidPathFailure() {
        String jsonString = "{\"name\": \"co2e\",\"attributes\": {\"unit\": \"kg\",\"isTest\":true},\"components\": [{\"key\": \"co2\",\"value\": 5.304733389,\"type\": \"pollutant\",\"label\": null,\"description\": \"\"},{\"key\": \"ipcc 2016 ar4 gwp 100\",\"value\": 4.310182088,\"type\": \"impactFactor\",\"label\": \"\",\"description\": \"\"}]}";

        return Stream.of(
                // InvalidPath is thrown for missing key in object
                Arguments.of(String.format("get_value('%s','$.noneExistingPath')", jsonString), "No results for path: $['noneExistingPath']"),
                // InvalidPath is thrown for missing key in nested object
                Arguments.of(String.format("get_value('%s','$.attributes.noneExistingPath')", jsonString), "No results for path: $['attributes']['noneExistingPath']"),
                // InvalidPath is thrown for bad query path
                Arguments.of(String.format("get_value('%s','#invalidPath')", jsonString), "No results for path: $['#invalidPath']"));
    }

    @ParameterizedTest
    @MethodSource("providerForInvalidPathFailure")
    void invalidPathFailure(String expression, String expected) {
        when(executionVisitorProvider.get()).then(invocation -> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient, camlClient, gson));

        Exception exception = assertThrows(ArithmeticException.class, () -> {
            var evaluateExpressionRequest = CalculatorImpl.EvaluateExpressionRequest.builder().pipelineId(PIPELINE_ID).executionId(EXECUTION_ID).groupContextId(GROUP_CONTEXT_ID).expression(expression).build();
            underTest.evaluateExpression(evaluateExpressionRequest);
        });
        assertEquals(expected, exception.getMessage());
    }

}
