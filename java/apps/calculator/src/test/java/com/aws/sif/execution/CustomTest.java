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
import com.aws.sif.resources.referenceDatasets.DatasetsClient;
import com.aws.sif.resources.referenceDatasets.ReferenceDatasetNotFoundException;
import org.joda.time.DateTime;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.*;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
public class CustomTest extends CalculatorBaseTest {
	private final Authorizer AUTHORIZER = new Authorizer(GROUP_CONTEXT_ID, GROUP_CONTEXT_ID, Set.of(GROUP_CONTEXT_ID));

	@Test
	void evaluateCustomFunction_single() throws CalculationNotFoundException {

		// input...
		var expression = "#custom_multiply(2,3)";
		var expected = EvaluateResponse.builder()
			.result(new NumberTypeValue(6))
			.evaluated(Map.of("#custom_multiply(2,3)", "6"))
			.calculations(List.of(
				Map.of(
					"function", "custom_multiply",
					"arg0", "2",
					"arg1", "3",
					"group", GROUP_CONTEXT_ID,
					"version", "1"
				)
			))
			.build();

		// set up mocks...
		when(executionVisitorProvider.get()).then(invocation -> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient, camlClient, gson));
		when(calculationsClient.getCalculation(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID, AUTHORIZER, "custom_multiply", Optional.empty(), Optional.empty(), Optional.empty()))
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
		assertEquals(expected, actual);
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
					"function", "custom_multiply",
					"arg0", "2",
					"arg1", "3",
					"group", GROUP_CONTEXT_ID,
					"version", "1"
				)
			))
			.build();

		// set up mocks...
		when(executionVisitorProvider.get()).then(invocation -> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient, camlClient, gson));
		when(calculationsClient.getCalculation(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID, AUTHORIZER, "custom_multiply", Optional.empty(), Optional.empty(), Optional.of("2022-1-1")))
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
		assertEquals(expected, actual);
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
					"function", "custom_multiply",
					"arg0", "2",
					"arg1", "3",
					"group", GROUP_CONTEXT_ID,
					"version", "1"
				), Map.of(
					"function", "custom_multiply",
					"arg0", "4",
					"arg1", "9",
					"group", GROUP_CONTEXT_ID,
					"version", "1"
				)
			))
			.build();

		// set up mocks..
		when(executionVisitorProvider.get()).then(invocation -> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient, camlClient, gson));

		when(calculationsClient.getCalculation(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID, AUTHORIZER, "custom_multiply", Optional.empty(), Optional.empty(), Optional.empty()))
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
		assertEquals(expected, actual);
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
					"function", "custom_multiply",
					"arg0", "2",
					"arg1", "3",
					"group", GROUP_CONTEXT_ID,
					"version", "1"
				), Map.of(
					"function", "custom_addition",
					"arg0", "4",
					"arg1", "9",
					"group", GROUP_CONTEXT_ID,
					"version", "1"
				)
			))
			.build();

		// set up mocks...
		when(executionVisitorProvider.get()).then(invocation -> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient, camlClient, gson));
		when(calculationsClient.getCalculation(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID, AUTHORIZER, "custom_multiply", Optional.empty(), Optional.empty(), Optional.empty()))
			.thenReturn(stubCustomMultiplyCalculation());

		when(calculationsClient.getCalculation(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID, AUTHORIZER, "custom_addition", Optional.empty(), Optional.empty(), Optional.empty()))
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
		assertEquals(expected, actual);
	}

	@Test
	void evaluateCustomFunction_nested() throws CalculationNotFoundException {

		// input...
		var expression = "#custom_nested(1,2,3,4)+#custom_addition(5,-6)";
		var expected = EvaluateResponse.builder().result(new NumberTypeValue(8)).evaluated(Map.of(
				"#custom_addition(5,-6)", "-1",
				"#custom_addition(3,4)", "7",
				"#custom_multiply(1,2)", "2",
				"#custom_nested(1,2,3,4)", "9"
			))
			.calculations(List.of(
				Map.of(
					"function", "custom_nested",
					"arg0", "1",
					"arg1", "2",
					"arg2", "3",
					"arg3", "4",
					"group", GROUP_CONTEXT_ID,
					"version", "1"
				), Map.of(
					"function", "custom_multiply",
					"arg0", "1",
					"arg1", "2",
					"group", GROUP_CONTEXT_ID,
					"version", "1"
				), Map.of(
					"function", "custom_addition",
					"arg0", "3",
					"arg1", "4",
					"group", GROUP_CONTEXT_ID,
					"version", "1"
				), Map.of(
					"function", "custom_addition",
					"arg0", "5",
					"arg1", "-6",
					"group", GROUP_CONTEXT_ID,
					"version", "1"
				)
			))
			.build();

		// set up mocks...
		when(executionVisitorProvider.get()).then(invocation -> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient, camlClient, gson));
		when(calculationsClient.getCalculation(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID, AUTHORIZER, "custom_multiply", Optional.empty(), Optional.empty(), Optional.empty()))
			.thenReturn(stubCustomMultiplyCalculation());

		when(calculationsClient.getCalculation(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID, AUTHORIZER, "custom_addition", Optional.empty(), Optional.empty(), Optional.empty()))
			.thenReturn(stubCustomAdditionCalculation());

		when(calculationsClient.getCalculation(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID, AUTHORIZER, "custom_nested", Optional.empty(), Optional.empty(), Optional.empty()))
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
		assertEquals(expected, actual);
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
					"function", "custom_multiply",
					"arg0", "2",
					"arg1", "3",
					"tenant", "tenantb",
					"group", "/shared",
					"version", "1"
				)
			))
			.build();

		// set up mocks...
		when(executionVisitorProvider.get()).then(invocation -> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient, camlClient, gson));
		when(calculationsClient.getCalculation(PIPELINE_ID, EXECUTION_ID, "/shared", AUTHORIZER, "custom_multiply", Optional.of("tenantb"), Optional.empty(), Optional.empty()))
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
		assertEquals(expected, actual);
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
					"function", "custom_multiply",
					"arg0", "2",
					"arg1", "3",
					"group", "/shared/l2/l3/l4",
					"version", "1"
				)
			))
			.build();

		// set up mocks...
		when(executionVisitorProvider.get()).then(invocation -> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient, camlClient, gson));
		when(calculationsClient.getCalculation(PIPELINE_ID, EXECUTION_ID, "/shared/l2/l3/l4", AUTHORIZER, "custom_multiply", Optional.empty(), Optional.empty(), Optional.empty()))
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
		assertEquals(expected, actual);
	}

	@Test
	void evaluateCustomFunction_multiline() throws CalculationNotFoundException, ReferenceDatasetNotFoundException {

		// input...
		var expression = "#volume_to_mmbtu('natural_gas', -100, 'mmbtu')";
		var expected = EvaluateResponse.builder().result(new NumberTypeValue(-30))
			.evaluated(Map.of(
				"set :fuel_type_uom = CONCAT('natural_gas', '_', 'mmbtu')", "natural_gas_mmbtu",
				"#volume_to_mmbtu('natural_gas', -100, 'mmbtu')", "-30",
				":mmbtu_per_uom", "0.3",
				":ref_name", "USEPA:FUEL_TYPE_HEATING_VALUE_MMBTU",
				"CONCAT('natural_gas', '_', 'mmbtu')", "natural_gas_mmbtu",
				"set :mmbtu_per_uom = LOOKUP(CONCAT('natural_gas', '_', 'mmbtu'), :ref_name, 'fuel_type_uom', 'value')", "0.3",
				"set :ref_name= 'USEPA:FUEL_TYPE_HEATING_VALUE_MMBTU'", "USEPA:FUEL_TYPE_HEATING_VALUE_MMBTU",
				"LOOKUP(CONCAT('natural_gas', '_', 'mmbtu'), :ref_name, 'fuel_type_uom', 'value')", "0.3"
			))
			.calculations(List.of(
				Map.of(
					"function", "volume_to_mmbtu",
					"arg0", "natural_gas",
					"arg1", "-100",
					"arg2", "mmbtu",
					"group", GROUP_CONTEXT_ID,
					"version", "1"
				)
			))
			.referenceDatasets(List.of(
				Map.of(
					"name","USEPA:FUEL_TYPE_HEATING_VALUE_MMBTU",
					"keyColumn","fuel_type_uom",
					"outputColumn","value",
					"value","natural_gas_mmbtu",
					"version","123",
					"group", "/test"
				)
			))
			.build();

		// set up mocks...
		when(executionVisitorProvider.get()).then(invocation -> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient, camlClient, gson));
		when(calculationsClient.getCalculation(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID, AUTHORIZER, "volume_to_mmbtu", Optional.empty(), Optional.empty(), Optional.empty()))
			.thenReturn(stubCustomMultiline());

		when(datasetsClient.getValue(PIPELINE_ID, EXECUTION_ID, GROUP_CONTEXT_ID, AUTHORIZER,"USEPA:FUEL_TYPE_HEATING_VALUE_MMBTU", "natural_gas_mmbtu", "value", "fuel_type_uom", Optional.empty(),Optional.empty(), Optional.empty()))
			.thenReturn(new DatasetsClient.GetValueResponse("0.3",123));

		// execute...
		var evaluateExpressionRequest = CalculatorImpl.EvaluateExpressionRequest.builder()
			.pipelineId(PIPELINE_ID)
			.executionId(EXECUTION_ID)
			.groupContextId(GROUP_CONTEXT_ID)
			.expression(expression)
			.authorizer(AUTHORIZER)
			.parameters(new HashMap<>())
			.build();
		var actual = underTest.evaluateExpression(evaluateExpressionRequest);

		// verify...
		assertEquals(expected, actual);
	}

	private Calculation stubCustomMultiplyCalculation() {
		// set up mocks...
		var parameters = new Calculation.Parameter[]{
			new Calculation.Parameter(0, "one", "ONE", "one description", "number"),
			new Calculation.Parameter(1, "two", "TWO", "two description", "number")
		};

		var outputs = new Calculation.Output[]{
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

	private Calculation stubCustomMultiline() {
		// set up mocks...
		var parameters = new Calculation.Parameter[]{
			new Calculation.Parameter(0, "std_fuel_type", "standard fuel type", "standard fuel type", "string"),
			new Calculation.Parameter(1, "qty", "qty", "fuel volume", "number"),
			new Calculation.Parameter(2, "uom", "uom", "fuel volume uom", "string")
		};

		var outputs = new Calculation.Output[]{
			new Calculation.Output("mmbtu", "mmbtu per uom", "number")
		};

		var groups = new String[]{GROUP_CONTEXT_ID};

		return new Calculation(
			"abc123",
			"volume_to_mmbtu",
			"summary",
			"description",
			" set :ref_name   = 'USEPA:FUEL_TYPE_HEATING_VALUE_MMBTU' \nset :fuel_type_uom = CONCAT(:std_fuel_type, '_', :uom)\n set :mmbtu_per_uom = LOOKUP(CONCAT(:std_fuel_type, '_', :uom), :ref_name, 'fuel_type_uom', 'value')\n:qty * :mmbtu_per_uom",
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
		var parameters = new Calculation.Parameter[]{
			new Calculation.Parameter(0, "one", "ONE", "one description", "number"),
			new Calculation.Parameter(1, "two", "TWO", "two description", "number")
		};

		var outputs = new Calculation.Output[]{
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
		var parameters = new Calculation.Parameter[]{
			new Calculation.Parameter(0, "one", "ONE", "one description", "number"),
			new Calculation.Parameter(1, "two", "TWO", "two description", "number"),
			new Calculation.Parameter(1, "three", "THREE", "three description", "number"),
			new Calculation.Parameter(1, "four", "FOUR", "four description", "number")
		};

		var outputs = new Calculation.Output[]{
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
