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

import com.aws.sif.execution.output.OutputType;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.Setter;
import lombok.ToString;
import org.jetbrains.annotations.NotNull;

import java.util.Comparator;

@EqualsAndHashCode
@ToString()
public abstract class DynamicTypeValue<T extends Comparable<T>> implements Comparable<DynamicTypeValue<T>>  {

	protected DynamicTypeValue() {}
	protected DynamicTypeValue(OptionalParamKey key) {
		this.key = key;
	}

	public abstract T getValue();

	public String asString() {
		if (getValue()==null) {
			return "";
		} else {
			return getValue().toString();
		}
	}

    @Getter @Setter
    private OutputType outputType;

    @Getter @Setter
    private String keyMapIndex;

	@Getter @Setter
	private OptionalParamKey key;

}
