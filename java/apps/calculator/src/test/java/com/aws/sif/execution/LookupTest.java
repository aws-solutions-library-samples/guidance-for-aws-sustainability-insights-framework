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
import com.aws.sif.resources.referenceDatasets.DatasetsClient;
import com.aws.sif.resources.referenceDatasets.ReferenceDatasetNotFoundException;
import org.junit.jupiter.api.BeforeEach;
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
public class LookupTest extends CalculatorBaseTest {

    private Authorizer AUTHORIZER = new Authorizer(GROUP_CONTEXT_ID, GROUP_CONTEXT_ID, Set.of(GROUP_CONTEXT_ID));

    @BeforeEach
    public void initEach() {
        underTest = new CalculatorImpl(executionVisitorProvider);
    }

    @Test
    void evaluateLookupFunction() throws ReferenceDatasetNotFoundException {

        // input...
        var expression = "lookup('myValue','mySource','myKeyColumn','myOutputColumn')";
        var expected = EvaluateResponse.builder()
                .result(new NumberTypeValue(0.3))
                .evaluated(Map.of(
                        expression, "0.3")
                ).referenceDatasets(List.of(Map.of(
                        "value", "myValue",
                        "name", "mySource",
                        "keyColumn",  "myKeyColumn",
                        "outputColumn", "myOutputColumn",
                        "group", GROUP_CONTEXT_ID,
                        "version", "123"
                )))
                .build();

        // set up mocks...
        when(executionVisitorProvider.get()).then(invocation-> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient));
        when(datasetsClient.getValue(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID, AUTHORIZER,"mySource", "myValue", "myOutputColumn", "myKeyColumn", Optional.empty(),Optional.empty(), Optional.empty()))
                .thenReturn(new DatasetsClient.GetValueResponse("0.3",123));

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
        assertEquals( ((NumberTypeValue) expected.getResult()).getValue().doubleValue(), ((NumberTypeValue) actual.getResult()).getValue().doubleValue(), 0.001);
        assertEquals(expected.getEvaluated().size(), actual.getEvaluated().size());
        expected.getEvaluated().forEach(
                (key, value) ->
                    assertEquals(Double.parseDouble(value), Double.parseDouble(actual.getEvaluated().get(key)), 0.001, key)
        );
    }

    @Test
    void evaluateLookupFunctionVersioned() throws ReferenceDatasetNotFoundException {

        // input...
        var expression = "lookup('myValue','mySource','myKeyColumn','myOutputColumn',version=22)";
        var expected = EvaluateResponse.builder().result(new BooleanTypeValue(true))
                .evaluated(Map.of(expression, "true"))
                .referenceDatasets(List.of(
                        Map.of(
                                "value", "myValue",
                                "name", "mySource",
                                "keyColumn",  "myKeyColumn",
                                "outputColumn", "myOutputColumn",
                                "group", GROUP_CONTEXT_ID,
                                "version", "22"
                        )
                ))
                .build();

        // set up mocks...
        when(executionVisitorProvider.get()).then(invocation-> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient));
        when(datasetsClient.getValue(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID, AUTHORIZER,"mySource", "myValue", "myOutputColumn", "myKeyColumn", Optional.empty(),Optional.of("22"), Optional.empty()))
                .thenReturn(new DatasetsClient.GetValueResponse("true",22));

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
        assertEquals(expected, actual);
    }

    @Test
    void evaluateLookupFunctionVersionedByTimestamp() throws ReferenceDatasetNotFoundException {

        // input...
        var expression = "lookup('myValue','mySource','myKeyColumn','myOutputColumn',versionAsAt='2022-1-1')";
        var expected = EvaluateResponse.builder().result(new BooleanTypeValue(true))
                .evaluated(Map.of(expression, "true"))
                .referenceDatasets(List.of(
                        Map.of(
                                "value", "myValue",
                                "name", "mySource",
                                "keyColumn",  "myKeyColumn",
                                "outputColumn", "myOutputColumn",
                                "group", GROUP_CONTEXT_ID,
                                "version", "22"
                        )
                ))
                .build();

        // set up mocks...
        when(executionVisitorProvider.get()).then(invocation-> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient));
        when(datasetsClient.getValue(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID, AUTHORIZER,"mySource", "myValue", "myOutputColumn", "myKeyColumn", Optional.empty(),Optional.empty(), Optional.of("2022-1-1")))
                .thenReturn(new DatasetsClient.GetValueResponse("true",22));

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
        assertEquals(expected, actual);
    }


    @Test
    void evaluateLookupFunctionWithExpressions() throws ReferenceDatasetNotFoundException {

        // input...
        var expression = "lookup(lookup('value1','source1','key1','column1'),lookup('value2','source2','key2','column2'),lookup('value3','source3','key3','column3'),lookup('value4','source4','key4','column4'))";
        var expected = EvaluateResponse.builder().result(new NumberTypeValue(42)).evaluated(Map.of(
                "lookup('value1','source1','key1','column1')", "A",
                "lookup('value2','source2','key2','column2')", "B",
                "lookup('value3','source3','key3','column3')", "C",
                "lookup('value4','source4','key4','column4')", "D",
                "lookup(lookup('value1','source1','key1','column1'),lookup('value2','source2','key2','column2'),lookup('value3','source3','key3','column3'),lookup('value4','source4','key4','column4'))", "42"
        )).build();

        // set up mocks...
        when(executionVisitorProvider.get()).then(invocation-> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient));
        when(datasetsClient.getValue(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID, AUTHORIZER,"source1", "value1", "column1", "key1", Optional.empty(), Optional.empty(), Optional.empty()))
                .thenReturn(new DatasetsClient.GetValueResponse("A",22));
        when(datasetsClient.getValue(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID,AUTHORIZER, "source2",  "value2", "column2", "key2", Optional.empty(), Optional.empty(), Optional.empty()))
                .thenReturn(new DatasetsClient.GetValueResponse("B",22));
        when(datasetsClient.getValue(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID,AUTHORIZER, "source3",  "value3", "column3", "key3", Optional.empty(), Optional.empty(), Optional.empty()))
                .thenReturn(new DatasetsClient.GetValueResponse("C",22));
        when(datasetsClient.getValue(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID, AUTHORIZER,"source4",  "value4", "column4", "key4", Optional.empty(), Optional.empty(), Optional.empty()))
                .thenReturn(new DatasetsClient.GetValueResponse("D",22));
        when(datasetsClient.getValue(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID,AUTHORIZER, "B",  "A","D","C", Optional.empty(), Optional.empty(), Optional.empty()))
                .thenReturn(new DatasetsClient.GetValueResponse("42",22));

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
        expected.getEvaluated().forEach((key, value) -> assertEquals(value, actual.getEvaluated().get(key), key));
    }
}
