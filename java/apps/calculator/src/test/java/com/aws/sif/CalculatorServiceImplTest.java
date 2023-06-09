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

package com.aws.sif;

import com.aws.sif.audits.Auditor;
import com.aws.sif.execution.*;
import com.aws.sif.execution.output.ActivityOutputWriter;
import com.aws.sif.resources.users.User;
import com.aws.sif.resources.users.UserNotFoundException;
import com.aws.sif.resources.users.UsersClient;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.reflect.TypeToken;
import com.typesafe.config.Config;
import org.antlr.v4.runtime.misc.ParseCancellationException;
import org.joda.time.DateTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uk.org.webcompere.systemstubs.environment.EnvironmentVariables;
import uk.org.webcompere.systemstubs.jupiter.SystemStub;
import uk.org.webcompere.systemstubs.jupiter.SystemStubsExtension;

import java.io.IOException;
import java.lang.reflect.Type;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@ExtendWith(SystemStubsExtension.class)
class CalculatorServiceImplTest {

	@Captor
	ArgumentCaptor<CalculatorImpl.EvaluateExpressionRequest> evaluateExpressionRequestCaptor;
	Type MapStringStringType = new TypeToken<Map<String, String>>() {
	}.getType();
	@SystemStub
	private EnvironmentVariables environmentVariables;
	@Mock
	private Calculator calculator;
	@Mock
	private S3Utils s3Utils;
	@Mock
	private Auditor auditor;
	@Mock
	private Config config;
	@Mock
	private ActivityOutputWriter activityOutputWriter;
	@Mock
	private UsersClient usersClient;
	private CalculatorService underTest;
	private final String GROUP_CONTEXT_ID = "/test";
	private final Authorizer AUTHORIZER = new Authorizer("someone@somewhere.com", GROUP_CONTEXT_ID, Set.of(GROUP_CONTEXT_ID));
	private final Gson testGson = new GsonBuilder().create();

	@BeforeEach
	public void initEach() {
		environmentVariables
			.set("AWS_REGION", "us-west-2")
			.set("TENANT_ID", "abc123")
			.set("ENVIRONMENT", "dev");

		underTest = new CalculatorServiceImpl(calculator, s3Utils, auditor, config, activityOutputWriter, usersClient, new Gson());

		when(config.getString("calculator.upload.s3.bucket")).thenReturn("myBucket");
	}

	@Test
	public void invalidRequestDefinition() throws InterruptedException, IOException {
		// request...
		var request = TransformRequest.builder()
			.sourceData(List.of(
				"{\"one\":1,\"two\":x}"))
			.parameters(List.of(
				new TransformParameter("one", "number"),
				new TransformParameter("two", "number")))
			.transforms(List.of(
				new Transform(0, ":one+:two*:three",
					List.of(new TransformOutput(0, "sum", "number", false, null,
						null)))))
			.build();

		// test
		var actual = (InlineTransformResponse) underTest.process(request);

		// verify
		assertEquals(5, actual.getErrors().size());
		assertEquals("No groupContextId provided.", actual.getErrors().get(0));
		assertEquals("No pipelineId provided.", actual.getErrors().get(1));
		assertEquals("No executionId provided.", actual.getErrors().get(2));
		assertEquals("First output of first transform must be configured as the timestamp.",
			actual.getErrors().get(3));
		assertEquals("No `username` provided.",
			actual.getErrors().get(4));
	}

	@Test
	public void happyPath() throws UserNotFoundException, InterruptedException, IOException {
		// request...
		var pipelineId = "pipe1";
		var executionId = "run1";
		var request = TransformRequest.builder()
			.pipelineId(pipelineId)
			.executionId(executionId)
			.chunkNo(1)
			.groupContextId(GROUP_CONTEXT_ID)
			.parameters(List.of(
				new TransformParameter("time", "string"),
				new TransformParameter("one", "number"),
				new TransformParameter("two", "string"),
				new TransformParameter("three", "boolean")))
			.sourceData(List.of(
				"{\"time\":\"2022-12-06 12:07\",\"one\":1,\"two\":\"one\",\"three\":true}",
				"{\"time\":\"2022-12-06 12:08\",\"one\":2,\"two\":\"two\",\"three\":false}",
				"{\"time\":\"2022-12-06 12:09\",\"one\":null,\"two\":null,\"three\":null}"
			))
			.transforms(List.of(
				new Transform(0, ":time",
					List.of(new TransformOutput(0, "time", "timestamp", false, null,
						null))),
				new Transform(1, "set :a = :one*:one\nset :b=10\n:a*:b",
					List.of(new TransformOutput(0, "squared", "number", false, null,
						null))),
				new Transform(2, ":two",
					List.of(new TransformOutput(0, "word", "string", false, null,
						null))),
				new Transform(3, "IF(:three,REF('squared'),REF('word'))",
					List.of(new TransformOutput(0, "copy", "string", false, null,
						null)))))
			.username("someone@somewhere.com")
			.build();

		// mocks
		mockGetUser("someone@somewhere.com", GROUP_CONTEXT_ID);

		var output0Formula = request.getTransforms().get(0).getFormula();
		var output1Formula = request.getTransforms().get(1).getFormula();
		var output2Formula = request.getTransforms().get(2).getFormula();
		var output3Formula = request.getTransforms().get(3).getFormula();

		var row1Params = new LinkedHashMap<String, DynamicTypeValue>();
		row1Params.put("___row_identifier___", new StringTypeValue("2022-12-06 12:07-1-one-true"));
		row1Params.put("time", new StringTypeValue("2022-12-06 12:07"));
		row1Params.put("one", new NumberTypeValue(1));
		row1Params.put("two", new StringTypeValue("one"));
		row1Params.put("three", new BooleanTypeValue(true));

		var row1EvaluateExpressionRequestBuilder = CalculatorImpl.EvaluateExpressionRequest.builder()
			.pipelineId(pipelineId)
			.executionId(executionId)
			.groupContextId(GROUP_CONTEXT_ID)
			.authorizer(AUTHORIZER)
			.parameters(row1Params);
		var row1Step0Context = new LinkedHashMap<String, DynamicTypeValue>();
		var evaluateExpressionRequest0 = row1EvaluateExpressionRequestBuilder
			.expression(output0Formula)
			.context(row1Step0Context)
			.build();
		var row1Step0Result = new NumberTypeValue(1670353620000L);
		when(calculator.evaluateExpression(evaluateExpressionRequest0))
			.thenReturn(EvaluateResponse.builder().result(row1Step0Result).evaluated(Map.of(
				":time", "1670353620000")).build());

		var row1Step1Context = new LinkedHashMap<String, DynamicTypeValue>();
		row1Step1Context.put("time", row1Step0Result);
		var evaluateExpressionRequest1 = row1EvaluateExpressionRequestBuilder
			.expression(output1Formula)
			.context(row1Step1Context)
			.build();
		var row1Step1Result = new NumberTypeValue(10);
		when(calculator.evaluateExpression(evaluateExpressionRequest1))
			.thenReturn(EvaluateResponse.builder().result(row1Step1Result).evaluated(Map.of(
				":one", "1",
				"set :a = :one*:one", "1",
				"set :b=10", "10",
				":a", "1",
				":b", "10",
				":a*:b", "10")).build());

		var row1Step2Context = new LinkedHashMap<String, DynamicTypeValue>();
		row1Step2Context.put("time", row1Step0Result);
		row1Step2Context.put("squared", row1Step1Result);
		var evaluateExpressionRequest2 = row1EvaluateExpressionRequestBuilder
			.expression(output2Formula)
			.context(row1Step2Context)
			.build();
		var row1Step2Result = new StringTypeValue("one");
		when(calculator.evaluateExpression(evaluateExpressionRequest2))
			.thenReturn(EvaluateResponse.builder().result(row1Step2Result).evaluated(Map.of(
				":two", "one")).build());

		var row1Step3Context = new LinkedHashMap<String, DynamicTypeValue>();
		row1Step3Context.put("time", row1Step0Result);
		row1Step3Context.put("squared", row1Step1Result);
		row1Step3Context.put("word", row1Step2Result);
		var evaluateExpressionRequest3 = row1EvaluateExpressionRequestBuilder
			.expression(output3Formula)
			.context(row1Step3Context)
			.build();
		var row1Step3Result = new NumberTypeValue(1);
		when(calculator.evaluateExpression(evaluateExpressionRequest3))
			.thenReturn(EvaluateResponse.builder().result(row1Step3Result).evaluated(Map.of(
				":three", "true",
				"REF('squared')", "1")).build());

		var row2Params = new LinkedHashMap<String, DynamicTypeValue>();
		row2Params.put("___row_identifier___", new StringTypeValue("2022-12-06 12:08-2-two-false"));
		row2Params.put("time", new StringTypeValue("2022-12-06 12:08"));
		row2Params.put("one", new NumberTypeValue(2));
		row2Params.put("two", new StringTypeValue("two"));
		row2Params.put("three", new BooleanTypeValue(false));

		var row2EvaluateExpressionRequestBuilder = CalculatorImpl.EvaluateExpressionRequest.builder()
			.pipelineId(pipelineId)
			.executionId(executionId)
			.groupContextId(GROUP_CONTEXT_ID)
			.parameters(row2Params);
		var row2Step0Context = new LinkedHashMap<String, DynamicTypeValue>();
		var evaluateExpressionRequest4 = row2EvaluateExpressionRequestBuilder
			.expression(output0Formula)
			.context(row2Step0Context)
			.authorizer(AUTHORIZER)
			.build();
		var row2Step0Result = new NumberTypeValue(1670353680000L);
		when(calculator.evaluateExpression(evaluateExpressionRequest4))
			.thenReturn(EvaluateResponse.builder().result(row2Step0Result).evaluated(Map.of(
				":time", "1670353680000L")).build());

		var row2Step1Context = new LinkedHashMap<String, DynamicTypeValue>();
		row2Step1Context.put("time", row2Step0Result);
		var evaluateExpressionRequest5 = row2EvaluateExpressionRequestBuilder
			.expression(output1Formula)
			.context(row2Step1Context)
			.build();
		var row2Step1Result = new NumberTypeValue(40);
		when(calculator.evaluateExpression(evaluateExpressionRequest5))
			.thenReturn(EvaluateResponse.builder().result(row2Step1Result).evaluated(Map.of(
				":one", "2",
				"set :a = :one*:one", "4",
				"set :b=10", "10",
				":a", "4",
				":b", "10",
				":a*:b", "40")).build());

		var row2Step2Context = new LinkedHashMap<String, DynamicTypeValue>();
		row2Step2Context.put("time", row2Step0Result);
		row2Step2Context.put("squared", row2Step1Result);
		var evaluateExpressionRequest6 = row2EvaluateExpressionRequestBuilder
			.expression(output2Formula)
			.context(row2Step2Context)
			.build();
		var row2Step2Result = new StringTypeValue("two");
		when(calculator.evaluateExpression(evaluateExpressionRequest6))
			.thenReturn(EvaluateResponse.builder().result(row2Step2Result).evaluated(Map.of(
				":two", "two")).build());

		var row2Step3Context = new LinkedHashMap<String, DynamicTypeValue>();
		row2Step3Context.put("time", row2Step0Result);
		row2Step3Context.put("squared", row2Step1Result);
		row2Step3Context.put("word", row2Step2Result);
		var evaluateExpressionRequest7 = row2EvaluateExpressionRequestBuilder
			.expression(output3Formula)
			.context(row2Step3Context)
			.build();
		var row2Step3Result = new StringTypeValue("two");
		when(calculator.evaluateExpression(evaluateExpressionRequest7))
			.thenReturn(EvaluateResponse.builder().result(row2Step3Result).evaluated(Map.of(
				":three", "false",
				"REF('word')", "two")).build());


		var row3Params = new LinkedHashMap<String, DynamicTypeValue>();
		row3Params.put("___row_identifier___", new StringTypeValue("2022-12-06 12:09-null-null-null"));
		row3Params.put("time", new StringTypeValue("2022-12-06 12:09"));
		row3Params.put("one", new NullValue());
		row3Params.put("two", new NullValue());
		row3Params.put("three", new NullValue());

		var row3EvaluateExpressionRequestBuilder = CalculatorImpl.EvaluateExpressionRequest.builder()
			.pipelineId(pipelineId)
			.executionId(executionId)
			.groupContextId(GROUP_CONTEXT_ID)
			.parameters(row3Params);
		var row3Step0Context = new LinkedHashMap<String, DynamicTypeValue>();
		var evaluateExpressionRequest8 = row3EvaluateExpressionRequestBuilder
			.expression(output0Formula)
			.context(row3Step0Context)
			.authorizer(AUTHORIZER)
			.build();
		var row3Step0Result = new NumberTypeValue(1670288940000L);
		when(calculator.evaluateExpression(evaluateExpressionRequest8))
			.thenReturn(EvaluateResponse.builder().result(row3Step0Result).evaluated(Map.of(
				":time", "1670288940000L")).build());

		var row3Step1Context = new LinkedHashMap<String, DynamicTypeValue>();
		row3Step1Context.put("time", row3Step0Result);
		var evaluateExpressionRequest9 = row3EvaluateExpressionRequestBuilder
			.expression(output1Formula)
			.context(row3Step1Context)
			.build();
		var row3Step1Result = new NullValue();
		when(calculator.evaluateExpression(evaluateExpressionRequest9))
			.thenReturn(EvaluateResponse.builder().result(row3Step1Result).evaluated(Map.of(
				":one", "",
				"set :a = :one*:one", "",
				"set :b=10", "10",
				":a", "",
				":b", "10",
				":a*:b", "")).build());

		var row3Step2Context = new LinkedHashMap<String, DynamicTypeValue>();
		row3Step2Context.put("time", row3Step0Result);
		row3Step2Context.put("squared", row3Step1Result);
		var evaluateExpressionRequest10 = row3EvaluateExpressionRequestBuilder
			.expression(output2Formula)
			.context(row3Step2Context)
			.build();
		var row3Step2Result = new NullValue();
		when(calculator.evaluateExpression(evaluateExpressionRequest10))
			.thenReturn(EvaluateResponse.builder().result(row3Step2Result).evaluated(Map.of(
				"two", new NullValue().toString())).build());

		var row3Step3Context = new LinkedHashMap<String, DynamicTypeValue>();
		row3Step3Context.put("time", row3Step0Result);
		row3Step3Context.put("squared", row3Step1Result);
		row3Step3Context.put("word", row3Step2Result);
		var evaluateExpressionRequest11 = row3EvaluateExpressionRequestBuilder
			.expression(output3Formula)
			.context(row3Step3Context)
			.build();
		var row3Step3Result = new NullValue();
		when(calculator.evaluateExpression(evaluateExpressionRequest11))
			.thenReturn(EvaluateResponse.builder().result(row3Step3Result).evaluated(Map.of(
				"three", new NullValue().toString(),
				"REF('word')", new NullValue().toString())).build());

		// test
		var actual = (InlineTransformResponse) underTest.process(request);

		// verify
		assertEquals(0, actual.getErrors().size());
		assertEquals(3, actual.getData().size());
		var row1 = actual.getData().get(0);
		Map<String, String> row1Json = testGson.fromJson(row1, MapStringStringType);
		assertEquals(row1Step0Result.asString(), row1Json.get("time"));
		assertEquals(row1Step1Result.asString(), row1Json.get("squared"));
		assertEquals(row1Step2Result.asString(), row1Json.get("word"));
		assertEquals(row1Step3Result.asString(), row1Json.get("copy"));
		var row2 = actual.getData().get(1);
		Map<String, String> row2Json = testGson.fromJson(row2, MapStringStringType);
		assertEquals(row2Step0Result.asString(), row2Json.get("time"));
		assertEquals(row2Step1Result.asString(), row2Json.get("squared"));
		assertEquals(row2Step2Result.asString(), row2Json.get("word"));
		assertEquals(row2Step3Result.asString(), row2Json.get("copy"));
		var row3 = actual.getData().get(2);
		System.out.println("### row3: " + row3);
		Map<String, String> row3Json = testGson.fromJson(row3, MapStringStringType);
		assertEquals(row3Step0Result.asString(), row3Json.get("time"));
	}

	private void mockGetUser(String username, String groupContextId) throws UserNotFoundException {
		var user = new User(username, "active", Map.of(GROUP_CONTEXT_ID, "reader"), null, GROUP_CONTEXT_ID,
			"someoneelse@somewhere.com", DateTime.now(), null, null);
		when(usersClient.getUser(eq(username), eq(GROUP_CONTEXT_ID), any(Authorizer.class)))
			.thenReturn(user);
	}

	@Test
	public void formulaError() throws UserNotFoundException, InterruptedException, IOException {
		// request...
		var pipelineId = "pipe1";
		var executionId = "run1";
		var request = TransformRequest.builder()
			.pipelineId(pipelineId)
			.executionId(executionId)
			.chunkNo(1)
			.groupContextId(GROUP_CONTEXT_ID)
			.parameters(List.of(
				new TransformParameter("time", "string"),
				new TransformParameter("one", "number"),
				new TransformParameter("two", "string"),
				new TransformParameter("three", "boolean")))
			.sourceData(List.of(
				"{\"time\":\"2022-12-06 12:07\",\"one\":1,\"two\":\"one\",\"three\":true}",
				"{\"time\":\"2022-12-06 12:08\",\"one\":2,\"two\":\"two\",\"three\":false}"))
			.transforms(List.of(
				new Transform(0, ":time",
					List.of(new TransformOutput(0, "time", "timestamp", false, null,
						null))),
				new Transform(1, ":one*:one",
					List.of(new TransformOutput(0, "squared", "number", false, null,
						null))),
				new Transform(2, ":two",
					List.of(new TransformOutput(0, "word", "string", false, null,
						null))),
				// this formula contains an error (missing last parenthesis):
				new Transform(3, "IF(:three,REF('squared'),REF('word')",
					List.of(new TransformOutput(0, "copy", "string", false, null,
						null)))))
			.username("someone@somewhere.com")
			.build();

		// mocks
		mockGetUser("someone@somewhere.com", GROUP_CONTEXT_ID);

		var output0Formula = request.getTransforms().get(0).getFormula();
		var output1Formula = request.getTransforms().get(1).getFormula();
		var output2Formula = request.getTransforms().get(2).getFormula();
		var output3Formula = request.getTransforms().get(3).getFormula();

		var row1Params = new LinkedHashMap<String, DynamicTypeValue>();
		row1Params.put("___row_identifier___", new StringTypeValue("2022-12-06 12:07-1-one-true"));
		row1Params.put("time", new StringTypeValue("2022-12-06 12:07"));
		row1Params.put("one", new NumberTypeValue(1));
		row1Params.put("two", new StringTypeValue("one"));
		row1Params.put("three", new BooleanTypeValue(true));

		var row1EvaluateExpressionRequestBuilder = CalculatorImpl.EvaluateExpressionRequest.builder()
			.pipelineId(pipelineId)
			.executionId(executionId)
			.groupContextId(GROUP_CONTEXT_ID)
			.authorizer(AUTHORIZER)
			.parameters(row1Params);
		var row1Step0Context = new LinkedHashMap<String, DynamicTypeValue>();
		var evaluateExpressionRequest0 = row1EvaluateExpressionRequestBuilder
			.expression(output0Formula)
			.context(row1Step0Context)
			.build();
		var row1Step0Result = new NumberTypeValue(1670353620000L);
		when(calculator.evaluateExpression(evaluateExpressionRequest0))
			.thenReturn(EvaluateResponse.builder().result(row1Step0Result).evaluated(Map.of(
				":time", "1670353620000")).build());

		var row1Step1Context = new LinkedHashMap<String, DynamicTypeValue>();
		row1Step1Context.put("time", row1Step0Result);
		var evaluateExpressionRequest1 = row1EvaluateExpressionRequestBuilder
			.expression(output1Formula)
			.context(row1Step1Context)
			.build();
		var row1Step1Result = new NumberTypeValue(1);
		when(calculator.evaluateExpression(evaluateExpressionRequest1))
			.thenReturn(EvaluateResponse.builder().result(row1Step1Result).evaluated(Map.of(
				":one", "1")).build());

		var row1Step2Context = new LinkedHashMap<String, DynamicTypeValue>();
		row1Step2Context.put("time", row1Step0Result);
		row1Step2Context.put("squared", row1Step1Result);
		var evaluateExpressionRequest2 = row1EvaluateExpressionRequestBuilder
			.expression(output2Formula)
			.context(row1Step2Context)
			.build();
		var row1Step2Result = new StringTypeValue("one");
		when(calculator.evaluateExpression(evaluateExpressionRequest2))
			.thenReturn(EvaluateResponse.builder().result(row1Step2Result).evaluated(Map.of(
				":two", "one")).build());

		var row1Step3Context = new LinkedHashMap<String, DynamicTypeValue>();
		row1Step3Context.put("time", row1Step0Result);
		row1Step3Context.put("squared", row1Step1Result);
		row1Step3Context.put("word", row1Step2Result);
		var evaluateExpressionRequest3 = row1EvaluateExpressionRequestBuilder
			.expression(output3Formula)
			.context(row1Step3Context)
			.build();
		when(calculator.evaluateExpression(evaluateExpressionRequest3))
			.thenThrow(new ParseCancellationException("Hit a mocked error!"));

		var row2Params = new LinkedHashMap<String, DynamicTypeValue>();
		row2Params.put("___row_identifier___", new StringTypeValue("2022-12-06 12:08-2-two-false"));
		row2Params.put("time", new StringTypeValue("2022-12-06 12:08"));
		row2Params.put("one", new NumberTypeValue(2));
		row2Params.put("two", new StringTypeValue("two"));
		row2Params.put("three", new BooleanTypeValue(false));

		var row2EvaluateExpressionRequestBuilder = CalculatorImpl.EvaluateExpressionRequest.builder()
			.pipelineId(pipelineId)
			.executionId(executionId)
			.groupContextId(GROUP_CONTEXT_ID)
			.authorizer(AUTHORIZER)
			.parameters(row2Params);
		var row2Step0Context = new LinkedHashMap<String, DynamicTypeValue>();
		var evaluateExpressionRequest4 = row2EvaluateExpressionRequestBuilder
			.expression(output0Formula)
			.context(row2Step0Context)
			.build();
		var row2Step0Result = new NumberTypeValue(1670353680000L);
		when(calculator.evaluateExpression(evaluateExpressionRequest4))
			.thenReturn(EvaluateResponse.builder().result(row2Step0Result).evaluated(Map.of(
				":time", "1670353680000L")).build());

		var row2Step1Context = new LinkedHashMap<String, DynamicTypeValue>();
		row2Step1Context.put("time", row2Step0Result);
		var evaluateExpressionRequest5 = row2EvaluateExpressionRequestBuilder
			.expression(output1Formula)
			.context(row2Step1Context)
			.build();
		var row2Step1Result = new NumberTypeValue(2);
		when(calculator.evaluateExpression(evaluateExpressionRequest5))
			.thenReturn(EvaluateResponse.builder().result(row2Step1Result).evaluated(Map.of(
				":one", "2")).build());

		var row2Step2Context = new LinkedHashMap<String, DynamicTypeValue>();
		row2Step2Context.put("time", row2Step0Result);
		row2Step2Context.put("squared", row2Step1Result);
		var evaluateExpressionRequest6 = row2EvaluateExpressionRequestBuilder
			.expression(output2Formula)
			.context(row2Step2Context)
			.build();
		var row2Step2Result = new StringTypeValue("two");
		when(calculator.evaluateExpression(evaluateExpressionRequest6))
			.thenReturn(EvaluateResponse.builder().result(row2Step2Result).evaluated(Map.of(
				":two", "two")).build());

		var row2Step3Context = new LinkedHashMap<String, DynamicTypeValue>();
		row2Step3Context.put("time", row2Step0Result);
		row2Step3Context.put("squared", row2Step1Result);
		row2Step3Context.put("word", row2Step2Result);
		var evaluateExpressionRequest7 = row2EvaluateExpressionRequestBuilder
			.expression(output3Formula)
			.context(row2Step3Context)
			.build();
		when(calculator.evaluateExpression(evaluateExpressionRequest7))
			.thenThrow(new ParseCancellationException("Hit a mocked error!"));

		// test
		var actual = (InlineTransformResponse) underTest.process(request);

		// verify
		assertEquals(2, actual.getErrors().size());
		assertEquals(actual.getErrors().get(0),
			"Row '2022-12-06 12:07-1-one-true' column 'copy' encountered error evaluating formula `IF(:three,REF('squared'),REF('word')` - Hit a mocked error!");
		assertEquals(actual.getErrors().get(1),
			"Row '2022-12-06 12:08-2-two-false' column 'copy' encountered error evaluating formula `IF(:three,REF('squared'),REF('word')` - Hit a mocked error!");

		assertEquals(2, actual.getData().size());
		var row1 = actual.getData().get(0);
		Map<String, String> row1Json = testGson.fromJson(row1, MapStringStringType);
		assertEquals(row1Step0Result.asString(), row1Json.get("time"));
		assertEquals(row1Step1Result.asString(), row1Json.get("squared"));
		assertEquals(row1Step2Result.asString(), row1Json.get("word"));
		assertEquals("___ERROR___", row1Json.get("copy")); // this encountered and error so was unable to write value
		var row2 = actual.getData().get(1);
		Map<String, String> row2Json = testGson.fromJson(row2, MapStringStringType);
		assertEquals(row2Step0Result.asString(), row2Json.get("time"));
		assertEquals(row2Step1Result.asString(), row2Json.get("squared"));
		assertEquals(row2Step2Result.asString(), row2Json.get("word"));
		assertEquals("___ERROR___", row2Json.get("copy")); // this encountered and error so was unable to write value
	}

	@Test
	public void missingDataError() throws UserNotFoundException, InterruptedException, IOException {
		// request...
		var pipelineId = "pipe1";
		var executionId = "run1";
		var request = TransformRequest.builder()
			.pipelineId(pipelineId)
			.executionId(executionId)
			.chunkNo(1)
			.groupContextId(GROUP_CONTEXT_ID)
			.parameters(List.of(
				new TransformParameter("time", "string"),
				new TransformParameter("one", "number"),
				new TransformParameter("two", "string"),
				new TransformParameter("three", "boolean")))
			.sourceData(List.of(
				"{\"time\":\"2022-12-06 12:07\",\"one\":1,\"two\":\"one\",\"three\":true}",
				"{\"time\":\"2022-12-06 12:08\"}",    // <-- should error, missing data for parameters one, two, and three
				"{\"time\":\"2022-12-06 12:09\",\"one\":2,\"two\":\"two\",\"three\":false}"))
			.transforms(List.of(
				new Transform(0, ":time",
					List.of(new TransformOutput(0, "time", "timestamp", false, null,
						null))),
				new Transform(1, ":one*10",
					List.of(new TransformOutput(0, "times10", "number", false, null,
						null))),
				new Transform(2, ":two",
					List.of(new TransformOutput(0, "twoVal", "string", false, null,
						null))),
				new Transform(3, ":three",
					List.of(new TransformOutput(0, "threeVal", "string", false, null,
						null)))))
			.username("someone@somewhere.com")
			.build();

		// mocks
		mockGetUser("someone@somewhere.com", GROUP_CONTEXT_ID);

		var output0Formula = request.getTransforms().get(0).getFormula();
		var output1Formula = request.getTransforms().get(1).getFormula();
		var output2Formula = request.getTransforms().get(2).getFormula();
		var output3Formula = request.getTransforms().get(3).getFormula();

		// row 1
		var row1Params = new LinkedHashMap<String, DynamicTypeValue>();
		row1Params.put("___row_identifier___", new StringTypeValue("2022-12-06 12:07-1-one-true"));
		row1Params.put("time", new StringTypeValue("2022-12-06 12:07"));
		row1Params.put("one", new NumberTypeValue(1));
		row1Params.put("two", new StringTypeValue("one"));
		row1Params.put("three", new BooleanTypeValue(true));

		var row1EvaluateExpressionRequestBuilder = CalculatorImpl.EvaluateExpressionRequest.builder()
			.pipelineId(pipelineId)
			.executionId(executionId)
			.groupContextId(GROUP_CONTEXT_ID)
			.authorizer(AUTHORIZER)
			.parameters(row1Params);
		var row1Step0Context = new LinkedHashMap<String, DynamicTypeValue>();
		var evaluateExpressionRequest0 = row1EvaluateExpressionRequestBuilder
			.expression(output0Formula)
			.context(row1Step0Context)
			.build();
		var row1Step0Result = new NumberTypeValue(1670353620000L);
		when(calculator.evaluateExpression(evaluateExpressionRequest0))
			.thenReturn(EvaluateResponse.builder().result(row1Step0Result).evaluated(Map.of(
				":time", "1670353620000")).build());

		var row1Step1Context = new LinkedHashMap<String, DynamicTypeValue>();
		row1Step1Context.put("time", row1Step0Result);
		var evaluateExpressionRequest1 = row1EvaluateExpressionRequestBuilder
			.expression(output1Formula)
			.context(row1Step1Context)
			.build();
		var row1Step1Result = new NumberTypeValue(10);
		when(calculator.evaluateExpression(evaluateExpressionRequest1))
			.thenReturn(EvaluateResponse.builder().result(row1Step1Result).evaluated(Map.of(
				":one", "1",
				":one*10", "10")).build());

		var row1Step2Context = new LinkedHashMap<String, DynamicTypeValue>();
		row1Step2Context.put("time", row1Step0Result);
		row1Step2Context.put("times10", row1Step1Result);
		var evaluateExpressionRequest2 = row1EvaluateExpressionRequestBuilder
			.expression(output2Formula)
			.context(row1Step2Context)
			.build();
		var row1Step2Result = new StringTypeValue("one");
		when(calculator.evaluateExpression(evaluateExpressionRequest2))
			.thenReturn(EvaluateResponse.builder().result(row1Step2Result).evaluated(Map.of(
				":two", "one")).build());

		var row1Step3Context = new LinkedHashMap<String, DynamicTypeValue>();
		row1Step3Context.put("time", row1Step0Result);
		row1Step3Context.put("times10", row1Step1Result);
		row1Step3Context.put("twoVal", row1Step2Result);
		var evaluateExpressionRequest3 = row1EvaluateExpressionRequestBuilder
			.expression(output3Formula)
			.context(row1Step3Context)
			.build();
		var row1Step3Result = new BooleanTypeValue(true);
		when(calculator.evaluateExpression(evaluateExpressionRequest3))
			.thenReturn(EvaluateResponse.builder().result(row1Step3Result).evaluated(Map.of(
				":three", "true")).build());

		// row 2 throws an error before evaluation

		// row 3
		var row3Params = new LinkedHashMap<String, DynamicTypeValue>();
		row3Params.put("___row_identifier___", new StringTypeValue("2022-12-06 12:09-2-two-false"));
		row3Params.put("time", new StringTypeValue("2022-12-06 12:09"));
		row3Params.put("one", new NumberTypeValue(2));
		row3Params.put("two", new StringTypeValue("two"));
		row3Params.put("three", new BooleanTypeValue(false));

		var row3EvaluateExpressionRequestBuilder = CalculatorImpl.EvaluateExpressionRequest.builder()
			.pipelineId(pipelineId)
			.executionId(executionId)
			.groupContextId(GROUP_CONTEXT_ID)
			.authorizer(AUTHORIZER)
			.parameters(row3Params);
		var row3Step0Context = new LinkedHashMap<String, DynamicTypeValue>();
		var evaluateExpressionRequest4 = row3EvaluateExpressionRequestBuilder
			.expression(output0Formula)
			.context(row3Step0Context)
			.build();
		var row3Step0Result = new NumberTypeValue(1670353620000L);
		when(calculator.evaluateExpression(evaluateExpressionRequest4))
			.thenReturn(EvaluateResponse.builder().result(row3Step0Result).evaluated(Map.of(
				":time", "1670353620000")).build());

		var row3Step1Context = new LinkedHashMap<String, DynamicTypeValue>();
		row3Step1Context.put("time", row3Step0Result);
		var evaluateExpressionRequest5 = row3EvaluateExpressionRequestBuilder
			.expression(output1Formula)
			.context(row3Step1Context)
			.build();
		var row3Step1Result = new NumberTypeValue(20);
		when(calculator.evaluateExpression(evaluateExpressionRequest5))
			.thenReturn(EvaluateResponse.builder().result(row3Step1Result).evaluated(Map.of(
				":one", "2",
				":one*10", "20")).build());

		var row3Step2Context = new LinkedHashMap<String, DynamicTypeValue>();
		row3Step2Context.put("time", row3Step0Result);
		row3Step2Context.put("times10", row3Step1Result);
		var evaluateExpressionRequest6 = row3EvaluateExpressionRequestBuilder
			.expression(output2Formula)
			.context(row3Step2Context)
			.build();
		var row3Step2Result = new StringTypeValue("two");
		when(calculator.evaluateExpression(evaluateExpressionRequest6))
			.thenReturn(EvaluateResponse.builder().result(row3Step2Result).evaluated(Map.of(
				":two", "two")).build());

		var row3Step3Context = new LinkedHashMap<String, DynamicTypeValue>();
		row3Step3Context.put("time", row3Step0Result);
		row3Step3Context.put("times10", row3Step1Result);
		row3Step3Context.put("twoVal", row3Step2Result);
		var evaluateExpressionRequest7 = row3EvaluateExpressionRequestBuilder
			.expression(output3Formula)
			.context(row3Step3Context)
			.build();
		var row3Step3Result = new BooleanTypeValue(false);
		when(calculator.evaluateExpression(evaluateExpressionRequest7))
			.thenReturn(EvaluateResponse.builder().result(row3Step3Result).evaluated(Map.of(
				":three", "false")).build());

		// test
		var actual = (InlineTransformResponse) underTest.process(request);

		// verify
		assertEquals(2, actual.getData().size());
		assertEquals(1, actual.getErrors().size());

		var row1 = actual.getData().get(0);
		Map<String, String> row1Json = testGson.fromJson(row1, MapStringStringType);
		assertEquals(row1Step0Result.asString(), row1Json.get("time"));
		assertEquals(row1Step1Result.asString(), row1Json.get("times10"));
		assertEquals(row1Step2Result.asString(), row1Json.get("twoVal"));
		assertEquals(row1Step3Result.asString(), row1Json.get("threeVal"));

		assertEquals(
			"Failed processing row {time=2022-12-06 12:08}, err: Failed processing row: 2022-12-06 12:08 - row does not contain value for parameter: one",
			actual.getErrors().get(0));

		var row3 = actual.getData().get(1);
		Map<String, String> row3Json = testGson.fromJson(row3, MapStringStringType);
		assertEquals(row3Step0Result.asString(), row3Json.get("time"));
		assertEquals(row3Step1Result.asString(), row3Json.get("times10"));
		assertEquals(row3Step2Result.asString(), row3Json.get("twoVal"));
		assertEquals(row3Step3Result.asString(), row3Json.get("threeVal"));
	}
}
