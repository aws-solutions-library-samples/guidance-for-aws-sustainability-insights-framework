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
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.Validate;

@Slf4j
public class Auditor {

    private final FirehoseProducer producer;

    /** Remembers the last Async thrown exception */
    private transient volatile Throwable lastThrownException;

    /** Specify whether stop and fail in case of an error */
    private boolean failOnError;

    public Auditor(FirehoseProducer producer ) {
        this.producer = producer;
    }

    public void log(AuditMessage message) throws Exception {
        log.debug("log> in> message:{}", message);

        Validate.notNull(message);
        Validate.validState((producer != null && !producer.isDestroyed()), "Firehose producer has been destroyed");

        propagateAsyncExceptions();

        producer
                .addAuditMessage(message)
                .handleAsync((record, throwable) -> {
                    if (throwable != null) {
                        final String msg = "An error has occurred trying to write a record.";
                        if (failOnError) {
                            lastThrownException = throwable;
                        } else {
                            log.warn("log> " + msg, throwable);
                        }
                    }

                    if (record != null && !record.isSuccessful()) {
                        final String msg = "Record could not be successfully sent.";
                        if (failOnError && lastThrownException == null) {
                            lastThrownException = new RecordCouldNotBeSentException(msg, record.getException());
                        } else {
                            log.warn("log> " + msg, record.getException());
                        }
                    }

                    return null;
                });

    }

    public void flushSync() {
        this.producer.flushSync();
    }

    private void propagateAsyncExceptions() throws Exception {
        if (lastThrownException == null) {
            return;
        }

        final String msg = "An exception has been thrown while trying to process a record";
        if (failOnError) {
            throw new AuditDeliveryStreamException(msg, lastThrownException);
        } else {
            log.warn("propagateAsyncExceptions> " + msg, lastThrownException);
            lastThrownException = null;
        }
    }
}
