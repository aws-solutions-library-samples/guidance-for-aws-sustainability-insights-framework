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
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.Set;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
public class IfTest extends CalculatorBaseTest {

	private Authorizer AUTHORIZER = new Authorizer(GROUP_CONTEXT_ID, GROUP_CONTEXT_ID, Set.of(GROUP_CONTEXT_ID));


	private static Stream<Arguments> providerForSuccess() {
		return Stream.of(
				Arguments.of("if(2<1,5*5,1+2)", EvaluateResponse.builder().result(new NumberTypeValue(3)).build()),
				Arguments.of("if(2<=1,5*5,1+2)'", EvaluateResponse.builder().result(new NumberTypeValue(3)).build()),
				Arguments.of("if(2==1,5*5,1+2)'", EvaluateResponse.builder().result(new NumberTypeValue(3)).build()),
				Arguments.of("if(2>1,5*5,1+2)'", EvaluateResponse.builder().result(new NumberTypeValue(25)).build()),
				Arguments.of("if(2>=1,5*5,1+2)'", EvaluateResponse.builder().result(new NumberTypeValue(25)).build()),
				Arguments.of("if(2!=1,5*5,1+2)'", EvaluateResponse.builder().result(new NumberTypeValue(25)).build()),
				Arguments.of("if(true==true,true,false)'", EvaluateResponse.builder().result(new BooleanTypeValue(true)).build()),
				Arguments.of("if(null==null,true,false)'", EvaluateResponse.builder().result(new BooleanTypeValue(true)).build()),
				Arguments.of("if(1==null,true,false)'", EvaluateResponse.builder().result(new BooleanTypeValue(false)).build()),
				Arguments.of("if(null==1,true,false)'", EvaluateResponse.builder().result(new BooleanTypeValue(false)).build()),
				Arguments.of("if(null=='a',true,false)'", EvaluateResponse.builder().result(new BooleanTypeValue(false)).build()),
				Arguments.of("if('a'==null,true,false)'", EvaluateResponse.builder().result(new BooleanTypeValue(false)).build()),
				Arguments.of("if(true!=true,true,false)'", EvaluateResponse.builder().result(new BooleanTypeValue(false)).build()),
				Arguments.of("if('a'=='a','one','two')'", EvaluateResponse.builder().result(new StringTypeValue("one")).build()),
				Arguments.of("if('a'!='a','one','two')'", EvaluateResponse.builder().result(new StringTypeValue("two")).build())
		);
	}

	@ParameterizedTest
	@MethodSource("providerForSuccess")
	void success(String expression, EvaluateResponse expected) {

		// set up mocks...
		when(executionVisitorProvider.get()).then(invocation -> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient, camlClient, gson));

		var evaluateExpressionRequest = CalculatorImpl.EvaluateExpressionRequest.builder()
				.pipelineId(PIPELINE_ID)
				.executionId(EXECUTION_ID)
				.groupContextId(GROUP_CONTEXT_ID)
				.expression(expression)
				.build();
		var actual = underTest.evaluateExpression(evaluateExpressionRequest);
		assertEquals(expected, actual);
	}


	private static Stream<Arguments> providerForNullReferencedDatasetTests() {
		return Stream.of(
				Arguments.of("if(lookup('myValue','mySource','myKeyColumn','myOutputColumn') == null ,true,false)", EvaluateResponse.builder().result(new BooleanTypeValue(true)).build()),
				Arguments.of("if(lookup('myValue','mySource','myKeyColumn','myOutputColumn') == 'test' ,true,false)", EvaluateResponse.builder().result(new BooleanTypeValue(false)).build()),
				Arguments.of("if(null == lookup('myValue','mySource','myKeyColumn','myOutputColumn') ,true,false)", EvaluateResponse.builder().result(new BooleanTypeValue(true)).build()),
				Arguments.of("if('test' == lookup('myValue','mySource','myKeyColumn','myOutputColumn'),true,false)", EvaluateResponse.builder().result(new BooleanTypeValue(false)).build())
		);
	}

	@ParameterizedTest
	@MethodSource("providerForNullReferencedDatasetTests")
	void evaluateNullReferenceDatasets(String expression, EvaluateResponse expected) throws ReferenceDatasetNotFoundException {
		when(executionVisitorProvider.get()).then(invocation -> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient, camlClient, gson));

		when(datasetsClient.getValue(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID, AUTHORIZER, "mySource", "myValue", "myOutputColumn", "myKeyColumn", Optional.empty(), Optional.empty(), Optional.empty())).thenReturn(new DatasetsClient.GetValueResponse(null, 1));

		var evaluateExpressionRequest = CalculatorImpl.EvaluateExpressionRequest.builder()
				.pipelineId(PIPELINE_ID)
				.executionId(EXECUTION_ID)
				.groupContextId(GROUP_CONTEXT_ID)
				.expression(expression)
				.authorizer(AUTHORIZER)
				.build();
		var actual = underTest.evaluateExpression(evaluateExpressionRequest);
		assertEquals(expected.getResult(), actual.getResult());
	}


	private static Stream<Arguments> providerForValidReferencedDatasetTests() {
		return Stream.of(
				Arguments.of("if(lookup('myValue','mySource','myKeyColumn','myOutputColumn') == null ,true,false)", EvaluateResponse.builder().result(new BooleanTypeValue(false)).build()),
				Arguments.of("if(lookup('myValue','mySource','myKeyColumn','myOutputColumn') == 'test' ,true,false)", EvaluateResponse.builder().result(new BooleanTypeValue(true)).build()),
				Arguments.of("if(null == lookup('myValue','mySource','myKeyColumn','myOutputColumn') ,true,false)", EvaluateResponse.builder().result(new BooleanTypeValue(false)).build()),
				Arguments.of("if('test' == lookup('myValue','mySource','myKeyColumn','myOutputColumn'),true,false)", EvaluateResponse.builder().result(new BooleanTypeValue(true)).build())
		);
	}

	@ParameterizedTest
	@MethodSource("providerForValidReferencedDatasetTests")
	void evaluateValidReferenceDatasets(String expression, EvaluateResponse expected) throws ReferenceDatasetNotFoundException {
		when(executionVisitorProvider.get()).then(invocation -> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient, camlClient, gson));

		when(datasetsClient.getValue(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID, AUTHORIZER, "mySource", "myValue", "myOutputColumn", "myKeyColumn", Optional.empty(), Optional.empty(), Optional.empty())).thenReturn(new DatasetsClient.GetValueResponse("test", 1));

		var evaluateExpressionRequest = CalculatorImpl.EvaluateExpressionRequest.builder()
				.pipelineId(PIPELINE_ID)
				.executionId(EXECUTION_ID)
				.groupContextId(GROUP_CONTEXT_ID)
				.expression(expression)
				.authorizer(AUTHORIZER)
				.build();
		var actual = underTest.evaluateExpression(evaluateExpressionRequest);
		assertEquals(expected.getResult(), actual.getResult());
	}

	private static Stream<Arguments> providerForInvalidJsonFailure() {
		return Stream.of(
				Arguments.of("if(1>null,true,false)", "Logical expression '1>null' cannot be compared only equal operation can be compared with null value."),
				Arguments.of("if(null<1,true,false)", "Logical expression 'null<1' cannot be compared only equal operation can be compared with null value."),
				Arguments.of("if(null<'test',true,false)", "Logical expression 'null<'test'' cannot be compared only equal operation can be compared with null value."),
				Arguments.of("if('test'>1,true,false)", "Logical expression ''test'>1' cannot be compared as each side if the expression has different types.")
		);
	}

	@ParameterizedTest
	@MethodSource("providerForInvalidJsonFailure")
	void invalidComparisonValue(String expression, String expected) {
		when(executionVisitorProvider.get()).then(invocation -> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient, camlClient, gson));

		Exception exception = assertThrows(ArithmeticException.class, () -> {
			var evaluateExpressionRequest = CalculatorImpl.EvaluateExpressionRequest.builder().pipelineId(PIPELINE_ID).executionId(EXECUTION_ID).groupContextId(GROUP_CONTEXT_ID).expression(expression).build();
			underTest.evaluateExpression(evaluateExpressionRequest);
		});
		assertEquals(expected, exception.getMessage());
	}
}
