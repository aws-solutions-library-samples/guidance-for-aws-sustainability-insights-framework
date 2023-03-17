
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
public class VariablesTest extends CalculatorBaseTest {

    private static Stream<Arguments> providerForSuccess() {
        return Stream.of(
                Arguments.of("set :a = 10\nset :a = :a * 10\n:a", EvaluateResponse.builder()
                        .result(new NumberTypeValue("100"))
                        .evaluated(Map.of("set :a = 10", "10",
							"set :a = :a * 10", "100",
							":a", "100")).build()),
			Arguments.of("set :a=true\nset :b=false\n:a==:b", EvaluateResponse.builder()
				.result(new BooleanTypeValue(false))
				.evaluated(Map.of("set :a=true", "true",
					"set :b=false", "false",
					":a", "true",
					":b", "false")).build())
		);
    }

    @ParameterizedTest
    @MethodSource("providerForSuccess")
    void successTests(String expression, EvaluateResponse expected) {
        Map<String,DynamicTypeValue> parameters = new LinkedHashMap<>();
        parameters.put("unused", new StringTypeValue("ONE"));

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
			Arguments.of(":this_is_not_declared", "Provided token 'this_is_not_declared' not found as a pipeline parameter or variable."),
			Arguments.of("set :parameter = 10", "Provided token 'parameter' is already being used as a pipeline parameter.")
		);
	}

	@ParameterizedTest
	@MethodSource("providerForFailed")
	void failedTests(String expression, String expected) {

		Map<String,DynamicTypeValue> parameters = new LinkedHashMap<>();
		parameters.put("parameter", new BooleanTypeValue(true));

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
