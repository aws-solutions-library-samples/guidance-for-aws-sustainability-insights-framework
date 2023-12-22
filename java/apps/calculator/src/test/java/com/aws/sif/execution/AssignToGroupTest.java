
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

import com.aws.sif.Authorizer;
import com.aws.sif.execution.output.OutputType;
import com.aws.sif.resources.groups.Group;
import com.aws.sif.resources.groups.GroupNotFoundException;
import org.antlr.v4.runtime.misc.ParseCancellationException;
import org.joda.time.DateTime;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
public class AssignToGroupTest extends CalculatorBaseTest {
	private Authorizer AUTHORIZER = new Authorizer(GROUP_CONTEXT_ID, GROUP_CONTEXT_ID, Set.of(GROUP_CONTEXT_ID));

    private static Stream<Arguments> providerForSuccess() {
		var success1StringTypeValue = new StringTypeValue("/test");
		success1StringTypeValue.setOutputType(OutputType.groupId);
		var success2StringTypeValue = new StringTypeValue("/test/subgroup");
		success2StringTypeValue.setOutputType(OutputType.groupId);
		var success3StringTypeValue = new StringTypeValue("/test/subgroup/subsubgroup");
		success3StringTypeValue.setOutputType(OutputType.groupId);
		var success4StringTypeValue = new StringTypeValue("/test");
		success4StringTypeValue.setOutputType(OutputType.groupId);
        return Stream.of(
                Arguments.of("assign_to_group('/test')", "/test", "/test", Map.of("groupId", new StringTypeValue("/test")), EvaluateResponse.builder().result(success1StringTypeValue).evaluated(Map.of("assign_to_group('/test')", "/test")).build()),
				Arguments.of("assign_to_group('/test/subgroup')", "/test/subgroup", "/test/subgroup", Map.of("groupId", new StringTypeValue("/test/subgroup")), EvaluateResponse.builder().result(success2StringTypeValue).evaluated(Map.of("assign_to_group('/test/subgroup')", "/test/subgroup")).build()),
				Arguments.of("assign_to_group('/test/subgroup/subsubgroup')", "/test/subgroup/subsubgroup", "/test/subgroup/subsubgroup", Map.of("groupId", new StringTypeValue("/test/subgroup/subsubgroup")), EvaluateResponse.builder().result(success3StringTypeValue).evaluated(Map.of("assign_to_group('/test/subgroup/subsubgroup')", "/test/subgroup/subsubgroup")).build()),
				Arguments.of("assign_to_group('/TEST')", "/test", "/test", Map.of("groupId", new StringTypeValue("/TEST")), EvaluateResponse.builder().result(success4StringTypeValue).evaluated(Map.of("assign_to_group('/TEST')", "/test")).build())
		);
    }

    @ParameterizedTest
    @MethodSource("providerForSuccess")
    void success(String expression, String groupId, String groupContextId, Map<String,DynamicTypeValue> context, EvaluateResponse expected) throws GroupNotFoundException {

        when(executionVisitorProvider.get()).then(invocation-> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient, camlClient, gson));

		when(groupsClient.groupExists(PIPELINE_ID, EXECUTION_ID, groupId, groupContextId, AUTHORIZER)).thenReturn(true);

        var evaluateExpressionRequest = CalculatorImpl.EvaluateExpressionRequest.builder()
                .pipelineId(PIPELINE_ID)
                .executionId(EXECUTION_ID)
                .groupContextId(GROUP_CONTEXT_ID)
                .expression(expression)
				.authorizer(AUTHORIZER)
                .context(context)
                .build();
        var actual = underTest.evaluateExpression(evaluateExpressionRequest);
        assertEquals(expected, actual);
    }

    private static Stream<Arguments> providerForFailedArguments() {
        return Stream.of(
                Arguments.of("assign_to_group()", "Line 1:16 mismatched input ')' expecting {AS_TIMESTAMP, ASSIGN_TO_GROUP, GET_VALUE, COALESCE, CONCAT, CONVERT, IF, IMPACT, LOOKUP, LOWERCASE, REF, CAML, SET, SPLIT, SWITCH, UPPERCASE, SEARCH, BOOLEAN, NULL, CUSTOM_FUNCTION, TOKEN, QUOTED_STRING, NUMBER, SCIENTIFIC_NUMBER, '(', '-'}"),
                Arguments.of("assign_to_group('/group1','/group2')", "Line 1:25 mismatched input ',' expecting {')', '+', '-', '*', '/', '^', '>', '>=', '<', '<=', '==', '!=', ' '}")
        );
    }

    @ParameterizedTest
    @MethodSource("providerForFailedArguments")
    void failedArguments(String expression, String expected) {

        Exception exception = assertThrows(ParseCancellationException.class, () -> {
            var evaluateExpressionRequest = CalculatorImpl.EvaluateExpressionRequest.builder()
                    .pipelineId(PIPELINE_ID)
                    .executionId(EXECUTION_ID)
                    .groupContextId(GROUP_CONTEXT_ID)
                    .expression(expression)
					.authorizer(AUTHORIZER)
                    .build();
            underTest.evaluateExpression(evaluateExpressionRequest);
        });
        assertEquals(expected,  exception.getMessage());
    }

	private static Stream<Arguments> providerForUnauthorizedGroups() {
		return Stream.of(
			Arguments.of("assign_to_group('/')", "/", "/", Map.of("groupId", new StringTypeValue("/")), "The group passed to ASSIGN_TO_GROUP (/) must be the same as or be a child of the group context of execution (/test)"),
			Arguments.of("assign_to_group('/not_test')", "/not_test", "/not_test", Map.of("groupId", new StringTypeValue("/not_test")), "The group passed to ASSIGN_TO_GROUP (/not_test) must be the same as or be a child of the group context of execution (/test)")
		);
	}

	@ParameterizedTest
	@MethodSource("providerForUnauthorizedGroups")
	void unauthorizedGroups(String expression, String groupId, String groupContextId, Map<String,DynamicTypeValue> context, String expected) throws GroupNotFoundException {

		when(executionVisitorProvider.get()).then(invocation-> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient, camlClient, gson));

		when(groupsClient.groupExists(PIPELINE_ID, EXECUTION_ID, groupId, groupContextId, AUTHORIZER)).thenReturn(true);

		Exception exception = assertThrows(ArithmeticException.class, () -> {
			var evaluateExpressionRequest = CalculatorImpl.EvaluateExpressionRequest.builder()
				.pipelineId(PIPELINE_ID)
				.executionId(EXECUTION_ID)
				.groupContextId(GROUP_CONTEXT_ID)
				.expression(expression)
				.authorizer(AUTHORIZER)
				.context(context)
				.build();
			underTest.evaluateExpression(evaluateExpressionRequest);
		});
		assertEquals(expected,  exception.getMessage());
	}


	private static Stream<Arguments> providerForNotFoundGroups() {
		return Stream.of(
			Arguments.of("assign_to_group('/doesnotexist')", Map.of("groupId", new StringTypeValue("/doesnotexist")), "Group passed to ASSIGN_TO_GROUP /doesnotexist does not exist.")
		);
	}

	@ParameterizedTest
	@MethodSource("providerForNotFoundGroups")
	void notFoundGroups(String expression, Map<String,DynamicTypeValue> context, String expected) throws GroupNotFoundException {

		when(executionVisitorProvider.get()).then(invocation-> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient, camlClient, gson));
		when(groupsClient.groupExists(PIPELINE_ID, EXECUTION_ID, "/doesnotexist", "/doesnotexist", AUTHORIZER)).thenThrow(new GroupNotFoundException("Group /doesnotexist not found"));

		Exception exception = assertThrows(ArithmeticException.class, () -> {
			var evaluateExpressionRequest = CalculatorImpl.EvaluateExpressionRequest.builder()
				.pipelineId(PIPELINE_ID)
				.executionId(EXECUTION_ID)
				.groupContextId(GROUP_CONTEXT_ID)
				.expression(expression)
				.authorizer(AUTHORIZER)
				.context(context)
				.build();
			underTest.evaluateExpression(evaluateExpressionRequest);
		});
		assertEquals(expected,  exception.getMessage());
	}
	private Group stubGroup(String groupId) {
		return new Group(
			groupId,
			"name",
			"description",
			"state",
			null,
			null,
			"unittest@test.com",
			DateTime.now(),
			"unittest@test.com",
			DateTime.now()
		);
	}
}
