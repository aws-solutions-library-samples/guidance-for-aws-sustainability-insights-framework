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

package com.aws.sif.audits;

import com.aws.sif.audits.exceptions.AuditDeliveryStreamException;
import com.aws.sif.audits.exceptions.RecordCouldNotBeSentException;
import com.aws.sif.audits.exceptions.TimeoutExpiredException;
import com.typesafe.config.Config;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.RandomUtils;
import org.apache.commons.lang3.Validate;

import software.amazon.awssdk.services.kinesis.KinesisAsyncClient;
import software.amazon.awssdk.services.kinesis.model.PutRecordsRequest;
import software.amazon.awssdk.services.kinesis.model.PutRecordsRequestEntry;
import software.amazon.awssdk.services.kinesis.model.PutRecordsResponse;
import software.amazon.awssdk.services.kinesis.model.PutRecordsResultEntry;
import software.amazon.awssdk.services.kinesis.model.KinesisException;


import javax.annotation.Nonnull;
import javax.annotation.concurrent.GuardedBy;
import javax.annotation.concurrent.ThreadSafe;
import java.util.ArrayDeque;
import java.util.Queue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Slf4j
@ThreadSafe
public class DataStreamProducer {
    private final KinesisAsyncClient kinesisClient;

    /**  config...  */
    private final int maxBufferSize;
    private final long maxOperationTimeoutInMillis;
    private final long bufferFullWaitTimeoutInMillis;
    private final long bufferTimeoutInMillis;
    private final long bufferTimeoutBetweenFlushes;
    private final int maxPutRecordBatchBytes;
    private final int numberOfRetries;
    private final long maxBackOffInMillis;
    private final long baseBackOffInMillis;
    private final String dataStreamName;
	private  String partitionKey;



    /** Scheduler service responsible for flushing the producer Buffer pool */
    private final ExecutorService flusher;

    /** Object lock responsible for guarding the producer Buffer pool */
    @GuardedBy("this")
    private final Object producerBufferLock = new Object();

    /** Producer Buffer pool */
    private volatile Queue<AuditMessageBlob> producerBuffer;

    /** Flusher Buffer pool */
    private volatile Queue<AuditMessageBlob> flusherBuffer;

    /** A timestamp responsible to store the last timestamp after the flusher thread has been performed */
    private volatile long lastSucceededFlushTimestamp;

    /** Reports if the DataStream Producer was destroyed, shutting down the flusher thread. */
    private volatile boolean isDestroyed;

    /** A sentinel flag to notify the flusher thread to flush the buffer immediately.
     * This flag should be used only to request a flush from the caller thread through the {@link #flush()} method. */
    private volatile boolean syncFlush;

    /** A flag representing if the Flusher thread has failed. */
    private volatile boolean isFlusherFailed;

    public DataStreamProducer(KinesisAsyncClient kinesisClient, Config config ) {
        this.kinesisClient = kinesisClient;
        this.maxBufferSize = config.getInt("calculator.audits.kinesis.maxBufferSize");
        this.maxOperationTimeoutInMillis = config.getLong("calculator.audits.kinesis.maxOperationTimeoutInMillis");
        this.bufferFullWaitTimeoutInMillis = config.getLong("calculator.audits.kinesis.bufferFullWaitTimeoutInMillis");
        this.bufferTimeoutInMillis = config.getLong("calculator.audits.kinesis.bufferTimeoutInMillis");
        this.bufferTimeoutBetweenFlushes = config.getLong("calculator.audits.kinesis.bufferTimeoutBetweenFlushes");
        this.maxPutRecordBatchBytes = config.getInt("calculator.audits.kinesis.maxPutRecordBatchBytes");
        this.numberOfRetries = config.getInt("calculator.audits.kinesis.numberOfRetries");
        this.maxBackOffInMillis = config.getLong("calculator.audits.kinesis.maxBackOffInMillis");
        this.baseBackOffInMillis = config.getInt("calculator.audits.kinesis.baseBackOffInMillis");
        this.dataStreamName = config.getString("calculator.audits.kinesis.dataStreamName");

        this.producerBuffer = new ArrayDeque<>(maxBufferSize);
        this.flusherBuffer = new ArrayDeque<>(maxBufferSize);

        flusher = Executors.newSingleThreadExecutor(new DataStreamThreadFactory());
        flusher.submit(this::flushBuffer);
    }


    public CompletableFuture<AuditMessageResult> addAuditMessage(final AuditMessage message,int chunkNo) throws Exception {
        return addAuditMessage(message, maxOperationTimeoutInMillis, chunkNo);
    }

    /**
     * This method is responsible for taking a lock adding an {@code AuditMessage} into the producerBuffer, in case the producerBuffer is full
     * waits releasing the lock for the given {@code bufferFullWaitTimeoutInMillis}.
     * There are cases where the producerBuffer cannot be flushed then this method keeps waiting until the given operation timeout
     * passed as {@code timeoutInMillis}
     * @param message the type of data to be buffered
     * @param timeoutInMillis the operation timeout in case the record cannot be added into the producerBuffer.
     * @return CompletableFuture<AuditMessageResult>
     * @throws TimeoutExpiredException if the operation got stuck and is not able to proceed.
     * @throws InterruptedException if any thread interrupted the current thread before or while the current thread
     * was waiting for a notification.  The <i>interrupted status</i> of the current thread is cleared when
     * this exception is thrown.
     */
    public CompletableFuture<AuditMessageResult> addAuditMessage(final AuditMessage message, final long timeoutInMillis,final int chunkNo)
            throws TimeoutExpiredException, InterruptedException {
        log.debug("addAuditMessage> in> message:{}, timeoutInMillis:{}", message, timeoutInMillis);

        Validate.notNull(message, "Audit message cannot be null.");
        Validate.isTrue(timeoutInMillis > 0, "Operation timeout should be > 0.");

        long operationTimeoutInNanos = TimeUnit.MILLISECONDS.toNanos(timeoutInMillis);

        synchronized (producerBufferLock) {
            /* This happens whenever the current thread is trying to write, however, the Producer Buffer is full.
             * This guarantees if the writer thread is already running, should wait.
             * In addition, implements a kind of back pressure mechanism with a bailout condition, so we don't incur
             * in cases where the current thread waits forever.
             */
            long lastTimestamp = System.nanoTime();
            while (producerBuffer.size() >= maxBufferSize) {
                if ((System.nanoTime() - lastTimestamp) >= operationTimeoutInNanos) {
                    throw new TimeoutExpiredException("Timeout has expired for the given operation");
                }

                /* If the buffer is filled and the flusher isn't running yet, we notify to wake up the flusher */
                if (flusherBuffer.isEmpty()) {
                    producerBufferLock.notify();
                }
                producerBufferLock.wait(bufferFullWaitTimeoutInMillis);
            }
			this.partitionKey = getPartition(message,chunkNo);
            producerBuffer.offer( new AuditMessageBlob(message));

            /* If the buffer was filled up right after the last insertion we would like to wake up the flusher thread
             * and send the buffered data to Kinesis datastream as soon as possible */
            if (producerBuffer.size() >= maxBufferSize && flusherBuffer.isEmpty()) {
                producerBufferLock.notify();
            }
        }
        var result = AuditMessageResult.builder().successful(true).build();

        log.debug("addAuditMessage> result:{}", result);
        return CompletableFuture.completedFuture(result);
    }

    /**
     * This method runs in a background thread responsible for flushing the Producer Buffer in case the buffer is full,
     * not enough records into the buffer and timeout has expired or flusher timeout has expired.
     * If an unhandled exception is thrown the flusher thread should fail, logging the failure.
     * However, this behavior will block the producer to move on until hit the given timeout and throw {@code {@link TimeoutExpiredException}}
     */
    private void flushBuffer() {
        log.debug("flushBuffer> in>");

        lastSucceededFlushTimestamp = System.nanoTime();
        long bufferTimeoutInNanos = TimeUnit.MILLISECONDS.toNanos(bufferTimeoutInMillis);
        boolean timeoutFlush;

        while (true) {
            timeoutFlush = (System.nanoTime() - lastSucceededFlushTimestamp) >= bufferTimeoutInNanos;

            synchronized (producerBufferLock) {

                /* If the flusher buffer is not empty at this point we should fail, otherwise we would end up looping
                 * forever since we are swapping references */
                Validate.validState(flusherBuffer.isEmpty());

                if (isDestroyed) {
                    return;
                } else if (syncFlush || (producerBuffer.size() >= maxBufferSize ||
                        (timeoutFlush && producerBuffer.size() > 0))) {
                    prepareRecordsToSubmit(producerBuffer, flusherBuffer);
                    producerBufferLock.notify();
                } else {
                    try {
                        producerBufferLock.wait(bufferTimeoutBetweenFlushes);
                    } catch (InterruptedException e) {
                        log.warn("flushBuffer> An interrupted exception has been thrown, while trying to sleep and release the lock during a flush.", e);
                    }
                    continue;
                }
            }
            /* It's OK calling {@code submitBatchWithRetry} outside the critical section because this method does not make
             * any changes to the object and the producer thread does not make any modifications to the flusherBuffer.
             * The only agent making changes to flusherBuffer is the flusher thread. */
            try {
                submitBatchWithRetry(flusherBuffer);

                Queue<AuditMessageBlob> emptyFlushBuffer = new ArrayDeque<>(maxBufferSize);
                synchronized (producerBufferLock) {
                    /* We perform a swap at this point because {@code ArrayDeque<>.clear()} iterates over the items nullifying
                     * the items, and we would like to avoid such iteration just swapping references. */
                    Validate.validState(!flusherBuffer.isEmpty());
                    flusherBuffer = emptyFlushBuffer;

                    if (syncFlush) {
                        syncFlush = false;
                        producerBufferLock.notify();
                    }
                }

            } catch (Exception ex) {
                String errorMsg = "An error has occurred while trying to send data to Kinesis Data Stream.";

                if (ex instanceof KinesisException &&
                        ((KinesisException) ex).statusCode() == 413) {

                    log.error("flushBuffer> " + errorMsg +
                            "Batch of records too large. Please try to reduce your batch size by passing " +
                            "DATA_STREAM_PRODUCER_BUFFER_MAX_SIZE into your configuration.", ex);

                } else {
                    log.error("flushBuffer> " + errorMsg, ex);
                }

                synchronized (producerBufferLock) {
                    isFlusherFailed = true;
                }

                throw ex;
            }
        }

    }

    /**
     * Populates the target queue with messages from the source queue.
     * Up to the maximum capacity defined by {@code maxPutRecordBatchBytes}.
     */
    private void prepareRecordsToSubmit(@Nonnull final Queue<AuditMessageBlob> sourceQueue, @Nonnull final Queue<AuditMessageBlob> targetQueue) {
        log.debug("prepareRecordsToSubmit> in> sourceQueue.size:{}, targetQueue.size:{}", sourceQueue.size(), targetQueue.size());
        int total = 0;
        while (!sourceQueue.isEmpty() && (total + sourceQueue.peek().getBytes().asByteArrayUnsafe().length) <= maxPutRecordBatchBytes) {
            total += sourceQueue.peek().getBytes().asByteArrayUnsafe().length;
            targetQueue.add(sourceQueue.poll());
        }
        log.debug("prepareRecordsToSubmit> exit:");
    }

    private void submitBatchWithRetry(final Queue<AuditMessageBlob> messages) throws KinesisException,
            RecordCouldNotBeSentException {
        log.debug("submitBatchWithRetry> in> messages.size:{}", messages.size());

        PutRecordsResponse lastResult;
        String warnMessage = null;
        for (int attempts = 0; attempts < numberOfRetries; attempts++) {
            try {
                log.debug("submitBatchWithRetry> Trying to flush Buffer of size: {} on attempt: {}", messages.size(), attempts);
                lastResult = submitBatch(messages);

                if (lastResult.failedRecordCount() == null || lastResult.failedRecordCount() == 0) {

                    lastSucceededFlushTimestamp = System.nanoTime();
                    log.debug("submitBatchWithRetry> Kinesis data stream Buffer has been flushed with size: {} on attempt: {}",
                            messages.size(), attempts);
                    return;
                }

                PutRecordsResultEntry failedRecord = lastResult.records()
                        .stream()
                        .filter(r -> r.errorCode() != null)
                        .findFirst()
                        .orElse(null);

                warnMessage = String.format("Number of failed messages: %s.", lastResult.failedRecordCount());
                if (failedRecord != null) {
                    warnMessage = String.format("Kinesis data stream putRecords encountered an error and failed " +
                                    "trying to put: %s records with error: %s - %s.",
                            lastResult.failedRecordCount(), failedRecord.errorCode(), failedRecord.errorMessage());
                }
                log.warn("submitBatchWithRetry> " + warnMessage);

                //Full Jitter: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
                long timeToSleep = RandomUtils.nextLong(0,
                        Math.min(maxBackOffInMillis, (baseBackOffInMillis * 2 * attempts)));
                log.debug("submitBatchWithRetry> Sleeping for: {}ms on attempt: {}", timeToSleep, attempts);
                Thread.sleep(timeToSleep);

            } catch (InterruptedException e) {
                log.error("submitBatchWithRetry> An interrupted exception has been thrown between retry attempts.", e);
            } catch (KinesisException ex) {
                throw ex;
            }
        }

        throw new RecordCouldNotBeSentException("Exceeded number of attempts! " + warnMessage);
    }

    /**
     * Sends the actual batch of records to Kinesis Datastream
     * @param messages a Collection of messages
     * @return {@code PutRecordsResponse}
     */
    private PutRecordsResponse submitBatch(final Queue<AuditMessageBlob> messages)  {
        log.debug("submitBatch> in> messages.size:{}", messages.size());

        var records = messages.stream().map(r-> PutRecordsRequestEntry.builder()
				.data(r.getBytes())
				.partitionKey(this.partitionKey)
				.build())
                .collect(Collectors.toList());

        var request = PutRecordsRequest.builder()
                .streamName(dataStreamName)
                .records(records)
                .build();

        return kinesisClient.putRecords(request).join() ;
    }

    /**
     * Make sure that any pending scheduled thread terminates before closing as well as cleans the producerBuffer pool,
     * allowing GC to collect.
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
                throw new AuditDeliveryStreamException(errorMsg, e);
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
     * This method instructs the flusher thread to perform a flush on the buffer without waiting for completion.
     * <p>
     *     This implementation does not guarantee the whole buffer is flushed or if the flusher thread
     *     has completed the flush or not.
     *     In order to flush all records and wait until completion, use {@code {@link #flushSync()}}
     * </p>
     */
    public void flush() {
        synchronized (producerBufferLock) {
            syncFlush = true;
            producerBufferLock.notify();
        }
    }

    /**
     * This method instructs the flusher thread to perform the flush on the buffer and wait for the completion.
     * <p>
     *     This implementation is useful once there is a need to guarantee the buffer is flushed before making further progress.
     *     i.e. Shutting down the producer.
     *     i.e. Taking synchronous snapshots.
     * </p>
     * The caller needs to make sure to assert the status of {@link #isFlushFailed()} in order guarantee whether
     * the flush has successfully completed or not.
     */

    public void flushSync() {
        log.debug("flushSync> in>");
        while (getOutstandingRecordsCount() > 0 && !isFlushFailed()) {
            flush();
            try {
                Thread.sleep(500);
            } catch (InterruptedException e) {
                log.warn("flushSync> An interruption has happened while trying to flush the buffer synchronously.");
                Thread.currentThread().interrupt();
            }
        }

        if (isFlushFailed()) {
            log.warn("flushSync> The flusher thread has failed trying to synchronously flush the buffer.");
        }
        log.debug("flushSync> exit>");
    }

	private String getPartition(AuditMessage message,int chunkNo) {
		return  String.format("%s-%s-%s",message.getPipelineId() ,message.getExecutionId(),chunkNo);
	}
}
