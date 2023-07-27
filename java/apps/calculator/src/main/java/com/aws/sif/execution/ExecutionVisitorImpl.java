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
import com.aws.sif.resources.calculations.Calculation;
import com.aws.sif.resources.calculations.CalculationNotFoundException;
import com.aws.sif.resources.calculations.CalculationsClient;
import com.aws.sif.resources.caml.CamlClient;
import com.aws.sif.resources.caml.CamlNotEnabledException;
import com.aws.sif.resources.groups.GroupNotFoundException;
import com.aws.sif.resources.groups.GroupsClient;
import com.aws.sif.resources.impacts.Activity;
import com.aws.sif.resources.impacts.ActivityNotFoundException;
import com.aws.sif.resources.impacts.ImpactsClient;
import com.aws.sif.resources.referenceDatasets.DatasetsClient;
import com.aws.sif.resources.referenceDatasets.ReferenceDatasetNotFoundException;
import com.google.gson.Gson;
import com.jayway.jsonpath.Configuration;
import com.jayway.jsonpath.InvalidJsonException;
import com.jayway.jsonpath.JsonPath;
import io.github.qudtlib.Qudt;
import io.github.qudtlib.exception.InconvertibleQuantitiesException;
import io.github.qudtlib.model.QuantityValue;
import io.github.qudtlib.model.Unit;
import lang.sif.CalculationsBaseVisitor;
import lang.sif.CalculationsParser;
import lombok.extern.slf4j.Slf4j;
import net.minidev.json.JSONArray;
import org.antlr.v4.runtime.ParserRuleContext;

import javax.inject.Inject;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.time.temporal.WeekFields;
import java.util.*;
import java.util.regex.PatternSyntaxException;

@Slf4j
public class ExecutionVisitorImpl extends CalculationsBaseVisitor<DynamicTypeValue> implements ExecutionVisitor {

    // context
    private Calculator calculator;
    private String pipelineId;
    private String executionId;
    private String groupContextId;
    private Map<String,DynamicTypeValue> parameters;
    private Map<String,DynamicTypeValue> context;
    private Authorizer authorizer;

	// state
	private Map<String,DynamicTypeValue> variables;


    // auditing
	private Map<String,String> auditEvaluated;
    private List<Map<String,String>> auditActivities;
    private List<Map<String,String>> auditCalculations;
    private List<Map<String,String>> auditReferenceDatasets;

    // resource clients
    private final CalculationsClient calculationsClient;
    private final DatasetsClient datasetsClient;
	private final GroupsClient groupsClient;
    private final ImpactsClient impactsClient;
    private final CamlClient camlClient;
    private final Gson gson;
    public static final Configuration jsonConf = Configuration.defaultConfiguration();

    @Inject
    public ExecutionVisitorImpl(CalculationsClient calculationsClient, DatasetsClient datasetsClient, GroupsClient groupsClient, ImpactsClient impactsClient, CamlClient camlClient, Gson gson) {
        this.calculationsClient = calculationsClient;
        this.datasetsClient = datasetsClient;
		this.groupsClient = groupsClient;
        this.impactsClient = impactsClient;
        this.camlClient = camlClient;
        this.gson = gson;
    }

    @Override
    public EvaluateResponse evaluate(EvaluateRequest req) {
        log.debug("evaluate> in> req: {}", req);

        this.calculator = req.getCalculator();
        this.pipelineId = req.getPipelineId();
        this.executionId = req.getExecutionId();
        this.groupContextId = req.getGroupContextId();
        this.parameters = req.getParameters();
        this.context = req.getContext();
        this.authorizer = req.getAuthorizer();

		this.variables = new HashMap<>();

		// auditing
		this.auditEvaluated = new HashMap<>();
		this.auditActivities = new ArrayList<>();
		this.auditCalculations = new ArrayList<>();
		this.auditReferenceDatasets = new ArrayList<>();

        var result = super.visit(req.getTree());

        var builder =  EvaluateResponse.builder().result(result);
        if (auditEvaluated.size()>0) builder.evaluated(auditEvaluated);
        if (auditActivities.size()>0) builder.activities(auditActivities);
        if (auditCalculations.size()>0) builder.calculations(auditCalculations);
        if (auditReferenceDatasets.size()>0) builder.referenceDatasets(auditReferenceDatasets);
        var response = builder.build();

        log.debug("evaluate> exit: {}", response);
        return response;
    }

	/**
	 * WIP - not in use yet
	 */
//	private void addEvaluated(RuleContext parent, int currentId, String currentText, DynamicTypeValue currentResult) {
//
//		// get or create the node
//		EvaluatedNode current = evaluatedNodes.get(currentId);
//		if (current==null) {
//			current = new EvaluatedNode();
//		}
//		// set the current values
//		current.setId(currentId);
//		current.setText(currentText);
//		current.setResult(currentResult);
//
//		// convert the parentIds to an array we can iterate on
//		var parentIdsText = parent.toString();
//		log.trace("\t\t parentIdsText:{}", parentIdsText);
//		List<Integer> parentIds = Arrays.stream(parentIdsText.substring(1, parentIdsText.length()-1)
//			.split(" "))
//			.filter(s-> Strings.hasLength(s))
//			.map(s-> Integer.parseInt(s)).collect(Collectors.toList());
//		log.trace("\t\t parentIds:{}", parentIds);
//
//		// ensure the parent hierarchy exist
//		if (parentIds.size()>0) {
//			for(int x=parentIds.size()-1; x>=0; x--) {
//				var parentId = parentIds.get(x);
//				log.trace("\t\t looking for parentId:{}", parentId);
//				var p = this.evaluatedNodes.get(parentId);
//				if (p==null) {
//					log.trace("\t\t not found, so adding");
//					var pNode = new EvaluatedNode();
//					pNode.setId(parentId);
//					pNode.setText("?");
//					p = this.evaluatedNodes.put(parentId, pNode);
//					if (x<parentIds.size()-1) {
//						var grandParentId = parentIds.get(x+1);
//						log.trace("\t\t adding as child to grand parent {}", grandParentId);
//						var gp = this.evaluatedNodes.get(grandParentId);
//						gp.addChild(p);
//					}
//				} else {
//					log.trace("\t\t found");
//				}
//			}
//		}
//
//		// associate the current with its parent (or set as root if no parent)
//		if (parentIds.size()>0) {
//			var parentNode = this.evaluatedNodes.get(parentIds.get(0));
//			parentNode.addChild(current);
//		} else {
//			evaluatedNodes.setRoot(current);
//		}
//		evaluatedNodes.put(currentId, current);
//	}

    @Override public NumberTypeValue visitPowerExpr(CalculationsParser.PowerExprContext ctx) {
        log.trace("visitPowerExpr> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());

        var left = super.visit(ctx.left);
        var leftAsNumber = asNumber(left, String.format("Left side of '%s' power operation must be a number.", ctx.getText()));

        var right = super.visit(ctx.right);
        var rightAsNumber = asNumber(right, String.format("Right side of '%s' power operation must be a number.", ctx.getText()));

        var r = Math.pow(leftAsNumber.getValue().doubleValue(), rightAsNumber.getValue().doubleValue());
        var result = new NumberTypeValue(r);

        log.trace("visitPowerExpr> exit> {}", result);
        return result;
    }
    @Override public NumberTypeValue visitMulDivExpr(CalculationsParser.MulDivExprContext ctx) {
        log.trace("visitMulDivExpr> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());

        var left = super.visit(ctx.left);
        var leftAsNumber = asNumber(left, String.format("Left side of '%s' multiple/divide operation must be a number.", ctx.getText()));

        var right = super.visit(ctx.right);
        var rightAsNumber = asNumber(right, String.format("Right side of '%s' multiple/divide operation must be a number.", ctx.getText()));

        BigDecimal r;
        if ("*".equals(ctx.op.getText())) {
            r = leftAsNumber.getValue().multiply(rightAsNumber.getValue());
        } else {
            int NUMBER_SCALE = 10;
            r = leftAsNumber.getValue().divide(rightAsNumber.getValue(), NUMBER_SCALE, RoundingMode.HALF_UP).stripTrailingZeros();
        }
        var result = new NumberTypeValue(r);

        log.trace("visitMulDivExpr> exit> {}", result);
        return result;
    }

    @Override public NumberTypeValue visitAddSubExpr(CalculationsParser.AddSubExprContext ctx) {
        log.trace("visitAddSubExpr> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());

        var left = super.visit(ctx.left);
        var leftAsNumber = asNumber(left, String.format("Left side of '%s' add/subtract operation must be a number.", ctx.getText()));

        var right = super.visit(ctx.right);
        var rightAsNumber = asNumber(right, String.format("Right side of '%s' add/subtract operation must be a number.", ctx.getText()));

        BigDecimal r;
        if ("+".equals(ctx.op.getText())) {
            r = leftAsNumber.getValue().add(rightAsNumber.getValue());
        } else {
            r = leftAsNumber.getValue().subtract(rightAsNumber.getValue());
        }
        var result = new NumberTypeValue(r);

		log.trace("visitAddSubExpr> exit> {}", result);
        return result;
    }

    @Override public BooleanTypeValue visitBoolean(CalculationsParser.BooleanContext ctx) {
        log.trace("visitBoolean> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());

        var r = Boolean.parseBoolean(ctx.getText());

        var result = new BooleanTypeValue(r);
        log.trace("visitBoolean> exit> {}", result);
        return result;
    }

    @Override public BooleanTypeValue visitPredicateExpr(CalculationsParser.PredicateExprContext ctx) {
        log.trace("visitPredicateExpr> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());

        var left = super.visit(ctx.left);

        var right = super.visit(ctx.right);

        if (left.getClass()!=right.getClass()) {
            throw new ArithmeticException(String.format("Logical expression '%s' cannot be compared as each side if the expression has different types.", ctx.getText()));
        }

		var comparedValue = (left instanceof NumberTypeValue)
			? ((NumberTypeValue)left).getValue().compareTo(((NumberTypeValue)right).getValue())
			: left.getValue().toString().compareTo(right.getValue().toString());
        boolean r;
        switch (ctx.op.getText()) {
            case ">":
                r = comparedValue > 0;
                break;
            case ">=":
                r = comparedValue >= 0;
                break;
            case "<":
                r = comparedValue < 0;
                break;
            case "<=":
                r = comparedValue <= 0;
                break;
            case "==":
                r = comparedValue == 0;
                break;
            case "!=":
                r = comparedValue != 0;
                break;
            default:
                r = false;
        }

        var result =  new BooleanTypeValue(r);
        log.trace("visitPredicateExpr> exit> {}", result);
        return result;
    }
	@Override public NumberTypeValue visitSignedExpr(CalculationsParser.SignedExprContext ctx) {
		log.trace("visitSignedExpr> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());

		var result = super.visit((ctx.expr()));
		var resultAsNumber = asNumber(result, "Signed expressions must be numeric.");

		var signedResult = new NumberTypeValue(resultAsNumber.getValue().multiply(BigDecimal.valueOf(-1)));
		log.trace("visitSignedExpr> exit> {}", signedResult);
		return signedResult;
	}

    @Override public NumberTypeValue visitScientificAtom(CalculationsParser.ScientificAtomContext ctx) {
        log.trace("visitScientificAtom> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());

        var number = new BigDecimal(ctx.SCIENTIFIC_NUMBER().getText());

        var result = new NumberTypeValue(number);

        log.trace("visitScientificAtom> exit> {}", result);
        return result;
    }

    @Override public NumberTypeValue visitNumberAtom(CalculationsParser.NumberAtomContext ctx) {
        log.trace("visitNumberAtom> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());

        var number = new BigDecimal(ctx.NUMBER().getText());

        var result = new NumberTypeValue(number);
        log.trace("visitNumberAtom> exit> {}", result);
        return result;
    }

    @Override public DynamicTypeValue visitBracesAtom(CalculationsParser.BracesAtomContext ctx) {
        log.trace("visitBracesAtom> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());

        var result = super.visit(ctx.expr());
        log.trace("visitBracesAtom> exit> {}", result);
        return result;
    }

    @Override public DynamicTypeValue visitTokenAtom(CalculationsParser.TokenAtomContext ctx) {
        log.trace("visitTokenAtom> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());

        var name = ctx.TOKEN().getText().substring(1);
		DynamicTypeValue result;

		// first see if the provided token represents a pipeline parameters
        if (parameters.containsKey(name)) {
			result = parameters.get(name);
        }
		// if not, see if it represents a variable
		else if (variables.containsKey(name)) {
			result = variables.get(name);
		}
		// if not found anywhere, it's an error
		else {
			throw new ArithmeticException(String.format("Provided token '%s' not found as a pipeline parameter or variable.", name));
		}

        auditEvaluated.put(ctx.TOKEN().getText(), result.asString());

        log.trace("visitTokenAtom> exit> {}", result);
        return result;
    }

    @Override public StringTypeValue visitQuotedStringAtom(CalculationsParser.QuotedStringAtomContext ctx) {
        log.trace("visitQuotedStringAtom> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText(), ctx.getRuleIndex());

        var quoted = ctx.QUOTED_STRING().getText();
        String unquoted;
        if (quoted.startsWith("'") && quoted.endsWith("'")) {
            unquoted = quoted.substring(1, quoted.length() - 1);
        } else {
            unquoted = quoted;
        }

        // unescape any escaped quotes
        unquoted = unquoted.replace("\\'","'");

        var result = new StringTypeValue(unquoted);
        log.trace("visitQuotedStringAtom> exit> {}", result);
        return result;
    }

	@Override public DynamicTypeValue visitSetVariableExpr(CalculationsParser.SetVariableExprContext ctx) {
		log.trace("visitSetVariableExpr> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());

		// the provided token cannot be used if it is already representing a parameter
		var name = ctx.name.getText().substring(1);
		if (parameters.containsKey(name)) {
			throw new ArithmeticException(String.format("Provided token '%s' is already being used as a pipeline parameter.", name));
		}

		// evaluate the expression
		var result = super.visit(ctx.value);

		// assign the result to the variable
		variables.put(name, result);
		auditEvaluated.put(ctx.getText(), result.asString());

		log.trace("visitSetVariableExpr> exit> {}", result);
		return result;
	}

	@Override public DynamicTypeValue visitOptionalLocaleParam(CalculationsParser.OptionalLocaleParamContext ctx) {
		log.trace("visitOptionalLocaleParam> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());
		var result = getOptionalParamValue(OptionalParamKey.locale, ctx.expr());
		log.trace("visitOptionalLocaleParam> exit> {}", result);
		return result;
	}

	@Override public DynamicTypeValue visitOptionalQualityKindParam(CalculationsParser.OptionalQualityKindParamContext ctx) {
		log.trace("visitOptionalQualityKindParam> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());
		var result = getOptionalParamValue(OptionalParamKey.quantityKind, ctx.expr());
		log.trace("visitOptionalQualityKindParam> exit> {}", result);
		return result;
	}

	@Override public DynamicTypeValue visitOptionalTimezoneParam(CalculationsParser.OptionalTimezoneParamContext ctx) {
		log.trace("visitOptionalTimezoneParam> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());
		var result = getOptionalParamValue(OptionalParamKey.timezone, ctx.expr());
		log.trace("visitOptionalTimezoneParam> exit> {}", result);
		return result;
	}

    @Override
    public DynamicTypeValue visitOptionalRoundDownToParam(CalculationsParser.OptionalRoundDownToParamContext ctx) {
        log.trace("visitOptionalRoundDownToParam> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());
        var result = getOptionalParamValue(OptionalParamKey.roundDownTo, ctx.expr());
        log.trace("visitOptionalRoundDownToParam> exit> {}", result);
        return result;
    }

    @Override public DynamicTypeValue visitIfFunctionExpr(CalculationsParser.IfFunctionExprContext ctx) {
        log.trace("visitIfFunctionExpr> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());

        var predicate = super.visit(ctx.predicate);
        var predicateAsBool = asBoolean(predicate, String.format("Predicate '%s' must evaluate to a boolean.", ctx.getText()));

        var result = (predicateAsBool.getValue()) ? super.visit(ctx.true_) : super.visit(ctx.false_);
        log.trace("visitIfFunctionExpr> exit> {}", result);
        return result;
    }

    @Override public DynamicTypeValue visitCoalesceFunctionExpr(CalculationsParser.CoalesceFunctionExprContext ctx) {
        log.trace("visitCoalesceFunctionExpr> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());

        DynamicTypeValue result = null;
        for(var expr : ctx.exprList().expr()) {
            result = super.visit(expr);
            if (result!=null) {
                break;
            }
        }
        if (result==null) {
            result = new NullValue();
        }

        auditEvaluated.put(ctx.getText(), result.asString());

        log.trace("visitCoalesceFunctionExpr> exit> {}", result);
        return result;
    }

    @Override public StringTypeValue visitConcatFunctionExpr(CalculationsParser.ConcatFunctionExprContext ctx) {
        log.trace("visitConcatFunctionExpr> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());

        var evaluated = new StringBuilder();
        for(var expr : ctx.exprList().expr()) {
            var v = super.visit(expr);
            if (v!=null) {
                evaluated.append(v.asString());
            }
        }

        var result = new StringTypeValue(evaluated.toString());
        auditEvaluated.put(ctx.getText(), result.asString());

        log.trace("visitCoalesceFunctionExpr> exit> {}", result);
        return result;
    }

	@Override public StringTypeValue visitAssignToGroupFunctionExpr(CalculationsParser.AssignToGroupFunctionExprContext ctx) {
		log.trace("visitAssignToGroupFunctionExpr> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());

		var groupId = super.visit(ctx.groupId).asString().toLowerCase();

		// validate the group passed in actually exists
		try {
			if (!this.groupsClient.groupExists(pipelineId, executionId, groupId, groupId, authorizer)) {
				throw new GroupNotFoundException(String.format("Group passed to ASSIGN_TO_GROUP %s does not exist.", groupId));
			}
		} catch (GroupNotFoundException e) {
			throw new ArithmeticException(String.format("Group passed to ASSIGN_TO_GROUP %s does not exist.", groupId));
		}

		// the group passed in must be the same as groupContextId or a child
		var groupIdTokens = groupId.split("/");
		var groupContextIdTokens = groupContextId.split("/");
		if (groupIdTokens.length < groupContextIdTokens.length) {
			throw new ArithmeticException(String.format("The group passed to ASSIGN_TO_GROUP (%s) must be the same as or be a child of the group context of execution (%s)", groupId, groupContextId));
		}
		for(int ti=0; ti<groupContextIdTokens.length; ++ti) {
			if (!groupContextIdTokens[ti].equals(groupIdTokens[ti])) {
				throw new ArithmeticException(String.format("The group passed to ASSIGN_TO_GROUP (%s) must be the same as or be a child of the group context of execution (%s)", groupId, groupContextId));
			}
		}

		auditEvaluated.put(ctx.getText(), groupId);

		var result = new StringTypeValue(groupId);
		result.setOutputType(OutputType.groupId);
		log.trace("visitAssignToGroupFunctionExpr> exit> {}", result);
		return result;
	}

    @Override
    public DynamicTypeValue visitSplitFunctionExpr(CalculationsParser.SplitFunctionExprContext ctx) {
        log.trace("visitSplitFunctionExpr> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());

        var text = super.visit(ctx.text);
        verifyNotNullOrError(text, "Invalid text to parse.");

        var regex = super.visit(ctx.regex);
        verifyNotNullOrError(text, "Invalid regex to parse.");

		var optionalParams = getOptionalParams(ctx.optionalSplitParams());
		Optional<BigDecimal> limitParam = getOptionalParamValue(optionalParams, OptionalParamKey.limit);

		Optional<Integer> indexParam = (ctx.index!=null) ? Optional.of(Integer.parseInt(super.visit(ctx.index).asString())) : Optional.empty();

        DynamicTypeValue result;
        try {
			var splitResult = limitParam.isPresent() ? text.asString().split(regex.asString(), limitParam.get().intValue()) : text.asString().split(regex.asString()) ;
            result = indexParam.isPresent() ? newTypeValue(splitResult[indexParam.get()]) : new ObjectTypeValue(gson.toJson(splitResult));
        } catch (PatternSyntaxException | NumberFormatException e) {
            throw new ArithmeticException(e.getMessage());
        }
        auditEvaluated.put(ctx.getText(), result.asString());
        log.trace("visitSplitFunctionExpr> exit> {}", result);
        return result;
    }

    @Override
    public DynamicTypeValue visitGetValueFunctionExpr(CalculationsParser.GetValueFunctionExprContext ctx) {
        log.trace("visitGetValueFunctionExpr> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());

        var json = super.visit(ctx.json);
        verifyNotNullOrError(json, "Invalid json to parse.");

        var query = super.visit(ctx.query);
        verifyNotNullOrError(query, "Invalid query to evaluate.");

        DynamicTypeValue result;

        try {
            var queryResult = JsonPath.using(jsonConf).parse(json.asString()).read(JsonPath.compile(query.asString()));
            if (queryResult instanceof JSONArray) {
                // if JSONPath returns collection(JSONArray), iterate through the result and add it to result with ListTypeValue
                List<DynamicTypeValue> array = new ArrayList<>();
                for (int x = 0; x < ((JSONArray) queryResult).size(); x++) {
                    var value = ((JSONArray) queryResult).get(x);
                    var valueAsString = (value == null) ? null : value.toString();
                    array.add(newTypeValue(valueAsString));
                }
                result = new ListTypeValue(array);
            } else {
                // if the result is not a collection(JSONArray) return it as a String/Number/Boolean type
                var queryResultAsString = (queryResult == null) ? null : queryResult.toString();
                result = newTypeValue(queryResultAsString);
            }
        } catch (InvalidJsonException e) {
            throw new ArithmeticException("Unable to parse json: " + e.getMessage().replace("net.minidev.json.parser.ParseException: ", ""));
        } catch (Exception e) {
            throw new ArithmeticException(e.getMessage());
        }

        // Audit logs
        auditEvaluated.put(ctx.getText(), result.asString());
        log.trace("visitGetValueFunctionExpr> exit> {}", result);
        return result;
    }

    @Override public DynamicTypeValue visitOptionalGroupParam(CalculationsParser.OptionalGroupParamContext ctx) {
        log.trace("visitOptionalGroupParamContext> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());
		var result = getOptionalParamValue(OptionalParamKey.group, ctx.expr());
        log.trace("visitOptionalGroupParamContext> exit> {}", result);
        return result;
    }

	private DynamicTypeValue getOptionalParamValue(OptionalParamKey key, CalculationsParser.ExprContext expr) {
		var value = super.visit(expr);
		value.setKey(key);
		return value;
	}

    @Override public DynamicTypeValue visitOptionalTenantParam(CalculationsParser.OptionalTenantParamContext ctx) {
        log.trace("visitOptionalTenantParam> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());
		var result = getOptionalParamValue(OptionalParamKey.tenant, ctx.expr());
        log.trace("visitOptionalTenantParam> exit> {}", result);
        return result;
    }

	@Override public DynamicTypeValue visitOptionalIgnoreCaseParam(CalculationsParser.OptionalIgnoreCaseParamContext ctx) {
		log.trace("visitOptionalIgnoreCaseParam> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());
		var result = getOptionalParamValue(OptionalParamKey.ignoreCase, ctx.expr());
		log.trace("visitOptionalIgnoreCaseParam> exit> {}", result);
		return result;
	}

    @Override
    public DynamicTypeValue visitOptionalVersionAsAtParam(CalculationsParser.OptionalVersionAsAtParamContext ctx) {
        log.trace("visitOptionalVersionAsAtParam> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());
        var result = getOptionalParamValue(OptionalParamKey.versionAsAt, ctx.expr());
        log.trace("visitOptionalVersionAsAtParam> exit> {}", result);
        return result;
    }

    @Override public DynamicTypeValue visitOptionalVersionParam(CalculationsParser.OptionalVersionParamContext ctx) {
        log.trace("visitOptionalVersionParam> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());
		var result = getOptionalParamValue(OptionalParamKey.version, ctx.expr());
        log.trace("visitOptionalVersionParam> exit> {}", result);
        return result;
    }

	@Override public DynamicTypeValue visitOptionalLimitParam(CalculationsParser.OptionalLimitParamContext ctx) {
		log.trace("visitOptionalLimitParam> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());
		var result = getOptionalParamValue(OptionalParamKey.limit, ctx.expr());
		log.trace("visitOptionalLimitParam> exit> {}", result);
		return result;
	}

	@Override public DynamicTypeValue visitOptionalArrayIndexParam(CalculationsParser.OptionalArrayIndexParamContext ctx) {
		log.trace("visitOptionalArrayIndexParam> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());
		var result = getOptionalParamValue(OptionalParamKey.index, ctx.expr());
		log.trace("visitOptionalArrayIndexParam> exit> {}", result);
		return result;
	}

    @Override
    public ObjectTypeValue visitCamlFunctionExpr(CalculationsParser.CamlFunctionExprContext ctx) {
        log.trace("visitCamlFunctionExpr> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());

        var value = super.visit(ctx.value);
        verifyNotNullOrError(value, "CaML input value is not specified");

        ObjectTypeValue result;
        try {
            result = new ObjectTypeValue(gson.toJson(this.camlClient.getProductMatches(value.asString())));
        } catch (CamlNotEnabledException e) {
            throw new ArithmeticException(e.getMessage());
        }
        auditEvaluated.put(ctx.getText(), result.asString());
        log.trace("visitCamlFunctionExpr> exit> {}", result);
        return result;
    }

	@Override public DynamicTypeValue visitOptionalDefaultParam(CalculationsParser.OptionalDefaultParamContext ctx) {
		log.trace("visitOptionalDefaultParam> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());
		var result = getOptionalParamValue(OptionalParamKey.defaultValue, ctx.expr());
		log.trace("visitOptionalDefaultParam> exit> {}", result);
		return result;
	}

    @Override public NumberTypeValue visitImpactFunctionExpr(CalculationsParser.ImpactFunctionExprContext ctx) {
        log.trace("visitImpactFunctionExpr> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());

        // extract the mandatory parameters
        var activityName = super.visit(ctx.activity).asString();
        var impactName = super.visit(ctx.impact).asString();
        var componentKey = super.visit(ctx.component).asString();

        // extract any optional parameters
		var optionalParams = getOptionalParams(ctx.optionalImpactParams());
        Optional<String> groupParam = getOptionalParamValue(optionalParams, OptionalParamKey.group);
		Optional<String> tenantParam = getOptionalParamValue(optionalParams, OptionalParamKey.tenant);
		Optional<DynamicTypeValue> versionParam = getOptionalParam(optionalParams, OptionalParamKey.version);
        Optional<String> versionAsAtParam = getOptionalParamValue(optionalParams, OptionalParamKey.versionAsAt);
        var groupId = groupParam.orElse(groupContextId);

        if (versionParam.isPresent() && versionAsAtParam.isPresent()) {
            throw new ArithmeticException("Version and VersionAsAt are mutually exclusive parameters, specify one or the other.");
        }

        // retrieve the requested activity/impact/component
        Activity activity = null;
        try {
            activity = this.impactsClient.getActivity(pipelineId, executionId, groupId, authorizer, activityName, tenantParam, versionParam.map(v->v.asString()),versionAsAtParam);
        } catch (ActivityNotFoundException e) {
            throw new ArithmeticException(e.getMessage());
        } finally {
            // track what we have evaluated for the audit log
            var audit = new HashMap<>(Map.of(
                    "activity", activityName,
                    "impact", impactName,
                    "component", componentKey,
                    "group", groupId
                    ));
            tenantParam.ifPresent(v->audit.put("tenant", v));
            if (activity!=null) {
                audit.put("version", activity.getVersion().toString());
            } else if (versionParam.isPresent()) {
				audit.put("version", versionParam.get().asString());
            }
            auditActivities.add(audit);
        }

        var impact = activity.getImpacts().values().stream().filter(i-> impactName.equals(i.getName())).findFirst();
        if (impact.isEmpty()) {
            throw new ArithmeticException(String.format("Referenced activity impact '%s' not found.", impactName));
        }

        var component = impact.get().getComponents().values().stream().filter(i-> componentKey.equals(i.getKey())).findFirst();
        if (component.isEmpty()) {
            throw new ArithmeticException(String.format("Referenced activity impact component '%s' not found.", componentKey));
        }

        var result = new NumberTypeValue(component.get().getValue());

        // track what we have evaluated for the audit log
        auditEvaluated.put(ctx.getText(), result.asString());

        log.trace("visitImpactFunctionExpr> exit> {}", result);
        return result;
    }

	private Map<OptionalParamKey, DynamicTypeValue> getOptionalParams(List<? extends ParserRuleContext> paramExpressions) {
		log.trace("getOptionalParams> in> {}, parent: {}", paramExpressions.toString());
		var map = new HashMap<OptionalParamKey, DynamicTypeValue>();
		for(var expr : paramExpressions) {
			var optionalParam = super.visit(expr);
			map.put(optionalParam.getKey(), optionalParam);
		}
		log.trace("getOptionalParams> exit> {}", map);
		return map;
	}

	private <T> Optional<T> getOptionalParamValue(Map<OptionalParamKey, DynamicTypeValue> optionalParams, OptionalParamKey key) {
		return optionalParams.containsKey(key) ? Optional.of((T)optionalParams.get(key).getValue()) : Optional.empty();
	}
	private Optional<DynamicTypeValue> getOptionalParam(Map<OptionalParamKey, DynamicTypeValue> optionalParams, OptionalParamKey key) {
		return optionalParams.containsKey(key) ? Optional.of(optionalParams.get(key)) : Optional.empty();
	}

    @Override public DynamicTypeValue visitLookupFunctionExpr(CalculationsParser.LookupFunctionExprContext ctx) {
        log.trace("visitLookupFunctionExpr> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());

        // extract the mandatory parameters
        var value = super.visit(ctx.value).asString();
        var name = super.visit(ctx.name).asString();
        var outputColumn = super.visit(ctx.outputColumn).asString();
        var keyColumn = super.visit(ctx.keyColumn).asString();

        // extract any optional parameters
		var optionalParams = getOptionalParams(ctx.optionalLookupParams());
		Optional<String> groupParam = getOptionalParamValue(optionalParams, OptionalParamKey.group);
		Optional<String> tenantParam = getOptionalParamValue(optionalParams, OptionalParamKey.tenant);
		Optional<DynamicTypeValue> versionParam = getOptionalParam(optionalParams, OptionalParamKey.version);
        Optional<String> versionAsAtParam = getOptionalParamValue(optionalParams, OptionalParamKey.versionAsAt);
        var groupId = groupParam.orElse(groupContextId);

        if (versionParam.isPresent() && versionAsAtParam.isPresent()) {
            throw new ArithmeticException("Version and VersionAsAt are mutually exclusive parameters, specify one or the other.");
        }

        // retrieve the requested reference dataset value
        DatasetsClient.GetValueResponse lookupValue = null;
        try {
            lookupValue = this.datasetsClient.getValue(pipelineId, executionId, groupId, authorizer, name, value, outputColumn, keyColumn, tenantParam, versionParam.map(v->v.asString()), versionAsAtParam);
        } catch (ReferenceDatasetNotFoundException e) {
            throw new ArithmeticException(e.getMessage());
        } finally {
            // track what we have evaluated for the audit log
            var audit = new HashMap<>(Map.of(
                    "value", value,
                    "name", name,
                    "keyColumn",  keyColumn,
                    "outputColumn", outputColumn,
                    "group", groupId
            ));
            tenantParam.ifPresent(v->audit.put("tenant", v));
            if (lookupValue!=null) {
                audit.put("version", Integer.toString(lookupValue.getVersion()));
            } else {
                versionParam.ifPresent(v->audit.put("version", v.asString()));
            }
            auditReferenceDatasets.add(audit);
        }

        var result = newTypeValue(lookupValue.getValue());

        // track what we have evaluated for the audit log
        auditEvaluated.put(ctx.getText(), result.asString());

        log.trace("visitLookupFunctionExpr> exit> {}", result);
        return result;
    }

	private <T> DynamicTypeValue newTypeValue(String value) {
		DynamicTypeValue result;
		if (value==null) {
			return new NullValue();
		}
		try {
			result = new NumberTypeValue(value);
		} catch (NumberFormatException nfe) {
			if ("true".equals(value) || "false".equals(value) ) {
				result = new BooleanTypeValue(Boolean.parseBoolean(value));
			} else {
				result = new StringTypeValue(value);
			}
		}
		return result;
	}

    @Override public DynamicTypeValue visitCustomFunctionExpr(CalculationsParser.CustomFunctionExprContext ctx) {
        log.trace("visitCustomFunctionExpr> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());

        // extract the tokens we need
        var function = ctx.function.getText().substring(1);

        // evaluate any expressions provided as the parameters
        List<DynamicTypeValue> parameterValues = new ArrayList<>();
        for(var expr : ctx.exprList().expr()) {
            parameterValues.add(super.visit(expr));
        }

        // extract any optional parameters
		var optionalParams = getOptionalParams(ctx.optionalCustomParams());
		Optional<String> groupParam = getOptionalParamValue(optionalParams, OptionalParamKey.group);
		Optional<String> tenantParam = getOptionalParamValue(optionalParams, OptionalParamKey.tenant);
        Optional<DynamicTypeValue> versionParam = getOptionalParam(optionalParams, OptionalParamKey.version);
        Optional<String> versionAsAtParam = getOptionalParamValue(optionalParams, OptionalParamKey.versionAsAt);
        var groupId = groupParam.orElse(groupContextId);

        // retrieve the custom calculation definition
        Calculation calculation = null;
        try {
            calculation = this.calculationsClient.getCalculation(pipelineId, executionId, groupId, authorizer, function, tenantParam, versionParam.map(v->v.asString()), versionAsAtParam);
        } catch (CalculationNotFoundException ex) {
            throw new ArithmeticException(ex.getMessage());
        } finally {
            // track what we have evaluated for the audit log
            var audit = new HashMap<>(Map.of(
                    "function", function,
                    "group", groupId
            ));
            for(int x=0; x<parameterValues.size(); x++) {
                audit.put("arg" + x, parameterValues.get(x).asString());
            }
            tenantParam.ifPresent(v->audit.put("tenant", v));
            if (calculation!=null) {
                audit.put("version", Integer.toString(calculation.getVersion()));
            } else {
                versionParam.ifPresent(v->audit.put("version", v.asString()));
            }
            auditCalculations.add(audit);
        }

        // TODO: validate actual parameters match expected

        // build the calculations underlying expression to evaluate
        var expression = calculation.getFormula();
        for(var i=0; i<calculation.getParameters().length; i++) {
            var paramDef = calculation.getParameters()[i];
            var paramValue = parameterValues.get(i);
             var key = ":" + paramDef.getKey();
             var replaceWith = "";
             switch (paramDef.getType()) {
                 case "string":
                     replaceWith = String.format("'%s'", paramValue.asString());
                     break;
                 case "number":
                 case "boolean":
                     replaceWith = paramValue.asString();
                     break;
             }
            expression = expression.replaceAll(key, replaceWith);
        }

        var evaluateExpressionRequest = CalculatorImpl.EvaluateExpressionRequest.builder()
                .pipelineId(pipelineId)
                .executionId(executionId)
                .groupContextId(groupContextId)
                .expression(expression)
                .parameters(parameters)
                .context(context)
                .authorizer(authorizer)
                .build();
        var result = this.calculator.evaluateExpression(evaluateExpressionRequest);

        // track what we have evaluated for the audit log
        auditEvaluated.put(ctx.getText(), result.getResult().asString());
		if (result.getEvaluated()!=null) {
			auditEvaluated.putAll(result.getEvaluated());
		}
		if (result.getActivities()!=null) {
			auditActivities.addAll(result.getActivities());
		}
		if (result.getCalculations()!=null) {
			auditCalculations.addAll(result.getCalculations());
		}
		if (result.getReferenceDatasets()!=null) {
			auditReferenceDatasets.addAll(result.getReferenceDatasets());
		}

        log.trace("visitCustomFunctionExpr> exit> {}", result.getResult());
        return result.getResult();
    }

    @Override public DynamicTypeValue visitRefFunctionExpr(CalculationsParser.RefFunctionExprContext ctx) {
        log.trace("visitRefFunctionExpr> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());

        var columnName = super.visit(ctx.columnName).asString();

        DynamicTypeValue result;
        if (context==null || !context.containsKey(columnName)) {
            result = new NullValue();
        } else {
            result = context.get(columnName);
        }

        auditEvaluated.put(ctx.getText(), result.asString());

        log.trace("visitRefFunctionExpr> exit> {}", result);
        return result;
    }

    @Override public DynamicTypeValue visitNull(CalculationsParser.NullContext ctx) {
        log.trace("visitNull> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());
        log.trace("visitNull> exit> null") ;
        return null;
    }

    private LocalDateTime getCalendarQuarterDayFromDateTime(ZonedDateTime dateTime) {
        Integer quarter = ((dateTime.toLocalDate().getMonthValue()-1) / 3) + 1;
        Month month;
        switch (quarter)
        {
            case 1:
                month = Month.JANUARY;
                break;
            case 2:
                month = Month.APRIL;
                break;
            case 3:
                month = Month.JULY;
                break;
            case 4:
                month = Month.OCTOBER;
                break;
            default:
                throw new IllegalStateException("Month is not initialized when checking for quarter");
        }

        var localDateTime =  LocalDate.of(dateTime.toLocalDate().getYear(), month,1).withDayOfMonth(1).atStartOfDay();

        return localDateTime;
    }

    @Override public NumberTypeValue visitAsTimestampFunctionExpr(CalculationsParser.AsTimestampFunctionExprContext ctx) {
        log.trace("visitAsTimestampFunctionExpr> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());

        var value = super.visit(ctx.value).asString();
        var pattern = super.visit(ctx.pattern).asString();

		// extract any optional parameters
		var optionalParams = getOptionalParams(ctx.optionalAsTimestampParams());

		Optional<String> localeParam = getOptionalParamValue(optionalParams, OptionalParamKey.locale);
		var locale = localeParam.isPresent() ? Locale.forLanguageTag(localeParam.get()) : Locale.getDefault();

		Optional<String> timezoneParam = getOptionalParamValue(optionalParams, OptionalParamKey.timezone);
		var zoneId = timezoneParam.map(ZoneId::of).orElseGet(ZoneId::systemDefault);

        Optional<String> roundDownToParam = getOptionalParamValue(optionalParams, OptionalParamKey.roundDownTo);

        log.trace("visitAsTimestampFunctionExpr> extracted> value:{}, pattern:{}, locale:{}, timezone:{}, roundDownToParam:{}", value, pattern, locale, zoneId, roundDownToParam);

        var formatter = DateTimeFormatter.ofPattern(pattern, locale);

        ZonedDateTime dateTime;
        var timeFormats = List.of("H","k","K","h","m","s","S");
        if (timeFormats.stream().anyMatch(pattern::contains)) {
            // if pattern contains timezone offset and the user didn't specify a specific timezone,
            // parse with a zoned datetime to get the zone from the input value
            var timeZoneFormats = List.of("X","x","Z","z");
            if (timeZoneFormats.stream().anyMatch(pattern::contains) && timezoneParam.isEmpty()) {
                dateTime = ZonedDateTime.parse(value, formatter);
            } else {
                dateTime = LocalDateTime.parse(value, formatter).atZone(zoneId);
            }
        } else {
            var date = LocalDate.parse(value, formatter);
            dateTime = ZonedDateTime.of(date, LocalTime.MIN, zoneId);
        }

        NumberTypeValue result;
        if (roundDownToParam.isPresent()) {
            LocalDateTime localDateTime;
            switch (roundDownToParam.get()) {
                case "day":
                    localDateTime =  dateTime.toLocalDate().atStartOfDay();
                    break;
                case "week":
                    localDateTime =  dateTime.toLocalDate().atStartOfDay().with(WeekFields.of(Locale.getDefault()).dayOfWeek(), 1);
                    break;
                case "quarter":
                    localDateTime =  this.getCalendarQuarterDayFromDateTime(dateTime);
                    break;
                case "month":
                    localDateTime =  dateTime.toLocalDate().withDayOfMonth(1).atStartOfDay();
                    break;
                case "year":
                    localDateTime =  dateTime.toLocalDate().withDayOfYear(1).atStartOfDay();
                    break;
                default:
                    throw new IllegalStateException("Unexpected value: " + roundDownToParam.get());
            }
            result = new NumberTypeValue(localDateTime.toEpochSecond(dateTime.getOffset()) * 1000);

        } else {
            result = new NumberTypeValue(dateTime.toEpochSecond() * 1000);
        }

        auditEvaluated.put(ctx.getText(), result.asString());

        log.trace("visitAsTimestampFunctionExpr> exit> {}", result);
        return result;
    }

	@Override public NumberTypeValue visitConvertFunctionExpr(CalculationsParser.ConvertFunctionExprContext ctx) {
		log.trace("visitConvertFunctionExpr> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());

		var value = asNumber(super.visit(ctx.value), String.format("Provided value '%s' must be a number.", ctx.value));
		var from = super.visit(ctx.fromUnit).asString();
		var to = super.visit(ctx.toUnit).asString();

		var optionalParams = getOptionalParams(ctx.optionalConvertParams());
		Optional<String> quantityKindParam = getOptionalParamValue(optionalParams, OptionalParamKey.quantityKind);
		var quantityKind = quantityKindParam.orElse("?");

		log.trace("visitConvertFunctionExpr> value:{}, from:{}, to:{}, quantityKind:{}", value, from, to, quantityKind);

		var fromUnit = getUnit(from,quantityKind);
		var toUnit = getUnit(to, quantityKind);

		NumberTypeValue result = null;
		try {
			var quantity = new QuantityValue(value.getValue(), fromUnit);
			var converted = Qudt.convert(quantity, toUnit);
			result = new NumberTypeValue(converted.getValue());
		} catch (InconvertibleQuantitiesException e) {
			throw new ArithmeticException(e.getMessage());
		}

		auditEvaluated.put(ctx.getText(), result.asString());

		log.trace("visitConvertFunctionExpr> exit> {}", result);
		return result;
	}

	private Unit getUnit(String text, String quantityKind) {
		// see if we have a match by symbol
		var unit = Qudt.allUnits()
			// filter by symbol (case-sensitive)
			.stream().filter(u2-> text.equals(u2.getSymbol().orElse(null)))
			// then filter by quantity kind
			.filter(u1-> u1.getQuantityKinds()
				.stream().anyMatch(qk-> qk.getLabels()
					.stream().anyMatch(l-> quantityKind.equalsIgnoreCase(l.getString()))
				)
			)
			.findFirst();
		// if not found, try with its label(s) (case-insensitive)
		if (unit.isEmpty()) {
			unit = Qudt.allUnits()
				.stream().filter(u-> u.getLabels()
					.stream().anyMatch(l-> text.equalsIgnoreCase(l.getString())))
				.findFirst();
		}
		if (unit.isEmpty()) {
			throw new ArithmeticException(String.format("Unit '%s' ('%s' quantity kind) not recognized.", text, quantityKind));
		}
		log.trace("getUnit> exit:{}", unit);
		return unit.get();
	}

	@Override public DynamicTypeValue visitSwitchFunctionExpr(CalculationsParser.SwitchFunctionExprContext ctx) {
		log.trace("visitSwitchFunctionExpr> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());

		var expression = super.visit(ctx.value);
		verifyNotNullOrError(expression, "Invalid expression to evaluate.");

		// as the exprList doesn't allow us to iterate in pairs, lets copy them to a list for easier access
		var params = new ArrayList<>(ctx.exprList().expr());

		// validate we have pairs
		if (params.size()==0 || params.size() % 2 != 0) {
			throw new ArithmeticException("The SWITCH function requires a list of values to check along with their corresponding results.");
		}

		// extract any optional parameters
		var optionalParams = getOptionalParams(ctx.optionalSwitchParams());
		Optional<Boolean> ignoreCaseParam = getOptionalParamValue(optionalParams, OptionalParamKey.ignoreCase);
		boolean ignoreCase = ignoreCaseParam.orElse(false);
		Optional<String> defaultValueParam = getOptionalParamValue(optionalParams, OptionalParamKey.defaultValue);

		// let's start to assess the pairs
		DynamicTypeValue result = null;
		for (var i=0; i<params.size(); i+=2) {
			var valueToCompare = super.visit(params.get(i));
			verifyNotNullOrError(valueToCompare, String.format("Invalid value at position %s provided.", i + 1));

			if (ignoreCase && expression.asString().equalsIgnoreCase(valueToCompare.asString())
				|| (!ignoreCase && expression.asString().equals(valueToCompare.asString()))) {
				// we have a match therefore return the result
				result = super.visit(params.get(i + 1));
				break;
			}
		}

		// if we have not found a match, see if we have a default to apply
		if (result==null && defaultValueParam.isPresent()) {
			result = newTypeValue(defaultValueParam.get());
		}
		verifyNotNullOrError(result, "No possible result identified based on the provided expression to evaluate.");

		auditEvaluated.put(ctx.getText(), result.asString());

		log.trace("visitSwitchFunctionExpr> exit> {}", result);
		return result;

	}

	@Override public StringTypeValue visitUppercaseFunctionExpr(CalculationsParser.UppercaseFunctionExprContext ctx) {
		log.trace("visitUppercaseFunctionExpr> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());

		var value = asString(super.visit(ctx.value), "Evaluated value is not a string.");
		var result = new StringTypeValue(value.asString().toUpperCase());

		auditEvaluated.put(ctx.getText(), result.asString());

		log.trace("visitUppercaseFunctionExpr> exit> {}", result);
		return result;
	}

	@Override public StringTypeValue visitLowercaseFunctionExpr(CalculationsParser.LowercaseFunctionExprContext ctx) {
		log.trace("visitLowercaseFunctionExpr> in> {}, parent: {}", ctx.getText(), ctx.getParent().getText());

		var value = asString(super.visit(ctx.value), "Evaluated value is not a string.");
		var result = new StringTypeValue(value.asString().toLowerCase());

		auditEvaluated.put(ctx.getText(), result.asString());

		log.trace("visitLowercaseFunctionExpr> exit> {}", result);
		return result;
	}

    private NumberTypeValue asNumber(DynamicTypeValue value, String failureMessage) {
        if (!(value instanceof NumberTypeValue)) {
            throw new ArithmeticException( failureMessage);
        }
        return (NumberTypeValue) value;
    }

	private StringTypeValue asString(DynamicTypeValue value, String failureMessage) {
		if (!(value instanceof StringTypeValue)) {
			throw new ArithmeticException( failureMessage);
		}
		return (StringTypeValue) value;
	}

    private BooleanTypeValue asBoolean(DynamicTypeValue value, String failureMessage) {
        if (!(value instanceof BooleanTypeValue)) {
            throw new ArithmeticException( failureMessage);
        }
        return (BooleanTypeValue) value;
    }

	private void verifyNotNullOrError(DynamicTypeValue value, String failureMessage) {
		if (value==null || value instanceof NullValue || value instanceof ErrorValue) {
			throw new ArithmeticException( failureMessage);
		}
	}
}

