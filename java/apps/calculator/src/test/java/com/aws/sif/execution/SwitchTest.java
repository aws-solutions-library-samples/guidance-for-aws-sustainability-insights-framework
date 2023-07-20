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

import java.util.Map;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
public class SwitchTest extends CalculatorBaseTest {

    private static Stream<Arguments> providerForSuccess() {
        return Stream.of(
//                Arguments.of("switch('b','a','A','b','B','c','C')", EvaluateResponse.builder().result(new StringTypeValue("B"))
//                        .evaluated(Map.of("switch('b','a','A','b','B','c','C')", "B")).build()),
//			Arguments.of("switch('c',1,'A',false,'B','c','C')", EvaluateResponse.builder().result(new StringTypeValue("C"))
//				.evaluated(Map.of("switch('c',1,'A',false,'B','c','C')", "C")).build()),
//			Arguments.of("switch('x','a','A','b','B','c','C',default='ok')", EvaluateResponse.builder().result(new StringTypeValue("ok"))
//				.evaluated(Map.of("switch('x','a','A','b','B','c','C',default='ok')", "ok")).build()),
//			Arguments.of("switch('B','b','B1','B','B2','bb','B3')", EvaluateResponse.builder().result(new StringTypeValue("B2"))
//				.evaluated(Map.of("switch('B','b','B1','B','B2','bb','B3')", "B2")).build()),
//			Arguments.of("switch('B','b','B1','B','B2','bb','B3',ignoreCase=true)", EvaluateResponse.builder().result(new StringTypeValue("B1"))
//				.evaluated(Map.of("switch('B','b','B1','B','B2','bb','B3',ignoreCase=true)", "B1")).build()),
			Arguments.of("switch('bb',1>5,'A',concat('b','b'),'B','c','C')", EvaluateResponse.builder().result(new StringTypeValue("B"))
				.evaluated(Map.of(
					"concat('b','b')", "bb",
					"switch('bb',1>5,'A',concat('b','b'),'B','c','C')", "B")
				).build())
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
