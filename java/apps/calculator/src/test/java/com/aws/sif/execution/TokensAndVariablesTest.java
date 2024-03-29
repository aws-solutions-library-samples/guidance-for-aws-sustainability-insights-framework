
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
public class TokensAndVariablesTest extends CalculatorBaseTest {

    private static Stream<Arguments> providerForSuccess() {
        return Stream.of(
				Arguments.of("set :a = :token1 * :token2\nset :b = :a * 10\n:b", EvaluateResponse.builder()
					.result(new NumberTypeValue("2000"))
					.evaluated(Map.of(
						":token1", "10",
						":token2", "20",
						"set :a = :token1 * :token2", "200",
						":a", "200",
						"set :b = :a * 10", "2000",
						":b", "2000")
					).build())
		);
    }

    @ParameterizedTest
    @MethodSource("providerForSuccess")
    void successTests(String expression, EvaluateResponse expected) {
		Map<String,DynamicTypeValue> parameters = Map.of(
			"token1", new NumberTypeValue(10),
			"token2", new NumberTypeValue(20)
		);

        // mocks
        when(executionVisitorProvider.get()).then(invocation-> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient, camlClient, gson));

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
}
