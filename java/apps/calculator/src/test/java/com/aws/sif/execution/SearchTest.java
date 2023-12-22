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

import lombok.extern.slf4j.Slf4j;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;

@Slf4j
@ExtendWith(MockitoExtension.class)
public class SearchTest extends CalculatorBaseTest {

    private static Stream<Arguments> providerForSuccess() {
        return Stream.of(
                Arguments.of("search('Random text gas end','gas')", EvaluateResponse.builder().result(new NumberTypeValue(12))
                        .evaluated(Map.of("search('Random text gas end','gas')", "12")).build()),
                Arguments.of("search('Random text gas end','Gas')", EvaluateResponse.builder().result(new NumberTypeValue(-1))
                        .evaluated(Map.of("search('Random text gas end','Gas')", "-1")).build()),
                Arguments.of("search('Random text gas end','')", EvaluateResponse.builder().result(new NumberTypeValue(0))
                        .evaluated(Map.of("search('Random text gas end','')", "0")).build()),
                Arguments.of("search('','Gas')", EvaluateResponse.builder().result(new NumberTypeValue(-1))
                        .evaluated(Map.of("search('','Gas')", "-1")).build()),
                Arguments.of("search('Random text gas end','Gas', ignoreCase=true)", EvaluateResponse.builder().result(new NumberTypeValue(12))
                        .evaluated(Map.of("search('Random text gas end','Gas', ignoreCase=true)", "12")).build())
        );
    }

    @ParameterizedTest
    @MethodSource("providerForSuccess")
    void success(String expression, EvaluateResponse expected) {

        when(executionVisitorProvider.get()).then(invocation-> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient, camlClient, gson));

        var evaluateExpressionRequest = CalculatorImpl.EvaluateExpressionRequest.builder()
                .pipelineId(PIPELINE_ID)
                .executionId(EXECUTION_ID)
                .groupContextId(GROUP_CONTEXT_ID)
                .expression(expression)
                .build();
        var actual = underTest.evaluateExpression(evaluateExpressionRequest);
        assertEquals(expected, actual);
    }



}
