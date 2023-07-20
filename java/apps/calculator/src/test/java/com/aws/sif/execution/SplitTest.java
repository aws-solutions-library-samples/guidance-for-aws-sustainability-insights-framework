package com.aws.sif.execution;

import com.aws.sif.Authorizer;
import com.google.gson.Gson;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;
import java.util.Set;
import java.util.regex.PatternSyntaxException;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
public class SplitTest extends CalculatorBaseTest {

    private final Authorizer AUTHORIZER = new Authorizer(GROUP_CONTEXT_ID, GROUP_CONTEXT_ID, Set.of(GROUP_CONTEXT_ID));

    private static Stream<Arguments> providerForSuccess() {
        var gson = new Gson();

        return Stream.of(
                Arguments.of("split('a,b,c',',')", EvaluateResponse.builder()
                        .result(new ObjectTypeValue(gson.toJson(new String[]{"a", "b", "c"})))
                        .evaluated(Map.of(
                                "split('a,b,c',',')", gson.toJson(new String[]{"a", "b", "c"})
                        ))
                        .build()),
                Arguments.of("split('a,b,c',',')[1]", EvaluateResponse.builder()
                        .result(new StringTypeValue("b"))
                        .evaluated(Map.of(
                                "split('a,b,c',',')[1]", "b")
                        )
                        .build()),
                Arguments.of("split('a,b,c',',', limit=2)", EvaluateResponse.builder()
                        .result(new ObjectTypeValue(gson.toJson(new String[]{"a", "b,c"})))
                        .evaluated(Map.of(
                                "split('a,b,c',',', limit=2)", gson.toJson(new String[]{"a", "b,c"})
                        ))
                        .build()),
                Arguments.of("split('a,b;c','(,|;)')", EvaluateResponse.builder()
                        .result(new ObjectTypeValue(gson.toJson(new String[]{"a", "b", "c"})))
                        .evaluated(Map.of(
                                "split('a,b;c','(,|;)')", gson.toJson(new String[]{"a", "b", "c"})
                        ))
                        .build()),
				Arguments.of("split('a,b,c',',')[1]", EvaluateResponse.builder()
						.result(new StringTypeValue("b"))
						.evaluated(Map.of(
							"split('a,b,c',',')[1]", "b"
						))
						.build()));
    }

    @ParameterizedTest
    @MethodSource("providerForSuccess")
    void evaluateSplitFunction(String expression, EvaluateResponse expected) throws PatternSyntaxException {
        var gson = new Gson();
        // set up mocks...
        when(executionVisitorProvider.get()).then(invocation -> new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient, camlClient, new Gson()));

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


}
