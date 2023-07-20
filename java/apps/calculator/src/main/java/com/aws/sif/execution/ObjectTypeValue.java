package com.aws.sif.execution;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.ToString;
import org.jetbrains.annotations.NotNull;

@Data
@EqualsAndHashCode(callSuper = true)
@ToString(callSuper = true)
public class ObjectTypeValue extends DynamicTypeValue<String> {
    private final String value;
}
