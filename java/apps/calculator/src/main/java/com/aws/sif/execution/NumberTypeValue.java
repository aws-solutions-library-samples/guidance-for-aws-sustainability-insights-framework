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

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.extern.slf4j.Slf4j;
import org.jetbrains.annotations.NotNull;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;

@Slf4j
@Data
@EqualsAndHashCode(callSuper = true)
public class NumberTypeValue extends DynamicTypeValue<BigDecimal> {

    private final BigDecimal value;

	@Override
	public BigDecimal getValue() {
		// hack: force removal of scientific notation
		return new BigDecimal(value.stripTrailingZeros().toPlainString());
	}

    public NumberTypeValue(long i) {
        this.value = new BigDecimal(i, MathContext.DECIMAL64);
    }

    public NumberTypeValue(String s) {
        this.value = new BigDecimal(s, MathContext.DECIMAL64);
    }

    public NumberTypeValue(BigDecimal bd) {
        this.value = bd;
    }

    public NumberTypeValue(float f) {
        this.value = new BigDecimal(f, MathContext.DECIMAL64);
    }

    public NumberTypeValue(double d) {
        this.value = new BigDecimal(d, MathContext.DECIMAL64);
    }

    public BigDecimal Scale(int precision){
        return value.setScale(precision ,RoundingMode.FLOOR).stripTrailingZeros();
    }
}
