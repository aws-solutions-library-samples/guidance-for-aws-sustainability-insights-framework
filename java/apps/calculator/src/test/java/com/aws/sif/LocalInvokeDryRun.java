package com.aws.sif;

import com.aws.sif.*;
import com.google.gson.GsonBuilder;
import lombok.extern.slf4j.Slf4j;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;

@Slf4j
public class LocalInvokeDryRun {

	private TransformRequest.TransformRequestBuilder prepareRequest() {
		return TransformRequest.builder()
			.pipelineId(String.format("pipe-%s",System.currentTimeMillis()))
			.executionId(String.format("exe-%s", String.valueOf(System.currentTimeMillis())))
			.groupContextId("/")
			.username("rotach+ssaas@amazon.com")
			.parameters(List.of(
				TransformParameter.builder().key("timestamp").type("string").build(),
				TransformParameter.builder().key("zipcode").type("string").build(),
				TransformParameter.builder().key("kwh").type("number").build()
			))
			.transforms(List.of(
				Transform.builder().index(0).formula("AS_TIMESTAMP(:timestamp, 'M/d/yyyy')").outputs(
					List.of(TransformOutput.builder().index(0).key("timestamp").type("timestamp").build())
				).build(),
				Transform.builder().index(1).formula(":zipcode").outputs(
					List.of(TransformOutput.builder().index(0).key("zipcode").includeAsUnique(true)._keyMapping("key1").type("string").build())
				).build(),
				Transform.builder().index(2).formula(":kwh").outputs(
					List.of(TransformOutput.builder().index(0).key("kwh").type("number").build())
				).build(),
				Transform.builder().index(3).formula(":kwh*0.25").outputs(
					List.of(TransformOutput.builder().index(0).key("co2e").type("number").build())
				).build()
			)).dryRun(true)
			.sourceData(List.of(
				"{\"timestamp\":\"01/01/2020\",\"zipcode\":\"80239\",\"kwh\":\"100\"}"
			))
			.chunkNo(0);
	}

	@Test
	public void dryRun() throws IOException {

		var request = prepareRequest().build();
		var gson = new GsonBuilder().create();
		var inputStream = new ByteArrayInputStream(gson.toJson(request).getBytes());

		var outputStream = new ByteArrayOutputStream();

		var handler = new HandlerStream();
		handler.handleRequest(inputStream, outputStream, null);

		var actual = gson.fromJson(new String(outputStream.toByteArray()), InlineTransformResponse.class);
		log.debug("dryRun> actual: {}", actual.toString());
		log.debug("dryRun> actual.getData(): {}", actual.getData());
	}
}
