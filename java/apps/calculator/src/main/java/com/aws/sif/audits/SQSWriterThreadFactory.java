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

import javax.annotation.Nonnull;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicLong;

public class SQSWriterThreadFactory implements ThreadFactory {
    /** Static threadsafe counter use to generate thread name suffix. */
    private static final AtomicLong count = new AtomicLong(0);

    @Override
    public Thread newThread(@Nonnull final Runnable runnable) {
        Thread thread = Executors.defaultThreadFactory().newThread(runnable);
        thread.setName("sqs-writer-thread-" + count.getAndIncrement());
        thread.setDaemon(false);
        return thread;
    }
}
