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
import com.aws.sif.resources.calculations.Calculation;
import com.aws.sif.resources.calculations.CalculationNotFoundException;
import org.joda.time.DateTime;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
public class CustomTest extends CalculatorBaseTest {
    private Authorizer AUTHORIZER = new Authorizer(GROUP_CONTEXT_ID, GROUP_CONTEXT_ID, Set.of(GROUP_CONTEXT_ID));

    @Test
    void evaluateCustomFunction_single() throws CalculationNotFoundException {

        // input...
        var expression = "#custom_multiply(2,3)";
        var expected = EvaluateResponse.builder()
                .result(new NumberTypeValue(6))
                .evaluated(Map.of("#custom_multiply(2,3)", "6"))
                .calculations(List.of(
                        Map.of(
                                "function","custom_multiply",
                                "arg0", "2",
                                "arg1", "3",
                                "group", GROUP_CONTEXT_ID,
                                "version", "1"
                        )
                ))
                .build();

        // set up mocks...
        when(executionVisitorProvider.get()).then(invocation-> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient, camlClient, gson));
        when(calculationsClient.getCalculation(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID, AUTHORIZER,"custom_multiply", Optional.empty(), Optional.empty(), Optional.empty() ))
                .thenReturn(stubCustomMultiplyCalculation());

        // execute...
        var evaluateExpressionRequest = CalculatorImpl.EvaluateExpressionRequest.builder()
                .pipelineId(PIPELINE_ID)
                .executionId(EXECUTION_ID)
                .groupContextId(GROUP_CONTEXT_ID)
                .expression(expression)
                .authorizer(AUTHORIZER)
                .build();
        var actual = underTest.evaluateExpression(evaluateExpressionRequest);

        // verify...
        assertEquals( expected, actual);
    }

    @Test
    void evaluateCustomFunction_versionedWithTimestamp() throws CalculationNotFoundException {

        // input...
        var expression = "#custom_multiply(2,3,versionAsAt='2022-1-1')";
        var expected = EvaluateResponse.builder()
                .result(new NumberTypeValue(6))
                .evaluated(Map.of("#custom_multiply(2,3,versionAsAt='2022-1-1')", "6"))
                .calculations(List.of(
                        Map.of(
                                "function","custom_multiply",
                                "arg0", "2",
                                "arg1", "3",
                                "group", GROUP_CONTEXT_ID,
                                "version", "1"
                        )
                ))
                .build();

        // set up mocks...
        when(executionVisitorProvider.get()).then(invocation-> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient, camlClient, gson));
        when(calculationsClient.getCalculation(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID, AUTHORIZER,"custom_multiply", Optional.empty(), Optional.empty(), Optional.of("2022-1-1") ))
                .thenReturn(stubCustomMultiplyCalculation());

        // execute...
        var evaluateExpressionRequest = CalculatorImpl.EvaluateExpressionRequest.builder()
                .pipelineId(PIPELINE_ID)
                .executionId(EXECUTION_ID)
                .groupContextId(GROUP_CONTEXT_ID)
                .expression(expression)
                .authorizer(AUTHORIZER)
                .build();
        var actual = underTest.evaluateExpression(evaluateExpressionRequest);

        // verify...
        assertEquals( expected, actual);
    }

    @Test
    void evaluateCustomFunction_multipleSame() throws CalculationNotFoundException {

        // input...
        var expression = "#custom_multiply(2,3)+#custom_multiply(4,9)";
        var expected = EvaluateResponse.builder()
                .result(new NumberTypeValue(42))
                .evaluated(Map.of(
                "#custom_multiply(2,3)", "6",
                "#custom_multiply(4,9)", "36")
                )
                .calculations(List.of(
                        Map.of(
                                "function","custom_multiply",
                                "arg0", "2",
                                "arg1", "3",
                                "group", GROUP_CONTEXT_ID,
                                "version", "1"
                        ), Map.of(
                                "function","custom_multiply",
                                "arg0", "4",
                                "arg1", "9",
                                "group", GROUP_CONTEXT_ID,
                                "version", "1"
                        )
                ))
                .build();

        // set up mocks..
        when(executionVisitorProvider.get()).then(invocation-> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient, camlClient, gson));

        when(calculationsClient.getCalculation(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID, AUTHORIZER,"custom_multiply", Optional.empty(), Optional.empty(), Optional.empty()))
                .thenReturn(stubCustomMultiplyCalculation());

        // execute...
        var evaluateExpressionRequest = CalculatorImpl.EvaluateExpressionRequest.builder()
                .pipelineId(PIPELINE_ID)
                .executionId(EXECUTION_ID)
                .groupContextId(GROUP_CONTEXT_ID)
                .expression(expression)
                .authorizer(AUTHORIZER)
                .build();
        var actual = underTest.evaluateExpression(evaluateExpressionRequest);

        // verify...
        assertEquals( expected, actual);
    }

    @Test
    void evaluateCustomFunction_multipleDifferent() throws CalculationNotFoundException {

        // input...
        var expression = "#custom_multiply(2,3)+#custom_addition(4,9)";
        var expected = EvaluateResponse.builder().result(new NumberTypeValue(19))
            .evaluated(Map.of(
                "#custom_multiply(2,3)", "6",
                "#custom_addition(4,9)", "13"
            ))
                .calculations(List.of(
                        Map.of(
                                "function","custom_multiply",
                                "arg0", "2",
                                "arg1", "3",
                                "group", GROUP_CONTEXT_ID,
                                "version", "1"
                        ), Map.of(
                                "function","custom_addition",
                                "arg0", "4",
                                "arg1", "9",
                                "group", GROUP_CONTEXT_ID,
                                "version", "1"
                        )
                ))
                .build();

        // set up mocks...
        when(executionVisitorProvider.get()).then(invocation-> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient, camlClient, gson));
        when(calculationsClient.getCalculation(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID, AUTHORIZER,"custom_multiply", Optional.empty(), Optional.empty(), Optional.empty()))
                .thenReturn(stubCustomMultiplyCalculation());

        when(calculationsClient.getCalculation(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID, AUTHORIZER,"custom_addition", Optional.empty(), Optional.empty(), Optional.empty()))
                .thenReturn(stubCustomAdditionCalculation());

        // execute...
        var evaluateExpressionRequest = CalculatorImpl.EvaluateExpressionRequest.builder()
                .pipelineId(PIPELINE_ID)
                .executionId(EXECUTION_ID)
                .groupContextId(GROUP_CONTEXT_ID)
                .expression(expression)
                .authorizer(AUTHORIZER)
                .build();
        var actual = underTest.evaluateExpression(evaluateExpressionRequest);

        // verify...
        assertEquals( expected,actual);
    }

    @Test
    void evaluateCustomFunction_nested() throws CalculationNotFoundException {

        // input...
        var expression = "#custom_nested(1,2,3,4)+#custom_addition(5,6)";
        var expected = EvaluateResponse.builder().result(new NumberTypeValue(20)).evaluated(Map.of(
                "#custom_nested(1,2,3,4)", "9",
                "#custom_addition(5,6)", "11"
        ))
                .calculations(List.of(
                        Map.of(
                                "function","custom_nested",
                                "arg0", "1",
                                "arg1", "2",
                                "arg2", "3",
                                "arg3", "4",
                                "group", GROUP_CONTEXT_ID,
                                "version", "1"
                        ), Map.of(
                                "function","custom_addition",
                                "arg0", "5",
                                "arg1", "6",
                                "group", GROUP_CONTEXT_ID,
                                "version", "1"
                        )
                ))
                .build();

        // set up mocks...
        when(executionVisitorProvider.get()).then(invocation-> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient, camlClient, gson));
        when(calculationsClient.getCalculation(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID, AUTHORIZER,"custom_multiply", Optional.empty(), Optional.empty(), Optional.empty()))
                .thenReturn(stubCustomMultiplyCalculation());

        when(calculationsClient.getCalculation(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID,AUTHORIZER, "custom_addition", Optional.empty(), Optional.empty(), Optional.empty()))
                .thenReturn(stubCustomAdditionCalculation());

        when(calculationsClient.getCalculation(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID, AUTHORIZER,"custom_nested", Optional.empty(), Optional.empty(), Optional.empty()))
                .thenReturn(stubCustomNestedCalculation());

        // execute...
        var evaluateExpressionRequest = CalculatorImpl.EvaluateExpressionRequest.builder()
                .pipelineId(PIPELINE_ID)
                .executionId(EXECUTION_ID)
                .groupContextId(GROUP_CONTEXT_ID)
                .expression(expression)
                .authorizer(AUTHORIZER)
                .build();
        var actual = underTest.evaluateExpression(evaluateExpressionRequest);

        // verify...
        assertEquals( expected, actual);
    }

    @Test
    void evaluateCustomFunction_externalTenant() throws CalculationNotFoundException {

        // input...
        var expression = "#custom_multiply(2,3, group='/shared', tenant='tenantb')";
        var expected = EvaluateResponse.builder()
                .result(new NumberTypeValue(6))
                .evaluated(Map.of("#custom_multiply(2,3, group='/shared', tenant='tenantb')", "6"))
                .calculations(List.of(
                        Map.of(
                                "function","custom_multiply",
                                "arg0", "2",
                                "arg1", "3",
                                "tenant", "tenantb",
                                "group", "/shared",
                                "version", "1"
                        )
                ))
                .build();

        // set up mocks...
        when(executionVisitorProvider.get()).then(invocation-> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient, camlClient, gson));
        when(calculationsClient.getCalculation(PIPELINE_ID, EXECUTION_ID, "/shared", AUTHORIZER,"custom_multiply", Optional.of("tenantb"), Optional.empty(), Optional.empty() ))
                .thenReturn(stubCustomMultiplyCalculation());

        // execute...
        var evaluateExpressionRequest = CalculatorImpl.EvaluateExpressionRequest.builder()
                .pipelineId(PIPELINE_ID)
                .executionId(EXECUTION_ID)
                .groupContextId(GROUP_CONTEXT_ID)
                .expression(expression)
                .authorizer(AUTHORIZER)
                .build();
        var actual = underTest.evaluateExpression(evaluateExpressionRequest);



        // verify...
        assertEquals( expected, actual);
    }

    @Test
    void evaluateCustomFunction_multiLevelGroup() throws CalculationNotFoundException {

        // input...
        var expression = "#custom_multiply(2,3, group='/shared/l2/l3/l4')";
        var expected = EvaluateResponse.builder()
                .result(new NumberTypeValue(6))
                .evaluated(Map.of("#custom_multiply(2,3, group='/shared/l2/l3/l4')", "6"))
                .calculations(List.of(
                        Map.of(
                                "function","custom_multiply",
                                "arg0", "2",
                                "arg1", "3",
                                "group", "/shared/l2/l3/l4",
                                "version", "1"
                        )
                ))
                .build();

        // set up mocks...
        when(executionVisitorProvider.get()).then(invocation-> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient, camlClient, gson));
        when(calculationsClient.getCalculation(PIPELINE_ID, EXECUTION_ID, "/shared/l2/l3/l4", AUTHORIZER,"custom_multiply", Optional.empty(), Optional.empty(), Optional.empty() ))
                .thenReturn(stubCustomMultiplyCalculation());

        // execute...
        var evaluateExpressionRequest = CalculatorImpl.EvaluateExpressionRequest.builder()
                .pipelineId(PIPELINE_ID)
                .executionId(EXECUTION_ID)
                .groupContextId(GROUP_CONTEXT_ID)
                .expression(expression)
                .authorizer(AUTHORIZER)
                .build();
        var actual = underTest.evaluateExpression(evaluateExpressionRequest);

        // verify...
        assertEquals( expected, actual);
    }

    private Calculation stubCustomMultiplyCalculation() {
        // set up mocks...
        var parameters = new Calculation.Parameter[] {
                new Calculation.Parameter(0, "one", "ONE", "one description", "number"),
                new Calculation.Parameter(1, "two", "TWO", "two description", "number")
        };

        var outputs = new Calculation.Output[] {
                new Calculation.Output("sum", "sum desc", "number")
        };

        var groups = new String[]{GROUP_CONTEXT_ID};

        return new Calculation(
                "abc123",
                "custom_multiply",
                "summary",
                "description",
                ":one*:two",
                parameters,
                outputs,
                1,
                "enabled",
                groups,
                null,
                "someone@somewhere.com",
                DateTime.now(),
                "someoneelse@somewhere.com",
                DateTime.now()
        );

    }
    private Calculation stubCustomAdditionCalculation() {
        // set up mocks...
        var parameters = new Calculation.Parameter[] {
                new Calculation.Parameter(0, "one", "ONE", "one description", "number"),
                new Calculation.Parameter(1, "two", "TWO", "two description", "number")
        };

        var outputs = new Calculation.Output[] {
                new Calculation.Output("sum", "sum desc", "number")
        };

        var groups = new String[]{GROUP_CONTEXT_ID};

        return new Calculation(
                "abc456",
                "custom_addition",
                "summary",
                "description",
                ":one+:two",
                parameters,
                outputs,
                1,
                "enabled",
                groups,
                null,
                "someone@somewhere.com",
                DateTime.now(),
                "someoneelse@somewhere.com",
                DateTime.now()
        );
    }

    private Calculation stubCustomNestedCalculation() {
        // set up mocks...
        var parameters = new Calculation.Parameter[] {
                new Calculation.Parameter(0, "one", "ONE", "one description", "number"),
                new Calculation.Parameter(1, "two", "TWO", "two description", "number"),
                new Calculation.Parameter(1, "three", "THREE", "three description", "number"),
                new Calculation.Parameter(1, "four", "FOUR", "four description", "number")
        };

        var outputs = new Calculation.Output[] {
                new Calculation.Output("sum", "sum desc", "number")
        };

        var groups = new String[]{GROUP_CONTEXT_ID};

        return new Calculation(
                "abc456",
                "custom_nested",
                "summary",
                "description",
                "#custom_multiply(:one,:two)+#custom_addition(:three,:four)",
                parameters,
                outputs,
                1,
                "enabled",
                groups,
                null,
                "someone@somewhere.com",
                DateTime.now(),
                "someoneelse@somewhere.com",
                DateTime.now()
        );
    }

}
