package com.aws.sif.execution;

import com.aws.sif.Authorizer;
import com.aws.sif.resources.caml.CamlNotEnabledException;
import com.aws.sif.resources.caml.ProductMatch;
import com.google.gson.Gson;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
public class CamlTest extends CalculatorBaseTest {

    private final Authorizer AUTHORIZER = new Authorizer(GROUP_CONTEXT_ID, GROUP_CONTEXT_ID, Set.of(GROUP_CONTEXT_ID));

    @Test
    void evaluateCamlFunction() throws CamlNotEnabledException {
        var gson = new Gson();
        var productName = "testproduct";
        var expression = "caml('" + productName + "')";
        var expected = EvaluateResponse.builder()
                .result(new ObjectTypeValue(gson.toJson(stubProductMatchList())))
                .evaluated(Map.of(
                        expression, gson.toJson(stubProductMatchList())
                ))
                .build();

        // set up mocks...
        when(executionVisitorProvider.get()).then(invocation -> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient, camlClient, new Gson()));
        when(camlClient.getProductMatches(productName))
                .thenReturn(stubProductMatchList());

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

    private ProductMatch[] stubProductMatchList() {
        return new ProductMatch[]{
                new ProductMatch("product1", "111", "xxx", 0.8, 2.0),
                new ProductMatch("product2", "222", "yyy", 0.1, 5.0)
        };
    }

}