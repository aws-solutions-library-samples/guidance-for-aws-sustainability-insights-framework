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
import org.jetbrains.annotations.NotNull;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

@Data
@EqualsAndHashCode(callSuper = true)
public class DateTimeTypeValue extends DynamicTypeValue<OffsetDateTime> {

	private final OffsetDateTime value;

    public DateTimeTypeValue(BigDecimal bd) {
        this.value = OffsetDateTime.ofInstant(Instant.ofEpochMilli(bd.longValue()), ZoneOffset.UTC);
    }

	@Override
	public int compareTo(@NotNull DynamicTypeValue<OffsetDateTime> o) {
		return value.compareTo(o.getValue());
	}
}
