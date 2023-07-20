package com.aws.sif.execution.output;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

public interface OutputWriter<T> {
    void init(String pipelineId, String executionId, int chunkNo, Map<String, String> outputMap) throws IOException;

    CompletableFuture<Void> addRecord(T record) throws IOException;

    void submit() throws IOException;
}
