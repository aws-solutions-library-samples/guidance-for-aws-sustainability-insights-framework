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
import com.aws.sif.resources.impacts.Activity;
import com.aws.sif.resources.impacts.ActivityNotFoundException;
import com.aws.sif.resources.referenceDatasets.DatasetsClient;
import com.aws.sif.resources.referenceDatasets.ReferenceDatasetNotFoundException;
import org.antlr.v4.runtime.misc.ParseCancellationException;
import org.joda.time.DateTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
public class ImpactTest extends CalculatorBaseTest {

    private Authorizer AUTHORIZER = new Authorizer(GROUP_CONTEXT_ID, GROUP_CONTEXT_ID, Set.of(GROUP_CONTEXT_ID));


    @BeforeEach
    public void initEach(){
        underTest = new CalculatorImpl(executionVisitorProvider);
    }

    @Test
    void evaluateImpactFunction() throws ActivityNotFoundException {

        // input...
        var expression = "impact('one', 'two', 'three')";
        var expected = EvaluateResponse.builder()
                .result(new NumberTypeValue("0.3"))
                .evaluated(Map.of(
                        expression, "0.3"
                ))
                .activities(List.of(Map.of(
                        "activity", "one",
                        "impact", "two",
                        "component", "three",
                        "group", GROUP_CONTEXT_ID,
                        "version", "2"
                )))
                .build();

        // set up mocks...
        when(executionVisitorProvider.get()).then(invocation-> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient));

        when(impactsClient.getActivity(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID, AUTHORIZER,"one", Optional.empty(), Optional.empty() , Optional.empty()))
                .thenReturn(stubActivity(2));

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
    void evaluateImpactFunctionVersioned() throws ActivityNotFoundException {

        // input...
        var expression = "impact('one', 'two', 'two', version=22)";
        var expected = EvaluateResponse.builder()
                .result(new NumberTypeValue("0.2"))
                .evaluated(Map.of(
                        expression, "0.2"))
                .activities(List.of(Map.of(
                        "activity", "one",
                        "impact", "two",
                        "component", "two",
                        "version", "22",
                        "group", GROUP_CONTEXT_ID
                )))
                .build();

        // set up mocks...
        when(executionVisitorProvider.get()).then(invocation-> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient));
        when(impactsClient.getActivity(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID, AUTHORIZER,"one", Optional.empty(), Optional.of("22"), Optional.empty() ))
                .thenReturn(stubActivity(22));

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
    void evaluateImpactFunctionVersionedWithTimestamp() throws ActivityNotFoundException {

        // input...
        var expression = "impact('one', 'two', 'two', versionAsAt='2022-2-2')";
        var expected = EvaluateResponse.builder()
                .result(new NumberTypeValue("0.2"))
                .evaluated(Map.of(
                        expression, "0.2"))
                .activities(List.of(Map.of(
                        "activity", "one",
                        "impact", "two",
                        "component", "two",
                        "version", "22",
                        "group", GROUP_CONTEXT_ID
                )))
                .build();

        // set up mocks...
        when(executionVisitorProvider.get()).then(invocation-> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient));
        when(impactsClient.getActivity(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID, AUTHORIZER,"one", Optional.empty(), Optional.empty(), Optional.of("2022-2-2") ))
                .thenReturn(stubActivity(22));

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
    void evaluateImpactFunctionWithExpressions() throws ReferenceDatasetNotFoundException, ActivityNotFoundException {

        // input...
        var expression = "impact(lookup('A','B1','Z','C'), lookup('A','B2','Z','C'), lookup('A','B3','Z','C'))";
        var expected = EvaluateResponse.builder().result(new NumberTypeValue("0.3")).evaluated(Map.of(
                "lookup('A','B1','Z','C')", "one",
                "lookup('A','B2','Z','C')", "two",
                "lookup('A','B3','Z','C')", "three",
                "impact(lookup('A','B1','Z','C'), lookup('A','B2','Z','C'), lookup('A','B3','Z','C'))", "0.3"
        )).build();

        // set up mocks...
        when(executionVisitorProvider.get()).then(invocation-> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient));

        when(datasetsClient.getValue(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID, AUTHORIZER,"B1", "A", "C", "Z", Optional.empty(),Optional.empty(), Optional.empty()))
                .thenReturn(new DatasetsClient.GetValueResponse("one", 1));
        when(datasetsClient.getValue(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID, AUTHORIZER,"B2",  "A", "C", "Z", Optional.empty(),Optional.empty(), Optional.empty()))
                .thenReturn(new DatasetsClient.GetValueResponse("two", 1));
        when(datasetsClient.getValue(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID, AUTHORIZER,"B3",  "A", "C", "Z", Optional.empty(),Optional.empty(), Optional.empty()))
                .thenReturn(new DatasetsClient.GetValueResponse("three", 1));
        when(impactsClient.getActivity(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID,AUTHORIZER, "one", Optional.empty(), Optional.empty(), Optional.empty() ))
                .thenReturn(stubActivity(2));

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
        assertEquals( ((NumberTypeValue) expected.getResult()).getValue().doubleValue() , ((NumberTypeValue) actual.getResult()).getValue().doubleValue(), 0.001);
        assertEquals(expected.getEvaluated().size(), actual.getEvaluated().size());
        expected.getEvaluated().forEach(
                (key, value) ->
                        assertEquals(value, actual.getEvaluated().get(key), key)
        );
    }


    @Test
    void evaluateImpactFunctionExternalTenant() throws ActivityNotFoundException {

        // input...
        var expression = "impact('one', 'two', 'three', group='/shared', tenant='tenantb')";
        var expected = EvaluateResponse.builder()
                .result(new NumberTypeValue("0.3"))
                .evaluated(Map.of(
                        "impact('one', 'two', 'three', group='/shared', tenant='tenantb')", "0.3"
                ))
                .activities(List.of(Map.of(
                        "activity", "one",
                        "impact", "two",
                        "component", "three",
                        "tenant", "tenantb",
                        "group", "/shared",
                        "version", "2"
                )))
                .build();

        // set up mocks...
        when(executionVisitorProvider.get()).then(invocation-> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient));

        when(impactsClient.getActivity(PIPELINE_ID, EXECUTION_ID, "/shared", AUTHORIZER,"one", Optional.of("tenantb"), Optional.empty(), Optional.empty() ))
                .thenReturn(stubActivity(2));

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

    private static Stream<Arguments> providerForImpactFunctionFailed_ParseCancellationExceptions() {
        return Stream.of(
                Arguments.of("impact()", "Line 1:7 mismatched input ')' expecting {AS_TIMESTAMP, ASSIGN_TO_GROUP, COALESCE, CONCAT, CONVERT, IF, IMPACT, LOOKUP, LOWERCASE, REF, SET, SWITCH, UPPERCASE, BOOLEAN, NULL, CUSTOM_FUNCTION, TOKEN, QUOTED_STRING, NUMBER, SCIENTIFIC_NUMBER, '(', '-'}"),
                Arguments.of("impact('one','two')", "Line 1:18 mismatched input ')' expecting {'+', '-', '*', '/', '^', '>', '>=', '<', '<=', '==', '!=', COMMA, ' '}")
        );
    }

    @ParameterizedTest
    @MethodSource("providerForImpactFunctionFailed_ParseCancellationExceptions")
    void impactFunctionFailed_ParseCancellationExceptions(String expression, String expected) {
        Map<String,DynamicTypeValue> parameters = new LinkedHashMap<>();
        parameters.put("one", new StringTypeValue("ONE"));

        Exception exception = assertThrows(ParseCancellationException.class, () -> {
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

    private Activity stubActivity(int version) {
        var groups = new String[]{GROUP_CONTEXT_ID};

        var component1 = new Activity.Component("one", new BigDecimal("0.1"), null, null, null);
        var component2 = new Activity.Component("two", new BigDecimal("0.2"), null, null, null);
        var component3 = new Activity.Component("three", new BigDecimal("0.3"), null, null, null);

        Map<String,Activity.Component> components  ;
        components = new HashMap<>();

        components.put("one", component1);
        components.put("two", component2);
        components.put("three", component3);

        var impact1 = new Activity.Impact("one", null, components);
        var impact2 = new Activity.Impact("two", null, components);

        Map<String,Activity.Impact> impacts ;

        impacts = new HashMap<>();

        impacts.put("one", impact1);
        impacts.put("two", impact2);

        return new Activity(
                "abc123",
                "one",
                "description",
                null,
                version,
                "enabled",
                impacts,
                groups,
                null,
                "someone@somewhere.com",
                DateTime.now(),
                "someoneelse@somewhere.com",
                DateTime.now()
        );
    }

}
