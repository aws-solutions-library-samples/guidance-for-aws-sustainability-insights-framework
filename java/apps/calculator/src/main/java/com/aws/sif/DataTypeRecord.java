package com.aws.sif;

import com.aws.sif.execution.DynamicTypeValue;
import lombok.Builder;
import lombok.Data;

import java.util.Map;

@Builder
@Data
public class DataTypeRecord {
    Map<String, DynamicTypeValue> values;
}
