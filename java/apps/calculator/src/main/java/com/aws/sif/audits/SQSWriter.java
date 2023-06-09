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
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.sqs.SqsAsyncClient;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;
import software.amazon.awssdk.services.sqs.model.SqsException;

import javax.annotation.Nonnull;
import javax.annotation.concurrent.GuardedBy;
import javax.annotation.concurrent.ThreadSafe;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Queue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Slf4j
@ThreadSafe
public class SQSWriter {

	/**
	 * config...
	 */
	private final int sqsMaxBufferSize;
	private final long sqsMaxOperationTimeoutInMillis;
	private final long sqsBufferFullWaitTimeoutInMillis;
	private final long sqsBufferTimeoutInMillis;
	private final long sqsBufferTimeoutBetweenFlushes;
	private final int sqsMaxPutObjectsCount;
	private final int sqsNumberOfRetries;
	private final long sqsMaxBackOffInMillis;
	private final long sqsBaseBackOffInMillis;
	private final int sqsMaxMessageSize;
	private final String sqsQueueUrl;
	private final String auditS3Key;
	private final String auditS3Bucket;
	/**
	 * Scheduler service responsible for flushing the producer Buffer pool
	 */
	private final ExecutorService flusher;
	/**
	 * Object lock responsible for guarding the producer Buffer pool
	 */
	@GuardedBy("this")
	private final Object producerBufferLock = new Object();
	private final SqsAsyncClient sqsClient;
	/**
	 * Producer Buffer pool for the sqs messages
	 */
	private volatile Queue<SendMessageRequest> producerBuffer;

	/**
	 * Flusher Buffer pool for the sqs messages
	 */
	private volatile Queue<SendMessageRequest> flusherBuffer;

	/**
	 * Timestamps responsible to store the last timestamp after the flusher threads
	 * have been performed
	 */
	private volatile long lastSucceededFlushTimestamp;

	/**
	 * Reports if the Firehose Producer was destroyed, shutting down the flusher
	 * thread.
	 */
	// TODO
	private volatile boolean isDestroyed;

	/**
	 * A sentinel flag to notify the flusher thread to flush the buffers immediately.
	 * This flag should be used only to request a flush from the caller thread
	 * through the {@link #flush()} method.
	 */
	private volatile boolean syncFlush;

	/**
	 * A flag representing if the Flusher thread has failed.
	 */
	private volatile boolean isFlusherFailed;

	private volatile List<AuditMessageBlob> queuedAuditMessages;
	private volatile int queuedAuditMessagesSize;

	public SQSWriter(SqsAsyncClient sqsClient, Config config) {
		log.debug("in>");
		this.sqsClient = sqsClient;

		sqsMaxBufferSize = config.getInt("calculator.audits.sqs.maxBufferSize");
		sqsMaxOperationTimeoutInMillis = config.getLong("calculator.audits.sqs.maxOperationTimeoutInMillis");
		sqsBufferFullWaitTimeoutInMillis = config.getLong("calculator.audits.sqs.bufferFullWaitTimeoutInMillis");
		sqsBufferTimeoutInMillis = config.getLong("calculator.audits.sqs.bufferTimeoutInMillis");
		sqsBufferTimeoutBetweenFlushes = config.getLong("calculator.audits.sqs.bufferTimeoutBetweenFlushes");
		sqsMaxPutObjectsCount = config.getInt("calculator.audits.sqs.maxPutObjectsCount");
		sqsNumberOfRetries = config.getInt("calculator.audits.sqs.numberOfRetries");
		sqsMaxBackOffInMillis = config.getLong("calculator.audits.sqs.maxBackOffInMillis");
		sqsBaseBackOffInMillis = config.getInt("calculator.audits.sqs.baseBackOffInMillis");
		sqsMaxMessageSize = config.getInt("calculator.audits.sqs.maxMessageSize");

		producerBuffer = new ArrayDeque<>(sqsMaxBufferSize);
		flusherBuffer = new ArrayDeque<>(sqsMaxBufferSize);

		auditS3Key = config.getString("calculator.upload.s3.audit.key");
		auditS3Bucket = config.getString("calculator.upload.s3.bucket");
		sqsQueueUrl = config.getString("calculator.audits.sqs.queueUrl");

		resetQueuedAuditMessages();

		flusher = Executors.newSingleThreadExecutor(new SQSWriterThreadFactory());
		flusher.submit(this::flushBuffer);
	}

	private void resetQueuedAuditMessages() {
		log.debug("in>");
		queuedAuditMessages = new ArrayList<>();
		queuedAuditMessagesSize = 0;
	}

	private String replaceKeyTokens(String key, AuditMessage message) {
		return key.replace("<pipelineId>", message.getPipelineId() != null ? message.getPipelineId() : "UNKNOWN").replace("<executionId>", message.getExecutionId() != null ? message.getExecutionId() : "UNKNOWN").replace("<auditId>", message.getAuditId() != null ? message.getAuditId() : "UNKNOWN");
	}

	public CompletableFuture<Void> addAuditMessage(final AuditMessage message) throws Exception {
		return addAuditMessage(message, sqsMaxOperationTimeoutInMillis);
	}

	/**
	 * This method is responsible for taking a lock adding an {@code AuditMessage}
	 * into the producerBuffer, in case the producerBuffer is full
	 * waits releasing the lock for the given {@code bufferFullWaitTimeoutInMillis}.
	 * There are cases where the producerBuffer cannot be flushed then this method
	 * keeps waiting until the given operation timeout
	 * passed as {@code timeoutInMillis}
	 *
	 * @param message         the type of data to be buffered
	 * @param timeoutInMillis the operation timeout in case the record cannot be
	 *                        added into the producerBuffer.
	 * @return CompletableFuture<AuditMessageResult>
	 * @throws TimeoutExpiredException if the operation got stuck and is not able to
	 *                                 proceed.
	 * @throws InterruptedException    if any thread interrupted the current thread
	 *                                 before or while the current thread
	 *                                 was waiting for a notification. The
	 *                                 <i>interrupted status</i> of the current
	 *                                 thread is cleared when
	 *                                 this exception is thrown.
	 */
	public CompletableFuture<Void> addAuditMessage(final AuditMessage message, final long timeoutInMillis) throws TimeoutExpiredException, InterruptedException {
		log.debug("in> message:{}, timeoutInMillis:{}", message, timeoutInMillis);

		Validate.notNull(message, "Audit message cannot be null.");
		Validate.isTrue(timeoutInMillis > 0, "Operation timeout should be > 0.");

		var blob = new AuditMessageBlob(message, replaceKeyTokens(auditS3Key, message));

		/**
		 * if adding the new message to the queued messages exceeds the max sqs message size, it
		 * is time to create the sqs message and offer it to the producer
		 */
		if (queuedAuditMessagesSize + blob.getMessageSize() > sqsMaxMessageSize) {
			log.debug("queuedAuditMessagesSize ({}) + messageSize ({}) > sqsMaxMessageSize ({})", queuedAuditMessagesSize, blob.getMessageSize(), sqsMaxMessageSize);

			long operationTimeoutInNanos = TimeUnit.MILLISECONDS.toNanos(timeoutInMillis);
			synchronized (producerBufferLock) {
				/*
				 * This happens whenever the current thread is trying to write, however, the Producer Buffer is full.
				 * This guarantees if the writer thread is already running, should wait.
				 * In addition, implements a kind of back pressure mechanism with a bailout condition, so we don't incur
				 * in cases where the current thread waits forever.
				 */
				long lastTimestamp = System.nanoTime();
				while (producerBuffer.size() >= sqsMaxBufferSize) {
					if ((System.nanoTime() - lastTimestamp) >= operationTimeoutInNanos) {
						throw new TimeoutExpiredException("Timeout has expired for the given operation");
					}

					/*
					 * If the buffer is filled and the flusher isn't running yet, we notify to wake up the flusher
					 */
					if (flusherBuffer.isEmpty()) {
						producerBufferLock.notify();
					}
					producerBufferLock.wait(sqsBufferFullWaitTimeoutInMillis);
				}

				offerAuditLogs();

				/*
				 * If the buffer was filled up right after the last insertion we would like to
				 * wake up the flusher thread and send the buffered data to Kinesis Firehose as soon as possible
				 */
				if (producerBuffer.size() >= sqsMaxBufferSize && flusherBuffer.isEmpty()) {
					producerBufferLock.notify();
				}
			}
		} else {
			log.debug("queuedAuditMessagesSize ({}) + messageSize ({}) < sqsMaxMessageSize ({})", queuedAuditMessagesSize, blob.getMessageSize(), sqsMaxMessageSize);
		}
		queuedAuditMessages.add(blob);
		queuedAuditMessagesSize += blob.getMessageSize();

		log.debug("exit:");
		return CompletableFuture.completedFuture(null);
	}

	/**
	 * Add the local stored audit messages to a sqs message, then queue that message on the producer
	 */
	private void offerAuditLogs() {
		log.debug("in> (queuedAuditMessages.size:{})", queuedAuditMessages.size());
		if (queuedAuditMessages.size()>0) {
			var sendMsgReq = SendMessageRequest.builder().queueUrl(sqsQueueUrl).messageBody(String.format("{\"logs\":[%s]}", queuedAuditMessages.stream().map(m -> m.toJson()).collect(Collectors.joining(",")))).build();
			producerBuffer.offer(sendMsgReq);
			resetQueuedAuditMessages();
		}
		log.debug("exit>");
	}

	/**
	 * This method runs in a background thread responsible for flushing the Producer Buffer in case the buffer is full,
	 * not enough records into the buffer and timeout has expired or flusher timeout has expired.
	 * If an unhandled exception is thrown the flusher thread should fail, logging the failure.
	 * However, this behavior will block the producer to move on until hit the given timeout and throw {@code {@link TimeoutExpiredException}}
	 */
	private void flushBuffer() {
		log.debug("in>");

		lastSucceededFlushTimestamp = System.nanoTime();
		long bufferTimeoutInNanos = TimeUnit.MILLISECONDS.toNanos(sqsBufferTimeoutInMillis);
		boolean timeoutFlush;

		while (true) {
			timeoutFlush = (System.nanoTime() - lastSucceededFlushTimestamp) >= bufferTimeoutInNanos;

			synchronized (producerBufferLock) {

				/*
				 * If the flusher buffer is not empty at this point we should fail, otherwise we
				 * would end up looping forever since we are swapping references
				 */
				Validate.validState(flusherBuffer.isEmpty());

				log.debug("isDestroyed:{}, syncFlush:{}, producerBuffer.size:{}, sqsMaxBufferSize:{}, timeoutFlush:{}", isDestroyed, syncFlush, producerBuffer.size(), sqsMaxBufferSize, timeoutFlush);

				if (isDestroyed) {
					return;
				} else if (syncFlush || (producerBuffer.size() >= sqsMaxBufferSize || (timeoutFlush && producerBuffer.size() > 0))) {
					prepareRecordsToSubmit(producerBuffer, flusherBuffer);
					producerBufferLock.notify();
				} else {
					try {
						producerBufferLock.wait(sqsBufferTimeoutBetweenFlushes);
					} catch (InterruptedException e) {
						log.warn("flushBuffer> An interrupted exception has been thrown, while trying to sleep and release the lock during a flush.", e);
					}
					continue;
				}
			}
			/*
			 * It's OK calling {@code submitBatchWithRetry} outside the critical section because this method does not make
			 * any changes to the object and the producer thread does not make any modifications to the flusherBuffer.
			 * The only agent making changes to flusherBuffer is the flusher thread.
			 */
			try {
				submitBatchWithRetry(flusherBuffer);

				Queue<SendMessageRequest> emptyFlushBuffer = new ArrayDeque<>(sqsMaxBufferSize);
				synchronized (producerBufferLock) {
					/*
					 * We perform a swap at this point because {@code ArrayDeque<>.clear()} iterates over the items nullifying the
					 * items, and we would like to avoid such iteration just swapping references.
					 */
					Validate.validState(!flusherBuffer.isEmpty());

					flusherBuffer = emptyFlushBuffer;

					if (syncFlush) {
						syncFlush = false;
						producerBufferLock.notify();
					}
				}

			} catch (Exception ex) {
				String errorMsg = "An error has occurred while trying to send data so S3.";
				log.error("flushBuffer> " + errorMsg, ex);

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
	private void prepareRecordsToSubmit(@Nonnull final Queue<SendMessageRequest> sourceQueue, @Nonnull final Queue<SendMessageRequest> targetQueue) {
		log.debug("in> sourceQueue.size:{}, targetQueue.size:{}", sourceQueue.size(), targetQueue.size());
		int total = 0;
		while (!sourceQueue.isEmpty() && (total <= sqsMaxPutObjectsCount)) {
			targetQueue.add(sourceQueue.poll());
			total++;
		}
		log.debug("exit:");
	}

	private void submitBatchWithRetry(final Queue<SendMessageRequest> messages) throws S3Exception, RecordCouldNotBeSentException {
		log.debug("in> messages.size:{}", messages.size());

		String warnMessage = null;
		for (int attempts = 0; attempts < sqsNumberOfRetries; attempts++) {
			try {
				log.debug("Trying to flush Buffer of size: {} on attempt: {}", messages.size(), attempts);
				// process all messages in current slice of the queue
				messages.parallelStream().forEach(message -> {
					log.debug("Sending: {}", message);
					sqsClient.sendMessage(message).join();
				});
				return;
			} catch (SqsException ex) {
				// SQS will return 503 to indicate client to slow down
				if (ex.statusCode() == 503) {
					try {
						warnMessage = ex.getMessage();
						log.warn( warnMessage);
						// Full Jitter:
						// https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
						long timeToSleep = RandomUtils.nextLong(0, Math.min(sqsMaxBackOffInMillis, (sqsBaseBackOffInMillis * 2 * attempts)));
						log.debug("Sleeping for: {}ms on attempt: {}", timeToSleep, attempts);
						Thread.sleep(timeToSleep);
					} catch (InterruptedException e) {
						log.error("An interrupted exception has been thrown between retry attempts.", e);
					}
				} else {
					throw ex;
				}
			}
		}

		throw new RecordCouldNotBeSentException("Exceeded number of attempts! " + warnMessage);
	}

	/**
	 * Make sure that any pending scheduled thread terminates before closing as well
	 * as cleans the producerBuffer pool,
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

	private int getOutstandingMessagesCount() {
		synchronized (producerBufferLock) {
			return producerBuffer.size() + flusherBuffer.size();
		}
	}

	private int getOutstandingAuditsCount() {
		synchronized (producerBufferLock) {
			return queuedAuditMessages.size();
		}
	}

	public boolean isFlushFailed() {
		synchronized (producerBufferLock) {
			return isFlusherFailed;
		}
	}

	/**
	 * This method instructs the flusher thread to perform a flush on the buffer
	 * without waiting for completion.
	 * <p>
	 * This implementation does not guarantee the whole buffer is flushed or if the
	 * flusher thread
	 * has completed the flush or not.
	 * In order to flush all records and wait until completion, use {@code {@link
	 * #flushSync()}}
	 * </p>
	 */
	private void flush() {
		log.debug("flushSync> in>");
		synchronized (producerBufferLock) {
			syncFlush = true;
			producerBufferLock.notify();
		}
	}

	/**
	 * This method instructs the flusher thread to perform the flush on the buffer
	 * and wait for the completion.
	 * <p>
	 * This implementation is useful once there is a need to guarantee the buffer is
	 * flushed before making further progress.
	 * i.e. Shutting down the producer.
	 * i.e. Taking synchronous snapshots.
	 * </p>
	 * The caller needs to make sure to assert the status of
	 * {@link #isFlushFailed()} in order guarantee whether
	 * the flush has successfully completed or not.
	 */

	public void flushSync() {
		log.debug("flushSync> in>");
		log.debug("flushSync> outstandingAuditsCount:{}, outstandingMessagesCount:{}, isFlushFailed:{}",
			getOutstandingAuditsCount(), getOutstandingMessagesCount(), isFlushFailed());
		if (getOutstandingAuditsCount() > 0) {
			synchronized (producerBufferLock) {
				offerAuditLogs();
			}
		}
		while (getOutstandingMessagesCount() > 0 && !isFlushFailed()) {
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
}
