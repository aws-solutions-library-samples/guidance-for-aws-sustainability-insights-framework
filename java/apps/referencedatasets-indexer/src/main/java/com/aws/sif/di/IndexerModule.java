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

package com.aws.sif.di;

import com.aws.sif.IndexerImpl;
import com.aws.sif.IndexerService;
import com.aws.sif.S3Utils;
import com.aws.sif.ZipUtils;
import com.typesafe.config.Config;
import com.typesafe.config.ConfigFactory;
import dagger.Module;
import dagger.Provides;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3AsyncClient;

import javax.inject.Singleton;

@Module
public class IndexerModule {

    @Provides
    @Singleton
    public Config provideConfig() {
        var config = ConfigFactory.load();
        config.checkValid(ConfigFactory.defaultReference(), "indexer");

        return config;
    }

    @Provides
    @Singleton
    public S3AsyncClient provideS3Client(Config config) {
        return S3AsyncClient.builder()
                .region(Region.of(config.getString("indexer.aws.region")))
                .build();
    }

    @Provides
    @Singleton
    public S3Utils provideS3Utils(S3AsyncClient s3Client) {
        return new S3Utils(s3Client);
    }

    @Provides
    public IndexerService provideIndexerService(S3Utils s3Utils, Config config, ZipUtils zipUtils) {
        return new IndexerImpl(s3Utils, config, zipUtils);
    }

    @Provides
    @Singleton
    public ZipUtils provideZipUtils() { return new ZipUtils(); }
}
