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

import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
public class ArithmeticTest extends CalculatorBaseTest {

    private static Stream<Arguments> providerForSuccess() {
        return Stream.of(
                Arguments.of("1+2", new NumberTypeValue(3)),
                Arguments.of("1-2", new NumberTypeValue(-1)),
                Arguments.of("6/2",new NumberTypeValue(3)),
                Arguments.of("2*4",new NumberTypeValue(8)),
                Arguments.of("2*-4", new NumberTypeValue(-8)),
                Arguments.of("2^2",new NumberTypeValue(4)),
                Arguments.of("1+2+3+4", new NumberTypeValue(10)),
                Arguments.of("1-2-3-4", new NumberTypeValue(-8)),
                Arguments.of("16/4/2", new NumberTypeValue(2)),
                Arguments.of("2*4*3", new NumberTypeValue(24)),
                Arguments.of("-2*4*3", new NumberTypeValue(-24)),
                Arguments.of("(1+(3*2)/(4-2)*(8+(4/3.5)))^2", new NumberTypeValue(808.1836734766978906918666325509548187255859375))
        );
    }

    @ParameterizedTest
    @MethodSource("providerForSuccess")
    void success(String expression, DynamicTypeValue expected) {

        when(executionVisitorProvider.get()).then(invocation-> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient));

        var evaluateExpressionRequest = CalculatorImpl.EvaluateExpressionRequest.builder()
                .pipelineId(PIPELINE_ID)
                .executionId(EXECUTION_ID)
                .groupContextId(GROUP_CONTEXT_ID)
                .expression(expression)
                .build();
        var actual = underTest.evaluateExpression(evaluateExpressionRequest);
        assertTrue(actual.getResult() instanceof NumberTypeValue);
        assertEquals(expected, actual.getResult());
    }

    private static Stream<Arguments> providerForFailed() {
        return Stream.of(
                Arguments.of("1+2+", "Line 1:4 mismatched input '<EOF>' expecting {AS_TIMESTAMP, ASSIGN_TO_GROUP, COALESCE, CONCAT, CONVERT, IF, IMPACT, LOOKUP, LOWERCASE, REF, SET, SWITCH, UPPERCASE, BOOLEAN, NULL, CUSTOM_FUNCTION, TOKEN, QUOTED_STRING, NUMBER, SCIENTIFIC_NUMBER, '(', '-', ' '}"),
                Arguments.of("1+2+++5", "Line 1:4 mismatched input '+' expecting {AS_TIMESTAMP, ASSIGN_TO_GROUP, COALESCE, CONCAT, CONVERT, IF, IMPACT, LOOKUP, LOWERCASE, REF, SET, SWITCH, UPPERCASE, BOOLEAN, NULL, CUSTOM_FUNCTION, TOKEN, QUOTED_STRING, NUMBER, SCIENTIFIC_NUMBER, '(', '-', ' '}"),
                Arguments.of("/3", "Line 1:0 extraneous input '/' expecting {AS_TIMESTAMP, ASSIGN_TO_GROUP, COALESCE, CONCAT, CONVERT, IF, IMPACT, LOOKUP, LOWERCASE, REF, SET, SWITCH, UPPERCASE, BOOLEAN, NULL, CUSTOM_FUNCTION, TOKEN, QUOTED_STRING, NUMBER, SCIENTIFIC_NUMBER, '(', '-'}"),
                Arguments.of("1+-/2", "Line 1:3 extraneous input '/' expecting {AS_TIMESTAMP, ASSIGN_TO_GROUP, COALESCE, CONCAT, CONVERT, IF, IMPACT, LOOKUP, LOWERCASE, REF, SET, SWITCH, UPPERCASE, BOOLEAN, NULL, CUSTOM_FUNCTION, TOKEN, QUOTED_STRING, NUMBER, SCIENTIFIC_NUMBER, '(', '-', ' '}")
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
