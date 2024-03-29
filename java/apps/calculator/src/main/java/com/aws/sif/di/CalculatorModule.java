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

import com.amazonaws.xray.interceptors.TracingInterceptor;
import com.aws.sif.ActivityTypeCalculatorService;
import com.aws.sif.DataTypeCalculatorService;
import com.aws.sif.S3Utils;
import com.aws.sif.audits.Auditor;
import com.aws.sif.audits.DataStreamProducer;
import com.aws.sif.execution.Calculator;
import com.aws.sif.execution.CalculatorImpl;
import com.aws.sif.execution.ExecutionVisitor;
import com.aws.sif.execution.ExecutionVisitorImpl;
import com.aws.sif.execution.output.ActivityTypeOutputWriter;
import com.aws.sif.execution.output.ActivitySqsWriter;
import com.aws.sif.execution.output.DataTypeOutputWriter;
import com.aws.sif.lambdaInvoker.LambdaInvoker;
import com.aws.sif.resources.ResourcesRepository;
import com.aws.sif.resources.calculations.Calculation;
import com.aws.sif.resources.calculations.CalculationsClient;
import com.aws.sif.resources.calculations.CalculationsList;
import com.aws.sif.resources.caml.CamlClient;
import com.aws.sif.resources.groups.Group;
import com.aws.sif.resources.groups.GroupsClient;
import com.aws.sif.resources.impacts.ActivitiesList;
import com.aws.sif.resources.impacts.Activity;
import com.aws.sif.resources.impacts.ImpactsClient;
import com.aws.sif.resources.referenceDatasets.DataDownload;
import com.aws.sif.resources.referenceDatasets.Dataset;
import com.aws.sif.resources.referenceDatasets.DatasetsClient;
import com.aws.sif.resources.referenceDatasets.DatasetsList;
import com.aws.sif.resources.users.User;
import com.aws.sif.resources.users.UsersClient;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.typesafe.config.Config;
import com.typesafe.config.ConfigFactory;
import dagger.Module;
import dagger.Provides;
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbAsyncClient;
import software.amazon.awssdk.services.kinesis.KinesisAsyncClient;
import software.amazon.awssdk.services.lambda.LambdaAsyncClient;
import software.amazon.awssdk.services.s3.S3AsyncClient;
import software.amazon.awssdk.services.sagemakerruntime.SageMakerRuntimeClient;
import software.amazon.awssdk.services.sqs.SqsAsyncClient;
import javax.inject.Provider;
import javax.inject.Singleton;

@Module
public class CalculatorModule {

	@Provides
	@Singleton
	public Config provideConfig() {
		var config = ConfigFactory.load();
		config.checkValid(ConfigFactory.defaultReference(), "calculator");

		return config;
	}

	@Provides
	@Singleton
	public SageMakerRuntimeClient provideSageMakerRuntimeClient(Config config) {
		return SageMakerRuntimeClient.builder()
				.region(Region.of(config.getString("calculator.aws.region")))
				.overrideConfiguration(ClientOverrideConfiguration.builder()
						.addExecutionInterceptor(new TracingInterceptor()).build())
				.build();
	}


	@Provides
	@Singleton
	public LambdaAsyncClient provideLambdaClient(Config config) {
		return LambdaAsyncClient.builder()
				.region(Region.of(config.getString("calculator.aws.region")))
				.overrideConfiguration(ClientOverrideConfiguration.builder()
						.addExecutionInterceptor(new TracingInterceptor()).build())
				.build();
	}

	@Provides
	@Singleton
	public DynamoDbAsyncClient provideDynamoDbClient(Config config) {
		return DynamoDbAsyncClient.builder()
				.region(Region.of(config.getString("calculator.aws.region")))
				.overrideConfiguration(ClientOverrideConfiguration.builder()
						.addExecutionInterceptor(new TracingInterceptor()).build())
				.build();
	}

	@Provides
	@Singleton
	public SqsAsyncClient provideSqsClient(Config config) {
		return SqsAsyncClient.builder()
				.region(Region.of(config.getString("calculator.aws.region")))
				.overrideConfiguration(ClientOverrideConfiguration.builder()
						.addExecutionInterceptor(new TracingInterceptor()).build())
				.build();
	}

	@Provides
	@Singleton
	public S3AsyncClient provideS3Client(Config config) {
		return S3AsyncClient.builder()
				.region(Region.of(config.getString("calculator.aws.region")))
				.overrideConfiguration(ClientOverrideConfiguration.builder()
						.addExecutionInterceptor(new TracingInterceptor()).build())
				.build();
	}

	@Provides
	@Singleton
	public KinesisAsyncClient provideKinesisAsyncClient(Config config) {
		return KinesisAsyncClient.builder()
				.region(Region.of(config.getString("calculator.aws.region")))
				.overrideConfiguration(ClientOverrideConfiguration.builder()
						.addExecutionInterceptor(new TracingInterceptor()).build())
				.build();
	}

	@Provides
	@Singleton
	public LambdaInvoker provideLambdaInvoker(LambdaAsyncClient lambdaClient) {
		return new LambdaInvoker<>(lambdaClient);
	}

	@Provides
	public ExecutionVisitor provideExecutionVisitor(CalculationsClient calculationsClient,
													DatasetsClient datasetsClient, GroupsClient groupsClient, ImpactsClient impactsClient, CamlClient camlClient, Gson gson) {
		return new ExecutionVisitorImpl(calculationsClient, datasetsClient, groupsClient, impactsClient, camlClient, gson);
	}

	@Provides
	@Singleton
	public Calculator provideCalculator(Provider<ExecutionVisitor> visitorProvider) {
		return new CalculatorImpl(visitorProvider);
	}

	@Provides
	@Singleton
	public ResourcesRepository provideResourcesRepository(DynamoDbAsyncClient ddb, Config config) {
		return new ResourcesRepository(ddb, config);
	}

	@Provides
	@Singleton
	public CalculationsClient provideCalculationsClient(LambdaInvoker<Calculation> calculationInvoker,
														LambdaInvoker<CalculationsList> calculationsListInvoker,
														Config config, ResourcesRepository repository) {
		return new CalculationsClient(calculationInvoker, calculationsListInvoker, config, repository);
	}

	@Provides
	@Singleton
	public DatasetsClient provideDatasetsClient(LambdaInvoker<DatasetsList> datasetsListInvoker, LambdaInvoker<Dataset> datasetsInvoker, LambdaInvoker<DataDownload> dataDownloadInvoker,
												Config config, ResourcesRepository repository) {
		return new DatasetsClient(datasetsListInvoker, datasetsInvoker, dataDownloadInvoker, config, repository);
	}
	@Provides
	@Singleton
	public GroupsClient provideGroupsClient(LambdaInvoker<Group> groupsInvoker, Config config, ResourcesRepository repository) {
		return new GroupsClient(groupsInvoker, config, repository);
	}
	@Provides
	@Singleton
	public ImpactsClient provideActivitiesClient(LambdaInvoker<Activity> activityInvoker,
												 LambdaInvoker<ActivitiesList> activitiesListInvoker,
												 Config config, ResourcesRepository repository) {
		return new ImpactsClient(activityInvoker, activitiesListInvoker, config, repository);
	}

	@Provides
	@Singleton
	public UsersClient provideUsersClient(LambdaInvoker<User> userInvoker, Config config) {
		return new UsersClient(userInvoker, config);
	}

	@Provides
	@Singleton
	public Gson provideGson() {
		return new GsonBuilder().create();
	}

	@Provides
	@Singleton
	public CamlClient provideCamlClient(SageMakerRuntimeClient sagemakerClient, Config config, Gson gson, ResourcesRepository repository) {
		return new CamlClient(sagemakerClient, config, gson, repository);
	}

    @Provides
    @Singleton
    public ActivityTypeCalculatorService provideActivityTypeCalculatorService(Calculator calculator, S3Utils s3Utils, Auditor auditor,
            Config config, ActivityTypeOutputWriter outputWriter, UsersClient usersClient, Gson gson) {
        return new ActivityTypeCalculatorService(calculator, s3Utils, auditor, config, outputWriter, usersClient, gson);
    }

    @Provides
    @Singleton
    public DataTypeCalculatorService provideDataTypeCalculatorService(Calculator calculator, S3Utils s3Utils, Auditor auditor,
            Config config, DataTypeOutputWriter outputWriter, UsersClient usersClient, Gson gson) {
        return new DataTypeCalculatorService(calculator, s3Utils, auditor, config, outputWriter, usersClient, gson);
    }

	@Provides
	@Singleton
	public S3Utils provideS3Utils(S3AsyncClient s3Client) {
		return new S3Utils(s3Client);
	}

	@Provides
	public DataStreamProducer provideDataStreamProducer(KinesisAsyncClient kinesisAsyncClient, Config config) {
		return new DataStreamProducer(kinesisAsyncClient, config);
	}

	@Provides
	public Auditor provideAuditor(DataStreamProducer producer) {
		return new Auditor(producer);
	}

	@Provides
	public ActivitySqsWriter provideSQSUtil(SqsAsyncClient sqsClient, Config config) {
		return new ActivitySqsWriter(sqsClient, config);
	}

	@Provides
	public ActivityTypeOutputWriter provideActivityTypeOutputWriter(Config config, S3Utils s3, ActivitySqsWriter sqsWriter) {
		return new ActivityTypeOutputWriter(config, s3);
	}

	@Provides
	public DataTypeOutputWriter provideDataTypeOutputWriter(Config config, S3Utils s3) {
		return new DataTypeOutputWriter(config, s3);
	}
}
