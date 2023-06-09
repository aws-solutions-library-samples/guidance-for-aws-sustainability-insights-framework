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

import com.typesafe.config.Config;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.RandomUtils;
import software.amazon.awssdk.services.sqs.SqsAsyncClient;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;
import software.amazon.awssdk.services.sqs.model.SqsException;
import com.aws.sif.execution.output.exceptions.RecordCouldNotBeSentException;

import javax.annotation.concurrent.GuardedBy;
import javax.annotation.concurrent.ThreadSafe;

@Slf4j
@ThreadSafe
public class ActivitySqsWriter {

	/**
	 * config...
	 */

	private final int sqsNumberOfRetries;
	private final long sqsMaxBackOffInMillis;
	private final long sqsBaseBackOffInMillis;
	private final String sqsQueueUrl;


	/**
	 * Object lock responsible for guarding the producer Buffer pool
	 */
	@GuardedBy("this")
	private final SqsAsyncClient sqsClient;

	public ActivitySqsWriter(SqsAsyncClient sqsClient, Config config) {
		log.debug("in>");
		this.sqsClient = sqsClient;

		sqsNumberOfRetries = config.getInt("calculator.activity.sqs.numberOfRetries");
		sqsMaxBackOffInMillis = config.getLong("calculator.activity.sqs.maxBackOffInMillis");
		sqsBaseBackOffInMillis = config.getInt("calculator.activity.sqs.baseBackOffInMillis");


		sqsQueueUrl = config.getString("calculator.activity.sqs.queueUrl");
	}


	public void submitWithRetry(String message,String groupId, String deduplicationId) throws SqsException, RecordCouldNotBeSentException {
		log.debug("in> message:{}", message);

		String warnMessage = null;
		var sendMessageReq = SendMessageRequest.builder().queueUrl(sqsQueueUrl).messageBody(message).messageGroupId(groupId).messageDeduplicationId(deduplicationId).build();
		for (int attempts = 0; attempts < sqsNumberOfRetries; attempts++) {
			try {
					log.debug("Sending: {}", sendMessageReq);
					sqsClient.sendMessage(sendMessageReq).join();
					log.debug("message sent");

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
					log.error("An  exception has been thrown.", ex);
					throw ex;
				}
			}
		}

		throw new RecordCouldNotBeSentException("Exceeded number of attempts! " + warnMessage);
	}

}
