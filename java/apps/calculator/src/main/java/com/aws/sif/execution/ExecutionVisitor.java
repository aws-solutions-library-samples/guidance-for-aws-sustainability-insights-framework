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

import lang.sif.CalculationsParser;
import lang.sif.CalculationsVisitor;

public interface ExecutionVisitor extends CalculationsVisitor<DynamicTypeValue> {
    EvaluateResponse evaluate(EvaluateRequest req);

    @Override
    NumberTypeValue visitPowerExpr(CalculationsParser.PowerExprContext ctx);

    @Override
    NumberTypeValue visitMulDivExpr(CalculationsParser.MulDivExprContext ctx);

    @Override
    NumberTypeValue visitAddSubExpr(CalculationsParser.AddSubExprContext ctx);

    @Override
    BooleanTypeValue visitBoolean(CalculationsParser.BooleanContext ctx);

    @Override
    BooleanTypeValue visitPredicateExpr(CalculationsParser.PredicateExprContext ctx);

    @Override
    NumberTypeValue visitSignedExpr(CalculationsParser.SignedExprContext ctx);

    @Override
    NumberTypeValue visitScientificAtom(CalculationsParser.ScientificAtomContext ctx);

    @Override
    NumberTypeValue visitNumberAtom(CalculationsParser.NumberAtomContext ctx);

    @Override
    DynamicTypeValue visitBracesAtom(CalculationsParser.BracesAtomContext ctx);

    @Override
    DynamicTypeValue visitTokenAtom(CalculationsParser.TokenAtomContext ctx);

    @Override
    StringTypeValue visitQuotedStringAtom(CalculationsParser.QuotedStringAtomContext ctx);

    @Override
	DynamicTypeValue visitOptionalLocaleParam(CalculationsParser.OptionalLocaleParamContext ctx);

    @Override
	DynamicTypeValue visitOptionalTimezoneParam(CalculationsParser.OptionalTimezoneParamContext ctx);

    @Override
    DynamicTypeValue visitIfFunctionExpr(CalculationsParser.IfFunctionExprContext ctx);

    @Override
    DynamicTypeValue visitCoalesceFunctionExpr(CalculationsParser.CoalesceFunctionExprContext ctx);

    @Override
    DynamicTypeValue visitImpactFunctionExpr(CalculationsParser.ImpactFunctionExprContext ctx);

    @Override
    DynamicTypeValue visitLookupFunctionExpr(CalculationsParser.LookupFunctionExprContext ctx);

    @Override
    DynamicTypeValue visitCustomFunctionExpr(CalculationsParser.CustomFunctionExprContext ctx);

    @Override
    ObjectTypeValue visitCamlFunctionExpr(CalculationsParser.CamlFunctionExprContext ctx);

    @Override
    DynamicTypeValue visitRefFunctionExpr(CalculationsParser.RefFunctionExprContext ctx);

    @Override
    DynamicTypeValue visitNull(CalculationsParser.NullContext ctx);

    @Override
    NumberTypeValue visitAsTimestampFunctionExpr(CalculationsParser.AsTimestampFunctionExprContext ctx);

	@Override
	DynamicTypeValue visitSwitchFunctionExpr(CalculationsParser.SwitchFunctionExprContext ctx);

	@Override
	DynamicTypeValue visitSetVariableExpr(CalculationsParser.SetVariableExprContext ctx);
}
