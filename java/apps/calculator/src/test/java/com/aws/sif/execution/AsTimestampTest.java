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

import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
public class AsTimestampTest extends CalculatorBaseTest {

    private static Stream<Arguments> providerForSuccess() {
        return Stream.of(
                Arguments.of("AS_TIMESTAMP('1/21/22','M/d/yy',timezone='America/Denver')", new NumberTypeValue(1642748400000L)),   // "2022-01-21 07:00:00.000000000"
                Arguments.of("AS_TIMESTAMP('1/21/22 13:40:13','M/d/yy HH:mm:ss',timezone='UTC')", new NumberTypeValue(1642772413000L)),    // "2022-01-21 13:40:13.000000000"
                // Arguments.of("AS_TIMESTAMP('1/21/22 3:40:13 PM','M/d/yy h:mm:ss a',timezone='America/Los_Angeles')", new NumberTypeValue(1642808413000L)), // "2022-01-21 23:40:13.000000000"
                Arguments.of("AS_TIMESTAMP('1/21/22 13:40:13 PST','M/d/yy HH:mm:ss zzz',timezone='America/Denver')", new NumberTypeValue(1642797613000L)),    // "2022-01-21 20:40:13.000000000"
                Arguments.of("AS_TIMESTAMP('2022-03-12T13:12:11','yyyy-MM-dd\\'T\\'HH:mm:ss',timezone='America/Denver')", new NumberTypeValue(1647115931000L)),
                Arguments.of("AS_TIMESTAMP('2022-07-25T12:53:54.097+00:00','yyyy-MM-dd\\'T\\'HH:mm:ss.SSSXXX')", new NumberTypeValue(1658753634000L)),    // "2023-07-25 12:53:54.097 UTC"
                Arguments.of("AS_TIMESTAMP('2022-07-25T18:23:54.097+05:30','yyyy-MM-dd\\'T\\'HH:mm:ss.SSSXXX')", new NumberTypeValue(1658753634000L)),    // "2023-07-25 18:23:54.097 UTC+5:30 (India)"
                Arguments.of("AS_TIMESTAMP('2022-07-25T05:53:54.097-07:00','yyyy-MM-dd\\'T\\'HH:mm:ss.SSSXXX')", new NumberTypeValue(1658753634000L)),    // "2023-07-25 05:53:54.097 UTC-7 (MST)"
                Arguments.of("AS_TIMESTAMP('1/21/22 13:40:13 PST','M/d/yy HH:mm:ss zzz',timezone='America/Denver',roundDownTo='day')", new NumberTypeValue(1642748400000L)),   // "2022-01-21 00:00:00.000000000 UTC-7 (MST)"
                // Arguments.of("AS_TIMESTAMP('1/21/22 13:40:13 PST','M/d/yy HH:mm:ss zzz',timezone='America/Denver',roundDownTo='week')", new NumberTypeValue(1642316400000L)),  // "2022-01-16 00:00:00.000000000 UTC-7 (MST)"
                Arguments.of("AS_TIMESTAMP('2/21/22 13:40:13 PST','M/d/yy HH:mm:ss zzz',timezone='America/Denver',roundDownTo='month')", new NumberTypeValue(1643698800000L)),   // "2022-02-01 00:00:00.000000000 UTC-7 (MST)"
                Arguments.of("AS_TIMESTAMP('2/21/22 13:40:13 PST','M/d/yy HH:mm:ss zzz',timezone='America/Denver',roundDownTo='year')", new NumberTypeValue(1641020400000L)),    // "2022-01-01 00:00:00.000000000 UTC-7 (MST)"
                Arguments.of("AS_TIMESTAMP('8/21/22 13:40:13 PST','M/d/yy HH:mm:ss zzz',timezone='America/Denver',roundDownTo='quarter')", new NumberTypeValue(1656655200000L)),   // "2022-07-01 00:00:00.000000000 UTC-7 (MST)"
                Arguments.of("AS_TIMESTAMP('11/21/22 13:40:13 PST','M/d/yy HH:mm:ss zzz',timezone='America/Denver',roundDownTo='quarter')", new NumberTypeValue(1664607600000L))   // "2022-10-01 00:00:00.000000000 UTC-7 (MST)"
        );
    }

    @ParameterizedTest
    @MethodSource("providerForSuccess")
    void success(String expression, DynamicTypeValue expected) {

        when(executionVisitorProvider.get()).then(invocation -> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient));

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

}
