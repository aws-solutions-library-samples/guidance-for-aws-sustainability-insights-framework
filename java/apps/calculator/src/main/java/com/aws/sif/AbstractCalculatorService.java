package com.aws.sif;

import com.aws.sif.audits.AuditMessage;
import com.aws.sif.audits.Auditor;
import com.aws.sif.execution.*;
import com.aws.sif.execution.output.OutputType;
import com.aws.sif.execution.output.OutputWriter;
import com.aws.sif.resources.users.UserNotFoundException;
import com.aws.sif.resources.users.UsersClient;
import com.google.common.base.Strings;
import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import com.typesafe.config.Config;
import lombok.extern.slf4j.Slf4j;
import org.jetbrains.annotations.NotNull;

import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.lang.reflect.Type;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Slf4j
public abstract class AbstractCalculatorService<T> {
    public static final String ROW_IDENTIFIER = "___row_identifier___";
    public static final String ERROR_EVALUATING = "___ERROR___";
    private final Calculator calculator;
    private final S3Utils s3;
    private final Auditor auditor;
    private final Config config;
    private final OutputWriter<T> outputWriter;
    private final UsersClient usersClient;
    private final Gson gson;
    protected Map<String, DynamicTypeValue> valueMap = new HashMap<>();

    public AbstractCalculatorService(Calculator calculator, S3Utils s3, Auditor auditor, Config config, OutputWriter<T> outputWriter, UsersClient usersClient, Gson gson) {
        this.calculator = calculator;
        this.s3 = s3;
        this.auditor = auditor;
        this.config = config;
        this.usersClient = usersClient;
        this.gson = gson;
        this.outputWriter = outputWriter;
    }

    public TransformResponse process(TransformRequest req) throws InterruptedException, IOException {
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

            var outputHeaders = identifyOutputColumns(req.getTransforms());

            response = transformInput(req, authorizer, errors, outputHeaders, outputWriter);
        } catch (Exception e) {
            log.error("process> " + e.getMessage(), e);
            throw e;
        } finally {
            Thread.sleep(1000);
            auditor.flushSync();
            outputWriter.submit();
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

    private String transformedToJsonLine(Map<String, DynamicTypeValue> transformed, List<String> headers) {
        log.debug("transformedToJson> in> transformed:{}, headers:{}", transformed, headers);
        if (transformed == null) {
            log.debug("transformedToJson> early exit:");
            return "{}";
        }

        StringBuilder jsonLine = new StringBuilder("{");
        for (var header : headers) {
            jsonLine.append("\"").append(header).append("\":");
            var value = transformed.get(header);
            if (value instanceof ErrorValue) {
                jsonLine.append("\"").append(ERROR_EVALUATING).append("\"");
            } else if (value instanceof NullValue) {
                jsonLine.append("null");
            } else if (value instanceof StringTypeValue || value instanceof DateTimeTypeValue) {
                jsonLine.append("\"").append(value.asString()).append("\"");
            } else {
                jsonLine.append(value.asString());
            }
            jsonLine.append(",");
        }
        jsonLine.deleteCharAt(jsonLine.length() - 1);    // remove last ","
        jsonLine.append("}");
        log.debug("transformedToJson> exit:{}", jsonLine);
        return jsonLine.toString();
    }

    private TransformResponse transformInput(TransformRequest req, Authorizer authorizer, List<String> errors, List<String> headers, OutputWriter outputWriter) throws IOException {
        log.debug("transformInput> in> request:{}, errors:{}, headers:{}", req, errors, headers);

        TransformResponse response;

        var sourceLocation = (req.getSourceDataLocation() == null) ? DataSourceLocation.inline : DataSourceLocation.s3;

        // collection of outputs for inline mode
        var inlineResultJsonLines = new ArrayList<String>();

        // keep track of group paths visited for pipeline and metrics aggregations
        var groupsVisited = new HashSet<String>();

        // no point proceeding if we detected an error during initialization or validation
        if (errors.size() == 0) {

            // gather the source data
            String sourceData;
            if (DataSourceLocation.inline.equals(sourceLocation)) {
                sourceData = String.join(System.lineSeparator(), req.getSourceData());
            } else {
                sourceData = s3.download(req.getSourceDataLocation());
            }

            var outputMap = getOutputMap(req);

            // this is optional, but activityOutputWriter.init requires it so make the default to 0
            var chunkNo = req.getChunkNo() == null ? 0 : req.getChunkNo();

            // initialize the activity writer with the current context
            outputWriter.init(req.getPipelineId(), req.getExecutionId(), chunkNo, outputMap);

            Type MapStringStringType = new TypeToken<Map<String, String>>() {
            }.getType();

            Stream<String> linesFromString = sourceData.lines();
            linesFromString.forEach(l -> {
                log.trace("l: {}", l);
                Map<String, String> jsonLine = gson.fromJson(l, MapStringStringType);
                log.trace("jsonLine: {}", jsonLine);

                try {
                    var inputRow = marshallInputRow(req.getParameters(), req.getUniqueKey(), jsonLine);
                    var outputRow = transformRow(req, authorizer, inputRow, errors);

                    // if in inline mode we need to collect the generated output rows as we progress to return
                    if (DataSourceLocation.inline.equals(sourceLocation)) {
                        inlineResultJsonLines.add(transformedToJsonLine(outputRow, headers));
                    }

                    // if not in dry run mode we save the results to RDS
                    if (!req.isDryRun()) {
                        // if the output row has an entry that is a group id, then use it, otherwise default to execution group
                        var groupIdOutput = outputRow.entrySet().stream()
                                .filter(x -> OutputType.groupId.equals(x.getValue().getOutputType()))
                                .findFirst().orElse(new AbstractMap.SimpleEntry<>("__execution_group_id", new StringTypeValue(req.getGroupContextId())));
                        var rowGroupId = ((StringTypeValue) groupIdOutput.getValue()).getValue();
                        groupsVisited.add(rowGroupId);

                        outputWriter.addRecord(this.buildRecord(req, outputRow));
                    }

                } catch (Exception e) {
                    log.error("*****", e);
                    recordError(errors, "transformInput", String.format("Failed processing row %s, err: %s", jsonLine, e.getMessage()));
                }
            });
        }

        // post transformation step...
        var bucket = config.getString("calculator.upload.s3.bucket");

        log.trace("transformInput> groups visited:{}", groupsVisited);
        if (!req.isDryRun()) {
            S3Location groupsLocation = new S3Location(bucket, replaceKeyTokens(config.getString("calculator.upload.s3.groups.key"), req));
            s3.upload(groupsLocation, String.join(System.lineSeparator(), groupsVisited));
        }

        if (DataSourceLocation.s3.equals(sourceLocation)) {
            S3Location errorLocation = null;
            if (errors.size() > 0) {
                errorLocation = new S3Location(bucket, replaceKeyTokens(config.getString("calculator.upload.s3.errors.key"), req));
                s3.upload(errorLocation, String.join(System.lineSeparator(), errors));
            }
            response = new S3TransformResponse(errorLocation);
        } else {
            response = new InlineTransformResponse(headers, inlineResultJsonLines, errors);
        }

        log.trace("transformInput> exit:{}", response);
        return response;

    }


    private Map<String, DynamicTypeValue> transformRow(TransformRequest req, Authorizer authorizer, Map<String, DynamicTypeValue> source, List<String> errorMessages) throws Exception {
        log.debug("transformRow> in> request:{}, source:{}", req, source);

        Map<String, DynamicTypeValue> transformed = new HashMap<>();

        // common audit attributes regardless of the output column being evaluated
        String auditId = UUID.randomUUID().toString();
        var inputs = source.entrySet().stream()
                .map(e -> AuditMessage.Input.builder().name(e.getKey()).value(e.getValue().asString()).build())
                .collect(Collectors.toList())
                .toArray(new AuditMessage.Input[source.size()]);
        var auditMessageBuilder = AuditMessage.builder()
                .pipelineId(req.getPipelineId())
                .executionId(req.getExecutionId())
                .auditId(auditId)
                .inputs(inputs);

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
                if (!(result.getOutputType() == OutputType.groupId)) {
                    result.setOutputType(OutputType.value);
                }
            } else {
                // throw an error if unique key value in null
                if (result.asString() == null || result.asString().isEmpty()) {
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
			var chunkNo = req.getChunkNo() == null ? 0 : req.getChunkNo();
            this.auditor.log(auditMessageBuilder.build(),chunkNo);
        }

        var auditIdValue = new StringTypeValue(auditId);
        auditIdValue.setOutputType(OutputType.auditId);
        transformed.put("auditId", auditIdValue);


        log.debug("transformRow> exit:{}", transformed);
        return transformed;
    }

    protected boolean isDeletion(TransformRequest req) {
        log.debug("isDeletion> in> req:{}", req);
        var isDeletion = CalculatorActionType.delete.equals(req.getActionType());
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

            var groupIdOutputs = req.getTransforms().stream()
                    .filter(x -> x.getFormula().contains(("ASSIGN_TO_GROUP")))
                    .count();
            if (groupIdOutputs > 1) {
                recordError(errorMessages, "validateRequest", "Only one transform may contain a formula with an ASSIGN_TO_GROUP function.");
            }

            // 1st output of 1st transform must be the timestamp for activities type
            var firstOutput = req.getTransforms().get(0).getOutputs().get(0);
            if (req.getPipelineType() == PipelineType.activities && !req.isDryRun() && !"timestamp".equals(firstOutput.getType())) {
                recordError(errorMessages, "validateRequest", "First output of first transform must be configured as the timestamp.");
            }
        }

        if (req.getSourceDataLocation() != null && req.getSourceData() != null) {
            recordError(errorMessages, "process", "Only 1 of sourceDataLocation (S3 source) or sourceData (inline source) may be provided.");
        }

        if (req.getSourceDataLocation() == null && (req.getSourceData() == null || req.getSourceData().size() == 0)) {
            recordError(errorMessages, "process", "Either sourceDataLocation (S3 source) or sourceData (inline source) must be provided.");
        }

        if (req.getSourceDataLocation() != null) {
            if (Strings.isNullOrEmpty(req.getSourceDataLocation().getBucket())) {
                recordError(errorMessages, "process", "sourceDataLocation (S3 source) provided but no S3 bucket provided.");
            }
            if (Strings.isNullOrEmpty(req.getSourceDataLocation().getKey())) {
                recordError(errorMessages, "process", "sourceDataLocation (S3 source) provided but not S3 key provided.");
            }
            if (req.getSourceDataLocation().getEndByte() != null && req.getChunkNo() == null) {
                recordError(errorMessages, "process", "An S3 chunk request was provided but the request has no `chunkNo`.");
            }
        }

        log.debug("validateRequest> exit:{}", errorMessages);
        return errorMessages;
    }

    private Map<String, DynamicTypeValue> marshallInputRow(List<TransformParameter> parameters, List<String> uniqueKeys, Map<String, String> inputJsonData) {
        log.debug("marshallInput> in> parameters:{}, uniqueKeys:{}, inputData:{}", parameters, uniqueKeys, inputJsonData);

        var data = new HashMap<String, DynamicTypeValue>();
        var rowIdentifier = "";

        // special case, add row identifier
        if (uniqueKeys == null || uniqueKeys.size() == 0) {
            rowIdentifier = String.join("-", inputJsonData.values());
            data.put(ROW_IDENTIFIER, new StringTypeValue(rowIdentifier));
        } else {
            var values = new ArrayList<String>();
            uniqueKeys.forEach(k -> {
                var v = new StringTypeValue(inputJsonData.get(k)).asString();
                try {
                    values.add(URLEncoder.encode(v, StandardCharsets.UTF_8.toString()));
                } catch (UnsupportedEncodingException e) {
                    var message = String.format("Failed encoding key: %s", e.getMessage());
                    log.error("marshallData> " + message);
                    throw new RuntimeException(message, e);
                }
            });
            rowIdentifier = String.join("-", values);
            data.put(ROW_IDENTIFIER, new StringTypeValue(rowIdentifier));
        }

        for (var p : parameters) {
            log.trace("marshallInput> p:'{}'", p);

            if (!inputJsonData.containsKey(p.getKey())) {
                var message = String.format("Failed processing row: %s - row does not contain value for parameter: %s", rowIdentifier, p.getKey());
                log.error("marshallData> " + message);
                throw new RuntimeException(message);
            }
            var value = inputJsonData.get(p.getKey());

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

    @NotNull
    abstract Map<String, String> getOutputMap(TransformRequest req);

    @NotNull
    abstract Map<String, DynamicTypeValue> getValueMap(TransformRequest req, Map<String, DynamicTypeValue> outputRow);

    @NotNull
    abstract T buildRecord(TransformRequest req, Map<String, DynamicTypeValue> outputRow);

}
