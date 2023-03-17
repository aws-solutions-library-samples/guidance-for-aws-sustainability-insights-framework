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
import lang.sif.CalculationsLexer;
import lang.sif.CalculationsParser;
import lombok.Builder;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.extern.slf4j.Slf4j;
import org.antlr.v4.runtime.CharStreams;
import org.antlr.v4.runtime.CodePointCharStream;
import org.antlr.v4.runtime.CommonTokenStream;

import javax.inject.Inject;
import javax.inject.Provider;
import java.util.Map;

@Slf4j
public class CalculatorImpl implements Calculator {

    private final Provider<ExecutionVisitor> executionVisitorProvider;

    private CalculationsLexer lexer;
    private CommonTokenStream tokens;
    private CalculationsParser parser;

    @Inject
    public CalculatorImpl(Provider<ExecutionVisitor> executionVisitorProvider) {
        this.executionVisitorProvider = executionVisitorProvider;
    }

    @Override
    public EvaluateResponse evaluateExpression(EvaluateExpressionRequest req) {
        log.trace("evaluateExpression> in> {}", req);
        var input = CharStreams.fromString(req.getExpression());

        initLexer(input);
        initTokenStream();
        initParser();

        var tree = parser.prog();

        var evaluateReq = EvaluateRequest.builder()
                .pipelineId(req.getPipelineId())
                .executionId(req.getExecutionId())
                .calculator(this)
                .groupContextId(req.getGroupContextId())
                .tree(tree)
                .parameters(req.getParameters())
                .context(req.getContext())
                .authorizer(req.authorizer)
                .build();

        return executionVisitorProvider.get().evaluate(evaluateReq);
    }

    private void initParser() {
        if (parser==null) {
            parser = new CalculationsParser(tokens);
            parser.removeErrorListeners();
            parser.addErrorListener(ParserErrorListener.INSTANCE);
        } else {
            parser.setTokenStream(tokens);
        }
    }

    private void initTokenStream() {
        if (tokens==null) {
            tokens = new CommonTokenStream(lexer);
        } else {
            tokens.setTokenSource(lexer);
        }
    }

    private void initLexer(CodePointCharStream input) {
        if (lexer==null) {
            lexer = new CalculationsLexer(input);
            lexer.removeErrorListeners();
            lexer.addErrorListener(ParserErrorListener.INSTANCE);
        } else {
            lexer.setInputStream(input);
        }
    }

    @Builder
    @Data
    public static class EvaluateExpressionRequest {
        private String pipelineId;
        private String executionId;
        private String groupContextId;
        private String expression;
        private Map<String, DynamicTypeValue> parameters;
        private Map<String, DynamicTypeValue> context;
        private Authorizer authorizer;
    }
}
