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

import com.aws.sif.audits.AuditMessage;
import com.aws.sif.audits.Auditor;
import com.aws.sif.execution.*;
import com.aws.sif.execution.output.OutputType;
import com.aws.sif.execution.output.RdsWriter;
import com.aws.sif.resources.users.UserNotFoundException;
import com.aws.sif.resources.users.UsersClient;
import com.google.common.base.Strings;
import com.typesafe.config.Config;
import de.siegmar.fastcsv.reader.CsvReader;
import de.siegmar.fastcsv.reader.CsvRow;
import de.siegmar.fastcsv.writer.CsvWriter;
import de.siegmar.fastcsv.writer.LineDelimiter;
import lombok.extern.slf4j.Slf4j;
import org.jetbrains.annotations.NotNull;

import javax.inject.Inject;
import java.io.StringWriter;
import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

@Slf4j
public class CalculatorServiceImpl implements CalculatorService {

	public static final String ROW_IDENTIFIER = "___row_identifier___";
	public static final String ERROR_EVALUATING = "___ERROR___";
	private final Calculator calculator;
	private final S3Utils s3;
	private final Auditor auditor;
	private final CsvReader.CsvReaderBuilder readerBuilder;
	private final CsvWriter.CsvWriterBuilder writerBuilder;
	private final Config config;
	private final RdsWriter rdsWriter;
	private final UsersClient usersClient;
	private  Map<String, DynamicTypeValue> valueMap = new HashMap<>();


	@Inject
	public CalculatorServiceImpl(Calculator calculator, S3Utils s3, Auditor auditor, Config config, RdsWriter rdsWriter, UsersClient usersClient) {
		this.calculator = calculator;
		this.s3 = s3;
		this.auditor = auditor;
		this.config = config;
		this.usersClient = usersClient;
		this.readerBuilder = CsvReader.builder();

		this.rdsWriter = rdsWriter;

		this.writerBuilder = CsvWriter.builder().lineDelimiter(LineDelimiter.PLATFORM);
	}

	@Override
	public TransformResponse process(TransformRequest req) throws InterruptedException {
		log.debug("process> in> req:{}", req);

		TransformResponse response;

		try {
			var errors = validateRequest(req);

			Authorizer authorizer = null;
			if (req.getUsername() == null) {
				errors.add("No `username` provided.");
			} else {
				try {
					// initial authorizer to retrieve claims
					authorizer = new Authorizer(req.getUsername(), req.getGroupContextId(), Set.of(req.getGroupContextId()));
					var user = this.usersClient.getUser(req.getUsername(), req.getGroupContextId(), authorizer);

					// updated authorizer capable of crossing group/tenant boundaries if the pipeline is configured to do so and the pipeline creator has authorization.
					authorizer = new Authorizer(req.getUsername(), req.getGroupContextId(), user.getGroups().keySet());

				} catch (UserNotFoundException e) {
					errors.add(String.format("User `%s` not found.", req.getUsername()));
				}
			}

			var inputColumnMapping = identifyInputColumns(req.getCsvHeader());
			var outputHeaders = identifyOutputColumns(req.getTransforms());

			response = transformInput(req, authorizer, errors, outputHeaders, inputColumnMapping);
		} catch (Exception e) {
			log.error("process> " + e.getMessage(), e);
			throw e;
		} finally {
			Thread.sleep(1000);
			auditor.flushSync();
			rdsWriter.flushSync();
		}

		log.debug("process> exit:");
		log.trace("process> exit: {}", response);
		return response;
	}

	private List<String> identifyOutputColumns(List<Transform> transforms) {
		log.debug("identifyOutputColumns> in>");

		var headers = new ArrayList<String>();
		for (var t : transforms) {
			for (var o : t.getOutputs()) {
				headers.add(o.getKey());
			}
		}
		log.debug("identifyOutputColumns> exit:{}", headers);
		return headers;
	}

	private String replaceKeyTokens(String key, TransformRequest req) {
		var chunkNo = req.getChunkNo() == null ? 0 : req.getChunkNo();
		return key.replace("<pipelineId>", req.getPipelineId() != null ? req.getPipelineId() : "UNKNOWN")
			.replace("<executionId>", req.getExecutionId() != null ? req.getExecutionId() : "UNKNOWN")
			.replace("<chunkNo>", String.valueOf(chunkNo));
	}

	private List<String> flattenTransformed(Map<String, DynamicTypeValue> transformed, List<String> headers) {
		log.debug("flattenTransformed> in> transformed:{}, headers:{}", transformed, headers);
		if (transformed == null) {
			log.debug("flattenTransformed> early exit:");
			return new ArrayList<>();
		}
		var result = new ArrayList<String>(transformed.keySet().size());
		for (var header : headers) {
			var value = transformed.get(header);
			if (value instanceof ErrorValue) {
				result.add(ERROR_EVALUATING);
			} else {
				result.add(value.asString());
			}
		}
		log.debug("flattenTransformed> exit:{}", result);
		return result;
	}

	private TransformResponse transformInput(TransformRequest req, Authorizer authorizer, List<String> errors, List<String> headers, Map<String, Integer> columnMapping) {
		log.debug("transformInput> in> request:{}, errors:{}, headers:{}, columnMapping:{}", req, errors, headers, columnMapping);

		TransformResponse response;

		var sourceLocation = (req.getCsvSourceDataLocation() == null) ? DataSourceLocation.inline : DataSourceLocation.s3;

		// prepare a csv writer. used for inline mode only
		var csv = new StringWriter();
		var csvWriter = this.writerBuilder.build(csv);

		// no point proceeding if we detected an error during initialization or validation
		if (errors.size() == 0) {

			// gather the source data
			String sourceData;
			if (DataSourceLocation.inline.equals(sourceLocation)) {
				sourceData = String.join(System.lineSeparator(), req.getCsvSourceData());
			} else {
				sourceData = s3.download(req.getCsvSourceDataLocation());
			}

			var outputMap = getOutputMap(req);

			// initialize the RDS writer with the current context
			rdsWriter.init(req.getGroupContextId(), req.getPipelineId(), req.getExecutionId(), outputMap);
			try (var reader = this.readerBuilder.build(sourceData)) {
				reader.forEach(row -> {
					try {
						var inputRow = marshallInputRow(req.getParameters(), columnMapping, req.getUniqueKey(), row);
						var outputRow = transformRow(req, authorizer, inputRow, errors);
						// if in inline mode we need to collect the generated output rows as we progress to return
						if (DataSourceLocation.inline.equals(sourceLocation)) {
							csvWriter.writeRow(flattenTransformed(outputRow, headers));
						}

						// if not in dry run mode we save the results to RDS
						if (!req.isDryRun()) {
							var time = outputRow.entrySet().stream()
								.filter(x -> OutputType.time.equals(x.getValue().getOutputType()))
								.findFirst().orElseThrow();
							var uniqueIdColumns = outputRow.entrySet().stream()
								.filter(x -> OutputType.uniqueId.equals(x.getValue().getOutputType()))
								.collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));

							var values = this.getValueMap(req,outputRow);

							rdsWriter.addRecord((NumberTypeValue) time.getValue(), uniqueIdColumns, values);
						}

					} catch (Exception e) {
						log.error("*****", e);
						recordError(errors, "transformInput", String.format("Failed processing row %s, err: %s", row.getFields(), e.getMessage()));
					}
				});

			} catch (Exception e) {
				recordError(errors, "transformInput", String.format("Failed processing: %s", e.getMessage()));
			}
		}

		// post transformation step...
		var bucket = config.getString("calculator.upload.s3.bucket");
		S3Location auditLogLocation = (!req.isDryRun()) ? new S3Location(bucket, replaceKeyTokens(config.getString("calculator.upload.s3.audit.key"), req)) : null;
		if (DataSourceLocation.s3.equals(sourceLocation)) {
			S3Location errorLocation = null;
			if (errors.size() > 0) {
				errorLocation = new S3Location(bucket, replaceKeyTokens(config.getString("calculator.upload.s3.errors.key"), req));
				s3.upload(errorLocation, String.join(System.lineSeparator(), errors));
			}
			response = new S3TransformResponse(errorLocation, auditLogLocation);
		} else {
			var output = List.of(csv.toString().split(System.lineSeparator()));
			response = new InlineTransformResponse(headers, output, errors, auditLogLocation);
		}

		log.trace("transformInput> exit:{}", response);
		return response;

	}

	@NotNull
	private Map<String, String> getOutputMap(TransformRequest req) {
		// loop each output of each transform to generate the output column mapping
		Map<String, String> outputMap = new HashMap<>();
		req.getTransforms().forEach(t -> t.getOutputs().forEach(o -> {
			// skip if key equals time
			if (!o.getKey().trim().equals("time")) {
				outputMap.put(o.getKey(), o.getType());
			}
		}));
		return outputMap;
	}

	@NotNull
	private Map<String, DynamicTypeValue> getValueMap(TransformRequest req,Map<String, DynamicTypeValue> outputRow) {
		// loop through the values and generate a value column mapping
		this.valueMap.clear();
		// if action type is deletion insert null values
		if (isDeletion(req)) {
			for (Map.Entry<String, DynamicTypeValue> entry : outputRow.entrySet()) {
				this.valueMap.put(entry.getKey(), new NullValue());
			}

		} else {
			this.valueMap = outputRow.entrySet().stream().filter(x -> (OutputType.uniqueId.equals(x.getValue().getOutputType())
					|| OutputType.value.equals(x.getValue().getOutputType()))).collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
		}
		return this.valueMap;
	}

	private Map<String, DynamicTypeValue> transformRow(TransformRequest req, Authorizer authorizer, Map<String, DynamicTypeValue> source, List<String> errorMessages) throws Exception {
		log.debug("transformRow> in> request:{}, source:{}", req, source);

		Map<String, DynamicTypeValue> transformed = new HashMap<>();

		// common audit attributes regardless of the output column being evaluated
		var auditMessageBuilder = AuditMessage.builder()
			.pipelineId(req.getPipelineId())
			.executionId(req.getExecutionId())
			.rowId(source.get(ROW_IDENTIFIER).asString());

		// loop each output of each transform to generate the output column
		var outputs = new ArrayList<AuditMessage.Output>();
		var outputsWithError = new ArrayList<Integer>();
		var index = new AtomicInteger(0);

		req.getTransforms().forEach(t -> t.getOutputs().forEach(o -> {

			// audit attributes specific to the output
			var auditOutputBuilder = AuditMessage.Output.builder()
				.index(index.get())
				.name(o.getKey())
				.formula(t.getFormula());

			DynamicTypeValue result;
			try {
					// evaluate the calculation
					var evaluateExpressionRequest = CalculatorImpl.EvaluateExpressionRequest
							.builder().pipelineId(req.getPipelineId())
							.executionId(req.getExecutionId())
							.groupContextId(req.getGroupContextId()).expression(t.getFormula())
							.parameters(source).context(transformed).authorizer(authorizer).build();

					var calculation = calculator.evaluateExpression(evaluateExpressionRequest);
					result = calculation.getResult();

					// audit attributes specific to what was evaluated to arrive at the calculation
					AuditMessage.Resources outputResources = null;
					if (calculation.getActivities() != null || calculation.getCalculations() != null
							|| calculation.getReferenceDatasets() != null) {
						outputResources = AuditMessage.Resources.builder()
								.activities(calculation.getActivities())
								.calculations(calculation.getCalculations())
								.referenceDatasets(calculation.getReferenceDatasets()).build();
					}
					auditOutputBuilder.evaluated(calculation.getEvaluated())
							.result(calculation.getResult().asString())
							.resources(outputResources);

			} catch (Exception ex) {
				var errorMessage = recordError(errorMessages, "transformRow",
					String.format("Row '%s' column '%s' encountered error evaluating formula `%s` - %s", source.get(ROW_IDENTIFIER).asString(), o.getKey(), t.getFormula(), ex.getMessage()));
				auditOutputBuilder.errorMessage(errorMessage);
				outputsWithError.add(index.get());
				result = new ErrorValue(errorMessage);
			}

			// first output column is always the timestamp of the time-series data. for the reset determine if it was a key or value result.
			if (index.get() == 0) {
				result.setOutputType(OutputType.time);
			} else if (o.getIncludeAsUnique() == null || !o.getIncludeAsUnique()) {
					result.setOutputType(OutputType.value);
			} else {
				// throw an error if unique key value in null
				if (result.asString()== null || result.asString().isEmpty()) {
					var message = String.format("Row '%s' column '%s' encountered error uniqueKey value cannot be null", source.get(ROW_IDENTIFIER).asString(), o.getKey());
					log.error("transformRow> " + message);
					throw new RuntimeException(message);
				}
				result.setOutputType(OutputType.uniqueId);
				result.setKeyMapIndex(o.get_keyMapping());
			}

			transformed.put(o.getKey(), result);
			outputs.add(auditOutputBuilder.build());
			index.getAndIncrement();
		}));

		// If action Type is set to delete then deletion can occur we set all error messages to null.
		if (isDeletion(req)) {
			for (Integer outputIndex : outputsWithError) {
				outputs.get(outputIndex).setErrorMessage(null);
			}
		}

		// publish the audit log (does not apply to dry runs)
		if (!req.isDryRun()) {
			var outputsArray = new AuditMessage.Output[outputs.size()];
			auditMessageBuilder.outputs(outputs.toArray(outputsArray));
			this.auditor.log(auditMessageBuilder.build());
		}

		log.debug("transformRow> exit:{}", transformed);
		return transformed;
	}

	private boolean isDeletion(TransformRequest req) {
		log.debug("isDeletion> in> req:{}",req);
		var isDeletion= CalculatorActionType.delete.equals(req.getActionType());
		// If activityType is set to delete then consider it a deletion
		log.debug("isDeletion> exit:{}", isDeletion);
		return isDeletion;
	}

	private List<String> validateRequest(TransformRequest req) {
		log.debug("validateRequest> in> req:{}", req);

		var errorMessages = new ArrayList<String>();

		if (req == null) {
			recordError(errorMessages, "validateRequest", "No request provided.");
			return errorMessages;
		}

		if (Strings.isNullOrEmpty(req.getGroupContextId())) {
			recordError(errorMessages, "validateRequest", "No groupContextId provided.");
		}

		if (Strings.isNullOrEmpty(req.getPipelineId())) {
			recordError(errorMessages, "validateRequest", "No pipelineId provided.");
		}

		if (Strings.isNullOrEmpty(req.getExecutionId())) {
			recordError(errorMessages, "validateRequest", "No executionId provided.");
		}

		if (req.getParameters() == null || req.getParameters().size() == 0) {
			recordError(errorMessages, "validateRequest", "No parameters provided.");
		} else {
			for (var x = 0; x < req.getParameters().size(); x++) {
				var p = req.getParameters().get(x);
				if (p == null) {
					recordError(errorMessages, "validateRequest", String.format("Parameter at index %s not provided.", x));
				} else {
					if (Strings.isNullOrEmpty(p.getKey())) {
						recordError(errorMessages, "validateRequest", String.format("Parameter key at index %s not provided.", x));
					}
					if (Strings.isNullOrEmpty(p.getType())) {
						recordError(errorMessages, "validateRequest", String.format("Parameter type at index %s not provided.", x));
					}
				}
			}
		}

		if (req.getTransforms() == null || req.getTransforms().size() == 0) {
			recordError(errorMessages, "validateRequest", "No transforms provided.");
		} else {
			// validate transforms
			req.getTransforms().forEach(t -> {
				if (Strings.isNullOrEmpty(t.getFormula())) {
					recordError(errorMessages, "validateRequest", String.format("Formula for transform index %s not provided.", t.getIndex()));
				}

				if (t.getOutputs() == null || t.getOutputs().size() == 0) {
					recordError(errorMessages, "validateRequest", String.format("Outputs for transform index %s not provided.", t.getIndex()));
				} else if (t.getOutputs().size() > 1) {
					recordError(errorMessages, "validateRequest", String.format("More than 1 output configuration provided for transform %s.", t.getIndex()));
				} else {
					t.getOutputs().forEach(o -> {
						if (o == null) {
							recordError(errorMessages, "validateRequest", "Output of transform not provided.");
						} else {
							if (Strings.isNullOrEmpty(o.getKey())) {
								recordError(errorMessages, "validateRequest", String.format("Key for output index %s of transform index %s not provided.", o.getIndex(), t.getIndex()));
							}
							if (Strings.isNullOrEmpty(o.getType())) {
								recordError(errorMessages, "validateRequest", String.format("Type for output index %s of transform index %s not provided.", o.getIndex(), t.getIndex()));
							}
						}
					});
				}
			});

			// 1st output of 1st transform must be the timestamp
			var firstOutput = req.getTransforms().get(0).getOutputs().get(0);
			if (!req.isDryRun() && !"timestamp".equals(firstOutput.getType())) {
				recordError(errorMessages, "validateRequest", "First output of first transform must be configured as the timestamp.");
			}
		}

		if (Strings.isNullOrEmpty(req.getCsvHeader())) {
			recordError(errorMessages, "validateRequest", "No csvHeader provided.");
		}

		if (req.getCsvSourceDataLocation() != null && req.getCsvSourceData() != null) {
			recordError(errorMessages, "process", "Only 1 of csvSourceDataLocation (S3 source) or csvSourceData (inline source) may be provided.");
		}

		if (req.getCsvSourceDataLocation() == null && (req.getCsvSourceData() == null || req.getCsvSourceData().size() == 0)) {
			recordError(errorMessages, "process", "Either csvSourceDataLocation (S3 source) or csvSourceData (inline source) must be provided.");
		}

		if (req.getCsvSourceDataLocation() != null) {
			if (Strings.isNullOrEmpty(req.getCsvSourceDataLocation().getBucket())) {
				recordError(errorMessages, "process", "csvSourceDataLocation (S3 source) provided but no S3 bucket provided.");
			}
			if (Strings.isNullOrEmpty(req.getCsvSourceDataLocation().getKey())) {
				recordError(errorMessages, "process", "csvSourceDataLocation (S3 source) provided but not S3 key provided.");
			}
			if (req.getCsvSourceDataLocation().getEndByte() != null && req.getChunkNo() == null) {
				recordError(errorMessages, "process", "An S3 chunk request was provided but the request has no `chunkNo`.");
			}
		}

		log.debug("validateRequest> exit:{}", errorMessages);
		return errorMessages;
	}

	private Map<String, Integer> identifyInputColumns(String csvHeader) {
		log.debug("identifyInputColumns> in> csvHeader:{}", csvHeader);

		var columns = new HashMap<String, Integer>();
		// TODO: improvement - use a csv parser for this
		var split = csvHeader.split(",", -1);

		for (var i = 0; i < split.length; i++) {
			var name = split[i];
			if (name.startsWith("\"") && name.endsWith("\"")) {
				name = name.substring(1, name.length() - 1);
			}
			columns.put(name, i);
		}
		log.debug("identifyInputColumns> exit:{}", columns);
		return columns;
	}

	private Map<String, DynamicTypeValue> marshallInputRow(List<TransformParameter> parameters, Map<String, Integer> columnsMapping, List<String> uniqueKeys, CsvRow inputData) {
		log.debug("marshallInput> in> parameters:{}, columnsMapping:{}, uniqueKeys:{}, inputData:{}", parameters, columnsMapping, uniqueKeys, inputData);

		var data = new HashMap<String, DynamicTypeValue>();

		// special case, add row identifier
		if (uniqueKeys == null || uniqueKeys.size() == 0) {
			data.put(ROW_IDENTIFIER, new StringTypeValue(inputData.getField(0)));
		} else {
			var keyValues = new ArrayList<String>();
			uniqueKeys.forEach(k -> {
				var v = new StringTypeValue(inputData.getField(columnsMapping.get(k))).asString();
				try {
					keyValues.add(URLEncoder.encode(v, StandardCharsets.UTF_8.toString()));
				} catch (UnsupportedEncodingException e) {
					var message = String.format("Failed encoding key: %s", e.getMessage());
					log.error("marshallData> " + message);
					throw new RuntimeException(message, e);
				}
			});
			data.put(ROW_IDENTIFIER, new StringTypeValue(String.join("-", keyValues)));
		}

		for (var p : parameters) {
			log.trace("marshallInput> p:'{}'", p);
			var column = columnsMapping.get(p.getKey());
			log.trace("marshallInput> column:'{}'", column);
			var value = inputData.getField(column);
			log.trace("marshallInput> value:'{}', type:{}", value, p.getType());

			DynamicTypeValue result;
			if (value == null || value.isEmpty()) {
				result = new NullValue();
			} else if ("number".equals(p.getType())) {
				result = new NumberTypeValue(value);
			} else if ("boolean".equals(p.getType())) {
				result = new BooleanTypeValue(Boolean.parseBoolean(value));
			} else {
				if (value.startsWith("\"") && value.endsWith("\"")) {
					result = new StringTypeValue(value.substring(1, value.length() - 1));
				} else {
					result = new StringTypeValue(value);
				}
			}
			data.put(p.getKey(), result);
		}
		log.debug("marshallInput> exit:{}", data);
		return data;
	}

	private String recordError(List<String> errorMessages, String methodName, String message) {
		log.warn("{}> {}", methodName, message);
		errorMessages.add(message);
		return message;
	}
}
