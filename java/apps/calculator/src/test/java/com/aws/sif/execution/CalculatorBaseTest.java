
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

import com.aws.sif.resources.caml.CamlClient;
import com.aws.sif.resources.groups.GroupsClient;
import com.aws.sif.resources.impacts.ImpactsClient;
import com.aws.sif.resources.calculations.CalculationsClient;
import com.aws.sif.resources.referenceDatasets.DatasetsClient;
import com.google.gson.Gson;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import javax.inject.Provider;


@ExtendWith(MockitoExtension.class)
public abstract class CalculatorBaseTest {

    @Mock protected CalculationsClient calculationsClient;
    @Mock protected DatasetsClient datasetsClient;
	@Mock protected GroupsClient groupsClient;
    @Mock protected ImpactsClient impactsClient;
    @Mock protected Gson gson;
    @Mock protected CamlClient camlClient;
    @Mock protected Provider<ExecutionVisitor> executionVisitorProvider;
	protected Calculator underTest;

	protected final String PIPELINE_ID = "pipe1";
	protected final String EXECUTION_ID = "run1";
	protected final String GROUP_CONTEXT_ID = "/test";

    @BeforeEach
    public void initEach(){
        underTest = new CalculatorImpl(executionVisitorProvider);
    }

}
