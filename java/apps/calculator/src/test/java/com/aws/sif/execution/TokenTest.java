
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

import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
public class TokenTest extends CalculatorBaseTest {

    private static Stream<Arguments> providerForSuccess() {
        return Stream.of(
                Arguments.of(":one", EvaluateResponse.builder()
                        .result(new StringTypeValue("ONE"))
                        .evaluated(Map.of(":one", "ONE")).build()),
                Arguments.of(":two", EvaluateResponse.builder()
                        .result(new NumberTypeValue(2))
                        .evaluated(Map.of(":two", "2")).build()),
                Arguments.of(":three", EvaluateResponse.builder()
                        .result(new BooleanTypeValue(true))
                        .evaluated(Map.of(":three", "true")).build()),
				Arguments.of(":two/2", EvaluateResponse.builder()
					.result(new NumberTypeValue(1))
					.evaluated(Map.of(":two", "2")).build()),
        Arguments.of(":one:two:three", EvaluateResponse.builder()
                .result(new StringTypeValue("EMBEDDED COLONS"))
                .evaluated(Map.of(":one:two:three", "EMBEDDED COLONS")).build()));
    }

    @ParameterizedTest
    @MethodSource("providerForSuccess")
    void success(String expression, EvaluateResponse expected) {
        Map<String,DynamicTypeValue> parameters = new LinkedHashMap<>();
        parameters.put("one", new StringTypeValue("ONE"));
        parameters.put("two", new NumberTypeValue(2));
        parameters.put("three", new BooleanTypeValue(true));
        parameters.put("one:two:three", new StringTypeValue("EMBEDDED COLONS"));

        // mocks
        when(executionVisitorProvider.get()).then(invocation-> new ExecutionVisitorImpl(calculationsClient, datasetsClient, impactsClient));

        var evaluateExpressionRequest = CalculatorImpl.EvaluateExpressionRequest.builder()
                .pipelineId(PIPELINE_ID)
                .executionId(EXECUTION_ID)
                .groupContextId(GROUP_CONTEXT_ID)
                .expression(expression)
                .parameters(parameters)
                .build();
        var actual = underTest.evaluateExpression(evaluateExpressionRequest);
        assertEquals(expected, actual);
    }

    private static Stream<Arguments> providerForFailed() {
        return Stream.of(
                Arguments.of(":two", "Provided token 'two' not found as a pipeline parameter or variable.")
        );
    }

    @ParameterizedTest
    @MethodSource("providerForFailed")
    void failed(String expression, String expected) {
        Map<String,DynamicTypeValue> parameters = new LinkedHashMap<>();
        parameters.put("one", new StringTypeValue("ONE"));

        // mocks
        when(executionVisitorProvider.get()).then(invocation-> new ExecutionVisitorImpl(calculationsClient, datasetsClient, impactsClient));

        Exception exception = assertThrows(ArithmeticException.class, () -> {
            var evaluateExpressionRequest = CalculatorImpl.EvaluateExpressionRequest.builder()
                    .pipelineId(PIPELINE_ID)
                    .executionId(EXECUTION_ID)
                    .groupContextId(GROUP_CONTEXT_ID)
                    .expression(expression)
                    .parameters(parameters)
                    .build();
            underTest.evaluateExpression(evaluateExpressionRequest);
        });
        assertEquals(expected,  exception.getMessage());
    }

}
