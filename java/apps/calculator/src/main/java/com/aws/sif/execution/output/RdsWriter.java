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
package com.aws.sif.execution.output;

import com.aws.sif.audits.AuditMessage;
import com.aws.sif.execution.*;
import com.aws.sif.execution.output.exceptions.PipelineOutputException;
import com.aws.sif.execution.output.exceptions.TimeoutExpiredException;
import com.typesafe.config.Config;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.RandomUtils;
import org.apache.commons.lang3.StringUtils;
import org.apache.commons.lang3.Validate;

import javax.annotation.Nonnull;
import javax.annotation.concurrent.GuardedBy;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.*;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
public class RdsWriter {
    private final RdsConnection rdsConnection;

    private final Config config;

    /** config... */
    private final int maxBufferSize;
    private final long maxOperationTimeoutInMillis;
    private final long bufferFullWaitTimeoutInMillis;
    private final long bufferTimeoutInMillis;
    private final long bufferTimeoutBetweenFlushes;
    private final int numberOfRetries;
    private final long maxBackOffInMillis;
    private final long baseBackOffInMillis;
    private final String activityTable;
    private final String activityStringValueTable;
    private final String activityNumberValueTable;
    private final String activityBooleanValueTable;
    private final String activityDateTimeValueTable;
    // context
    private String groupId;
    private String pipelineId;
    private String executionId;
    private Map<String, String> outputMap;

    /** Scheduler service responsible for flushing the producer Buffer pool */
    private final ExecutorService flusher;

    /** Object lock responsible for guarding the producer Buffer pool */
    @GuardedBy("this")
    private final Object producerBufferLock = new Object();

    /** Producer Buffer pool */
    private volatile Queue<PreparedStatement> producerBuffer;

    /** Flusher Buffer pool */
    private volatile Queue<PreparedStatement> flusherBuffer;

    /**
     * A timestamp responsible to store the last timestamp after the flusher thread has been
     * performed
     */
    private volatile long lastSucceededFlushTimestamp;

    /** Reports if the Firehose Producer was destroyed, shutting down the flusher thread. */
    private volatile boolean isDestroyed;

    /**
     * A sentinel flag to notify the flusher thread to flush the buffer immediately. This flag
     * should be used only to request a flush from the caller thread through the {@link #flush()}
     * method.
     */
    private volatile boolean syncFlush;

    /** A flag representing if the Flusher thread has failed. */
    private volatile boolean isFlusherFailed;


    public RdsWriter(RdsConnection rdsConnection, Config config) {
        this.rdsConnection = rdsConnection;
        this.config = config;
        this.activityTable = config.getString("calculator.processed.table.activity");
        this.activityStringValueTable =
                config.getString("calculator.processed.table.activityStringValue");
        this.activityNumberValueTable =
                config.getString("calculator.processed.table.activityNumberValue");
        this.activityBooleanValueTable =
                config.getString("calculator.processed.table.activityBooleanValue");
        this.activityDateTimeValueTable =
                config.getString("calculator.processed.table.activityDateTimeValue");

        this.maxBufferSize = config.getInt("calculator.processed.maxBufferSize");
        this.maxOperationTimeoutInMillis =
                config.getLong("calculator.processed.maxOperationTimeoutInMillis");
        this.bufferFullWaitTimeoutInMillis =
                config.getLong("calculator.processed.bufferFullWaitTimeoutInMillis");
        this.bufferTimeoutInMillis = config.getLong("calculator.processed.bufferTimeoutInMillis");
        this.bufferTimeoutBetweenFlushes =
                config.getLong("calculator.processed.bufferTimeoutBetweenFlushes");
        this.numberOfRetries = config.getInt("calculator.processed.numberOfRetries");
        this.maxBackOffInMillis = config.getLong("calculator.processed.maxBackOffInMillis");
        this.baseBackOffInMillis = config.getInt("calculator.processed.baseBackOffInMillis");

        this.producerBuffer = new ArrayDeque<>(maxBufferSize);
        this.flusherBuffer = new ArrayDeque<>(maxBufferSize);

        flusher = Executors.newSingleThreadExecutor(new RdsWriterThreadFactory());
        flusher.submit(this::flushBuffer);
    }

    public void init(String groupId, String pipelineId, String executionId,
            Map<String, String> outputMap) {

        this.flushSync();

        this.groupId = groupId;
        this.pipelineId = pipelineId;
        this.executionId = executionId;
        this.outputMap = outputMap;
    }

    public CompletableFuture<Void> addRecord(final NumberTypeValue time,
            final Map<String, DynamicTypeValue> uniqueIdColumns,
            final Map<String, DynamicTypeValue> values, final StringTypeValue auditId)
            throws TimeoutExpiredException, InterruptedException {
        return addRecord(time, uniqueIdColumns, values, maxOperationTimeoutInMillis, auditId);
    }

    public CompletableFuture<Void> addRecord(final NumberTypeValue time,
            final Map<String, DynamicTypeValue> uniqueIdColumns,
            final Map<String, DynamicTypeValue> values, final long timeoutInMillis, final StringTypeValue auditId)
            throws TimeoutExpiredException, InterruptedException {
        log.debug("addRecord> in> time:{}, uniqueIdColumns: {}, values:{}, auditId: {}", time, uniqueIdColumns,
                values, auditId);

        Validate.notNull(time, "Time cannot be null.");
        Validate.notNull(uniqueIdColumns, "Unique id columns cannot be null.");
        Validate.notNull(values, "Values cannot be null.");

        long operationTimeoutInNanos = TimeUnit.MILLISECONDS.toNanos(timeoutInMillis);

        synchronized (producerBufferLock) {
            /*
             * This happens whenever the current thread is trying to write, however, the Producer
             * Buffer is full. This guarantees if the writer thread is already running, should wait.
             * In addition, implements a kind of back pressure mechanism with a bailout condition,
             * so we don't incur in cases where the current thread waits forever.
             */
            long lastTimestamp = System.nanoTime();
            while (producerBuffer.size() >= maxBufferSize) {
                if ((System.nanoTime() - lastTimestamp) >= operationTimeoutInNanos) {
                    throw new TimeoutExpiredException(
                            "Timeout has expired for the given operation");
                }

                /*
                 * If the buffer is filled and the flusher isn't running yet, we notify to wake up
                 * the flusher
                 */
                if (flusherBuffer.isEmpty()) {
                    producerBufferLock.notify();
                }
                producerBufferLock.wait(bufferFullWaitTimeoutInMillis);
            }

            var statement = buildInsertStatement(time, uniqueIdColumns, values, auditId);
            producerBuffer.offer(statement);

            /*
             * If the buffer was filled up right after the last insertion we would like to wake up
             * the flusher thread and send the buffered data to RDS as soon as possible
             */
            if (producerBuffer.size() >= maxBufferSize && flusherBuffer.isEmpty()) {
                producerBufferLock.notify();
            }
        }

        log.debug("addRecord> exit:");
        return CompletableFuture.completedFuture(null);
    }

    private PreparedStatement buildInsertStatement(NumberTypeValue time,
            Map<String, DynamicTypeValue> uniqueIdColumns, Map<String, DynamicTypeValue> values, final StringTypeValue auditId) {
        log.debug("buildInsertStatement> in> time:{}, uniqueIdColumns: {}, values:{}, outputMap:{}, auditId:{}", time,
                uniqueIdColumns, values, outputMap, auditId);
        Connection connection = rdsConnection.getConnection(this.config);

        PreparedStatement result = null;
        try {
            String uniqueInsertId = UUID.randomUUID().toString();
            StringBuffer insertQuery = new StringBuffer("");
            if (outputMap.size() > 0) {
                insertQuery.append(String.format("with \"%s\" as (", uniqueInsertId));
            }
            insertQuery.append(String.format("INSERT INTO \"%s\""
                    + "(\"groupId\", \"pipelineId\", \"date\", \"type\", \"key1\", \"key2\", \"key3\", \"key4\", \"key5\")"
                    + " VALUES (?, ?, to_timestamp(?), ?, ?, ? ,?, ?, ?)"
                    + " ON CONFLICT (\"groupId\", \"pipelineId\", \"date\", \"type\", \"key1\", \"key2\", \"key3\", \"key4\", \"key5\")"
                    + " DO UPDATE SET \"groupId\" = EXCLUDED.\"groupId\"", this.activityTable));

            // Append the insert statement for the values to the query string
            StringBuffer valuesQuery =
                    buildValuesInsertStatement(uniqueInsertId, uniqueIdColumns, values, auditId);
            insertQuery.append(valuesQuery);

            PreparedStatement insertStatement = connection.prepareStatement(insertQuery.toString());
            insertStatement.setString(1, groupId);
            insertStatement.setString(2, pipelineId);
            insertStatement.setBigDecimal(3,
                    time.getValue().divide(new BigDecimal(1000), RoundingMode.HALF_UP));
            insertStatement.setString(4, "raw");

            // key1 - key5 columns in Activity table are used to extend the uniqueness key to be
            // greater than just
            // (groupId, pipelineId, time). If multiple values are run through with the same time
            // but are actually
            // different values (from different zipcodes) the user can tag a column as to be
            // included as a unique key.
            //
            // There will be 0-5 entries in the uniqueIdColumns map which define which outputs
            // should be written as unique keys.
            // The map will be keyed by output key name from the transform (zipcode, kwh, etc.)
            // the entry value will include the column mapping -->
            // uniqueIdColumns.get("zipcode").getKeyMapIndex()
            // the column mapping will be the column name to use in the Activity table ("key1",
            // "key2", etc...)

            // Below we are defaulting key1-key5 to sif-null-value to work with the unique
            // constraint
            // and ON CONFLICT features. This allows us to consider activities with the same values
            // across
            // "groupId", "pipelineId", "date", "key1", "key2", "key3", "key4", "key5" to be unique.
            //
            // Note: postgres v15 has a NULL NOT DISTINCT clause that tells the database every NULL
            // value is the same
            // and therefore consider them to violate the uniqueness constraint. But...
            // We are currently targeting v14 (latest currently supported in Aurora Serverless v2)
            //
            // Workaround for v14 is creating our own "null" value which has little chance
            // of colliding with a user value (`sif-null-value` versus just using an empty string
            // ``)
            // More info on unique constraints on values that could be NULL:
            // https://stackoverflow.com/questions/8289100/create-unique-constraint-with-null-columns

            insertStatement.setString(5, "___NULL___");
            insertStatement.setString(6, "___NULL___");
            insertStatement.setString(7, "___NULL___");
            insertStatement.setString(8, "___NULL___");
            insertStatement.setString(9, "___NULL___");

            // Map of key names to their insert offset
            Map<String, Integer> keyOffsets = Map.of("key1", 5, "key2", 6, "key3", 7, "key4", 8, "key5", 9);

            // map uniqueIdColumns to map with key1,key2,etc. as the keys and their values
            Map<String, String> uniqueKeys = uniqueIdColumns.entrySet().stream().collect(Collectors
                    .toMap(e -> e.getValue().getKeyMapIndex(), e -> e.getValue().asString()));
            log.debug("buildInsertStatement> uniqueKeys:{}", uniqueKeys);

            uniqueKeys.forEach((key, value) -> {
                try {
                    insertStatement.setString(keyOffsets.get(key), value);
                } catch (SQLException sqlE) {
                    throw new RuntimeException(sqlE);
                }
            });

            int indexCount = StringUtils.countMatches(insertQuery, "?");
            for (int count = 10; count <= indexCount; count++) {
                insertStatement.setString(count, executionId);
            }
            result = insertStatement;
        } catch (SQLException e) {
            log.error("SQLException information");
            while (e != null) {
                log.error("Error msg: " + e.getMessage());
                e = e.getNextException();
            }
        }
        log.debug("buildInsertStatement> exit:{}", result);
        return result;
    }

    /*
     * Creates the queryStrings needed to insert the values Need to test out if using with is the
     * best way of inserting these records it reduces the number of calls needed to insert all the
     * records but it is more rigid
     */
    private StringBuffer buildValuesInsertStatement(String activityInsertId,
            Map<String, DynamicTypeValue> uniqueIdColumns, Map<String, DynamicTypeValue> values, final StringTypeValue auditId) {
        log.debug("buildValuesInsertStatement> in> uniqueIdColumns:{}, values:{}, outputMap:{}, auditId: {}",
                uniqueIdColumns, values, outputMap, auditId);
        StringBuffer valuesInsertStatement = new StringBuffer("");
        int numberOfValues = outputMap.size();
        int count = 0;
        ArrayList<String> uniqueIds = new ArrayList<String>();
        uniqueIds.add(activityInsertId);


        // All values for a given activity write should have the same createdAt time
        Double createdAt = (double) Instant.now().toEpochMilli() / 1000;
        
        String auditIdSql =  String.format("\'%s\'", auditId.getValue());

        for (String key : outputMap.keySet()) {
            count++;

            DynamicTypeValue value = values.getOrDefault(key, new NullValue());

            String type = outputMap.get(key);
            String tableName;
            String valueSql = null;

            if (count < numberOfValues) {
                String uniqueId = UUID.randomUUID().toString();
                uniqueIds.add(uniqueId);
                valuesInsertStatement
                        .append(String.format(" Returning \"activityId\"), \"%s\" AS (", uniqueId));
            } else {
                valuesInsertStatement.append(" Returning \"activityId\")");
            }


            switch (type.trim()) {
                case "number":
                    tableName = this.activityNumberValueTable;
                    valueSql = (value instanceof NullValue || value instanceof ErrorValue) ? null
                            : String.format("%.8f", ((NumberTypeValue) value).getValue());
                    break;
                case "boolean":
                    tableName = this.activityBooleanValueTable;
                    valueSql = (value instanceof NullValue || value instanceof ErrorValue) ? null
                            : value.asString();
                    break;
                case "timestamp":
                    tableName = this.activityDateTimeValueTable;
                    valueSql = (value instanceof NullValue || value instanceof ErrorValue) ? null
                            : String.format("to_timestamp(\'%.3f\')",
                            ((NumberTypeValue) value).getValue().divide(new BigDecimal(1000), RoundingMode.HALF_UP));
                    break;
                default:
                    tableName = this.activityStringValueTable;
                    valueSql = (value instanceof NullValue) ? null
                            : String.format("\'%s\'", value.asString());
            }

            boolean error = false;
            String errorMessage = null;
            if (value instanceof ErrorValue) {
                error = true;
                errorMessage = (value instanceof NullValue) ? null
                        : String.format("\'%s\'",
                        ((ErrorValue) value).getErrorMessage().replaceAll("'", "''"));
            }

             valuesInsertStatement.append(String.format(
            "INSERT INTO \"%s\"(\"activityId\", \"name\", \"createdAt\", \"executionId\", \"val\", \"auditId\", \"error\", \"errorMessage\") VALUES ((SELECT \"activityId\" from \"%s\"), \'%s\', to_timestamp(\'%.3f\'), ? , %s, %s , %s, %s)",
                tableName, activityInsertId, key, createdAt, valueSql, auditIdSql, error, errorMessage));

        }

        log.debug("buildValuesInsertStatement> exit> valuesInsertStatement: {}",
                valuesInsertStatement);
        return valuesInsertStatement;
    }

    /**
     * This method runs in a background thread responsible for flushing the Producer Buffer in case
     * the buffer is full, not enough records into the buffer and timeout has expired or flusher
     * timeout has expired. If an unhandled exception is thrown the flusher thread should fail,
     * logging the failure. However, this behavior will block the producer to move on until hit the
     * given timeout and throw {@code {@link TimeoutExpiredException}}
     */
    private void flushBuffer() {
        log.debug("flushBuffer> in>");

        lastSucceededFlushTimestamp = System.nanoTime();
        long bufferTimeoutInNanos = TimeUnit.MILLISECONDS.toNanos(bufferTimeoutInMillis);
        boolean timeoutFlush;

        while (true) {
            timeoutFlush =
                    (System.nanoTime() - lastSucceededFlushTimestamp) >= bufferTimeoutInNanos;

            synchronized (producerBufferLock) {

                /*
                 * If the flusher buffer is not empty at this point we should fail, otherwise we
                 * would end up looping forever since we are swapping references
                 */
                Validate.validState(flusherBuffer.isEmpty());

                if (isDestroyed) {
                    return;
                } else if (syncFlush || (producerBuffer.size() >= maxBufferSize
                        || (timeoutFlush && producerBuffer.size() > 0))) {
                    prepareRecordsToSubmit(producerBuffer, flusherBuffer);
                    producerBufferLock.notify();
                } else {
                    try {
                        producerBufferLock.wait(bufferTimeoutBetweenFlushes);
                    } catch (InterruptedException e) {
                        log.warn(
                                "flushBuffer> An interrupted exception has been thrown, while trying to sleep and release the lock during a flush.",
                                e);
                    }
                    continue;
                }
            }
            /*
             * It's OK calling {@code submitBatchWithRetry} outside the critical section because
             * this method does not make any changes to the object and the producer thread does not
             * make any modifications to the flusherBuffer. The only agent making changes to
             * flusherBuffer is the flusher thread.
             */
            try {
                submitBatchWithRetry(flusherBuffer);

                Queue<PreparedStatement> emptyFlushBuffer = new ArrayDeque<>(maxBufferSize);
                synchronized (producerBufferLock) {
                    /*
                     * We perform a swap at this point because {@code ArrayDeque<>.clear()} iterates
                     * over the items nullifying the items, and we would like to avoid such
                     * iteration just swapping references.
                     */
                    Validate.validState(!flusherBuffer.isEmpty());
                    flusherBuffer = emptyFlushBuffer;

                    if (syncFlush) {
                        syncFlush = false;
                        producerBufferLock.notify();
                    }
                }

            } catch (Exception ex) {
                String errorMsg = "An error has occurred while trying to send data to RDS.";

                log.error("flushBuffer> " + errorMsg, ex);

                synchronized (producerBufferLock) {
                    isFlusherFailed = true;
                }

                throw ex;
            }
        }
    }

    /**
     * Populates the target queue with messages from the source queue. Up to the maximum capacity
     * defined by {@code maxPutRecordBatchBytes}.
     */
    private void prepareRecordsToSubmit(@Nonnull final Queue<PreparedStatement> sourceQueue,
            @Nonnull final Queue<PreparedStatement> targetQueue) {
        log.debug("prepareRecordsToSubmit> in> sourceQueue.size:{}, targetQueue.size:{}",
                sourceQueue.size(), targetQueue.size());
        int total = 0;
        while (!sourceQueue.isEmpty() && (total + 1) <= maxBufferSize) {
            total += 1;
            targetQueue.add(sourceQueue.poll());
        }
        log.debug("prepareRecordsToSubmit> exit:");
    }

    private void submitBatchWithRetry(final Queue<PreparedStatement> statements) {
        log.debug("submitBatchWithRetry> in> statements.size:{}, statements:{}", statements.size(),
                statements);

        Integer lastResult;
        for (int attempts = 0; attempts < numberOfRetries; attempts++) {
            try {
                log.debug("submitBatchWithRetry> Trying to flush Buffer of size: {} on attempt: {}",
                        statements.size(), attempts);

                lastResult = submitBatch(statements);

                if (lastResult == statements.size()) {
                    lastSucceededFlushTimestamp = System.nanoTime();
                    log.debug(
                            "submitBatchWithRetry> RDS buffer has been flushed with size: {} on attempt: {}",
                            statements.size(), attempts);
                    return;
                }

                // Full Jitter:
                // https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
                long timeToSleep = RandomUtils.nextLong(0,
                        Math.min(maxBackOffInMillis, (baseBackOffInMillis * 2 * attempts)));
                log.debug("submitBatchWithRetry> Sleeping for: {}ms on attempt: {}", timeToSleep,
                        attempts);
                Thread.sleep(timeToSleep);

            } catch (InterruptedException e) {
                log.error(
                        "submitBatchWithRetry> An interrupted exception has been thrown between retry attempts.",
                        e);
            }
        }
    }

    /**
     * Sends the actual batch of statements to Aurora
     *
     * @param statements a Collection of statement and audit message pair
     * @return {@code PutRecordBatchResult}
     */
    private Integer submitBatch(final Queue<PreparedStatement> statements) {
        log.debug("submitBatch> in> statements.size:{}", statements.size());


        // TODO: need to figure out return value (successful statements processed?)
        // TODO: this should batch writes
        // TODO: retries?
        statements.forEach(s -> {
            try {
                // Execute insert statement
                s.execute();
            } catch (SQLException e) {
                log.error("submitBatch> Failed: " + e.getMessage(), e);
                throw new RuntimeException(e);
            } catch (Exception e) {
                log.error("submitBatch> Failed: " + e.getMessage(), e);
                throw new RuntimeException(e);
            }
        });

        return statements.size();
    }

    /**
     * Make sure that any pending scheduled thread terminates before closing as well as cleans the
     * producerBuffer pool, allowing GC to collect.
     */
    public void destroy() throws Exception {
        log.debug("destroy> in>");

        synchronized (producerBufferLock) {
            isDestroyed = true;
            producerBuffer = null;
            producerBufferLock.notify();
        }

        if (!flusher.isShutdown() && !flusher.isTerminated()) {
            log.debug("destroy> Shutting down scheduled service.");
            flusher.shutdown();
            try {
                log.debug("destroy> Awaiting executor service termination...");
                flusher.awaitTermination(1L, TimeUnit.MINUTES);
            } catch (InterruptedException e) {
                final String errorMsg = "Error waiting executor writer termination.";
                log.error("destroy> " + errorMsg, e);
                throw new PipelineOutputException(errorMsg, e);
            }
        }
    }

    public boolean isDestroyed() {
        synchronized (producerBufferLock) {
            return isDestroyed;
        }
    }

    public int getOutstandingRecordsCount() {
        synchronized (producerBufferLock) {
            return producerBuffer.size() + flusherBuffer.size();
        }
    }

    public boolean isFlushFailed() {
        synchronized (producerBufferLock) {
            return isFlusherFailed;
        }
    }

    /**
     * This method instructs the flusher thread to perform a flush on the buffer without waiting for
     * completion.
     * <p>
     * This implementation does not guarantee the whole buffer is flushed or if the flusher thread
     * has completed the flush or not. In order to flush all records and wait until completion, use
     * {@code {@link #flushSync()}}
     * </p>
     */
    public void flush() {
        synchronized (producerBufferLock) {
            syncFlush = true;
            producerBufferLock.notify();
        }
    }

    /**
     * This method instructs the flusher thread to perform the flush on the buffer and wait for the
     * completion.
     * <p>
     * This implementation is useful once there is a need to guarantee the buffer is flushed before
     * making further progress. i.e. Shutting down the producer. i.e. Taking synchronous snapshots.
     * </p>
     * The caller needs to make sure to assert the status of {@link #isFlushFailed()} in order
     * guarantee whether the flush has successfully completed or not.
     */

    public void flushSync() {
        log.debug("flushSync> in>");
        while (getOutstandingRecordsCount() > 0 && !isFlushFailed()) {
            flush();
            try {
                Thread.sleep(500);
            } catch (InterruptedException e) {
                log.warn(
                        "flushSync> An interruption has happened while trying to flush the buffer synchronously.");
                Thread.currentThread().interrupt();
            }
        }

        if (isFlushFailed()) {
            log.warn(
                    "flushSync> The flusher thread has failed trying to synchronously flush the buffer.");
        }
    }
}
