
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

import org.antlr.v4.runtime.misc.ParseCancellationException;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
public class RefTest extends CalculatorBaseTest {

    private static Stream<Arguments> providerForSuccess() {
        return Stream.of(
                Arguments.of("ref('one')", Map.of("one", new StringTypeValue("one")), EvaluateResponse.builder().result(new StringTypeValue("one")).evaluated(Map.of("ref('one')", "one")).build()),
                Arguments.of("ref('one')", Map.of("one", new NumberTypeValue(1)), EvaluateResponse.builder().result(new NumberTypeValue(1)).evaluated(Map.of("ref('one')", "1")).build()),
                Arguments.of("ref('one')", Map.of("one", new BooleanTypeValue(true)), EvaluateResponse.builder().result(new BooleanTypeValue(true)).evaluated(Map.of("ref('one')", "true")).build()),
                Arguments.of("ref('two')", Map.of("one", new BooleanTypeValue(true)), EvaluateResponse.builder().result(new NullValue()).evaluated(Map.of("ref('two')", "")).build()));
    }

    @ParameterizedTest
    @MethodSource("providerForSuccess")
    void success(String expression, Map<String,DynamicTypeValue> context, EvaluateResponse expected) {

        when(executionVisitorProvider.get()).then(invocation-> new ExecutionVisitorImpl(calculationsClient, datasetsClient, impactsClient));

        var evaluateExpressionRequest = CalculatorImpl.EvaluateExpressionRequest.builder()
                .pipelineId(PIPELINE_ID)
                .executionId(EXECUTION_ID)
                .groupContextId(GROUP_CONTEXT_ID)
                .expression(expression)
                .context(context)
                .build();
        var actual = underTest.evaluateExpression(evaluateExpressionRequest);
        assertEquals(expected, actual);
    }

    private static Stream<Arguments> providerForFailed() {
        return Stream.of(
                Arguments.of("ref()", "Line 1:4 mismatched input ')' expecting {AS_TIMESTAMP, COALESCE, CONCAT, CONVERT, IF, IMPACT, LOOKUP, LOWERCASE, REF, SET, SWITCH, UPPERCASE, BOOLEAN, NULL, CUSTOM_FUNCTION, TOKEN, QUOTED_STRING, NUMBER, SCIENTIFIC_NUMBER, '(', '-'}"),
                Arguments.of("ref('one','two')", "Line 1:9 mismatched input ',' expecting {')', '+', '-', '*', '/', '^', '>', '>=', '<', '<=', '==', '!=', ' '}")
        );
    }

    @ParameterizedTest
    @MethodSource("providerForFailed")
    void failed(String expression, String expected) {
        Exception exception = assertThrows(ParseCancellationException.class, () -> {
            var evaluateExpressionRequest = CalculatorImpl.EvaluateExpressionRequest.builder()
                    .pipelineId(PIPELINE_ID)
                    .executionId(EXECUTION_ID)
                    .groupContextId(GROUP_CONTEXT_ID)
                    .expression(expression)
                    .build();
            underTest.evaluateExpression(evaluateExpressionRequest);
        });
        assertEquals(expected,  exception.getMessage());
    }

}
