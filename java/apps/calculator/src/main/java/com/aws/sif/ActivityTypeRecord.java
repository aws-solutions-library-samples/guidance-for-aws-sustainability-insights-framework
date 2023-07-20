package com.aws.sif;

import com.aws.sif.execution.DynamicTypeValue;
import com.aws.sif.execution.NumberTypeValue;
import com.aws.sif.execution.StringTypeValue;
import lombok.Builder;
import lombok.Data;

import java.util.Map;

@Builder
@Data
public class ActivityTypeRecord {
    NumberTypeValue time;
    String groupId;
    Map<String, DynamicTypeValue> uniqueIdColumns;
    Map<String, DynamicTypeValue> values;
    StringTypeValue auditId;
    Boolean isDeletion;
}
