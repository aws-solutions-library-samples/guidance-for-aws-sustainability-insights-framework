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

import type { FastifyBaseLogger } from 'fastify';
import { parse } from 'csv-parse/sync';
import { ulid } from 'ulid';
import { toUtf8 } from '@aws-sdk/util-utf8-node';
import ShortUniqueId from 'short-unique-id';
import { CopyObjectCommand, GetObjectCommand, PutObjectCommand, SelectObjectContentCommand } from '@aws-sdk/client-s3';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import type { CopyObjectCommandInput, GetObjectCommandInput, PutObjectCommandInput, S3Client, SelectObjectContentCommandInput } from '@aws-sdk/client-s3';
import { atLeastContributor, atLeastAdmin, atLeastReader, GroupPermissions, SecurityContext } from '@sif/authz';
import { InvalidRequestError, AlternateIdInUseError, GroupService, MergeUtils, NotFoundError, ResourceService, TagService, UnauthorizedError } from '@sif/resource-api-base';
import type { EventPublisher } from '@sif/events';
import type { GetSignedUrl, EditReferenceDataset, ReferenceDataset, ReferenceDatasetWithS3, NewReferenceDataset, SignedUrlResponse, S3Location, ReferenceDatasetUpdateMetadata } from './schemas.js';
import type { ReferenceDatasetListOptions, ReferenceDatasetListPaginationKey, ReferenceDatasetListVersionPaginationKey, ReferenceDatasetListVersionsOptions, ReferenceDatasetRepository } from './repository.js';
import { InvalidFileHeaderError, ReferenceDatasetDefinitionError } from '../common/errors.js';
import { PkType } from '../utils/pkTypes.utils.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);

// eslint-disable-next-line @typescript-eslint/naming-convention
const DEFAULT_SIGNED_URL_EXPIRATION: number = 5 * 60;

export const fileUploadName: string = 'data_upload.csv';
export const datasetFileName: string = 'data.csv';

export class ReferenceDatasetService {
	private readonly log: FastifyBaseLogger;
	private readonly repository: ReferenceDatasetRepository;
	private readonly tagService: TagService;
	private readonly resourceService: ResourceService;
	private readonly groupsService: GroupService;
	private readonly s3Client: S3Client;
	private readonly eventPublisher: EventPublisher;
	private readonly bucketName: string;
	private readonly bucketPrefix: string;
	private readonly authChecker: GroupPermissions;
	private readonly getSignedUrl: GetSignedUrl;
	private readonly mergeUtils: MergeUtils;
	private readonly sfnClient: SFNClient;
	private readonly stateMachineArn: string;

	public constructor(
		log: FastifyBaseLogger,
		authChecker: GroupPermissions,
		eventPublisher: EventPublisher,
		repository: ReferenceDatasetRepository,
		s3Client: S3Client,
		bucketName: string,
		bucketPrefix: string,
		getSignedUrl: GetSignedUrl,
		groupsService: GroupService,
		tagService: TagService,
		resourceService: ResourceService,
		mergeUtils: MergeUtils,
		sfnClient: SFNClient,
		stateMachineArn: string
	) {
		this.log = log;
		this.repository = repository;
		this.s3Client = s3Client;
		this.authChecker = authChecker;
		this.bucketName = bucketName;
		this.getSignedUrl = getSignedUrl;
		this.tagService = tagService;
		this.eventPublisher = eventPublisher;
		this.resourceService = resourceService;
		this.groupsService = groupsService;
		this.bucketPrefix = bucketPrefix;
		this.mergeUtils = mergeUtils;
		this.sfnClient = sfnClient;
		this.stateMachineArn = stateMachineArn;
	}

	public async storeDatasetFile(referenceDatasetId: string, data: string | S3Location, changeId: string): Promise<[bucket: string, key: string]> {
		this.log.info(`ReferenceDatasetService> storeDatasetFile> referenceDatasetId:${referenceDatasetId}, changeId:${changeId}`);

		const dataFileKey = `${this.bucketPrefix}/${referenceDatasetId}/${changeId}/${datasetFileName}`;

		if (typeof data === 'object') {
			const copyObjectParams: CopyObjectCommandInput = {
				Bucket: this.bucketName,
				CopySource: `${data.bucket}/${data.key}`,
				Key: dataFileKey,
			};
			await this.s3Client.send(new CopyObjectCommand(copyObjectParams));
		} else {
			const putObjectParams: PutObjectCommandInput = {
				Bucket: this.bucketName,
				Key: dataFileKey,
				Body: data,
			};
			await this.s3Client.send(new PutObjectCommand(putObjectParams));
		}

		this.log.info(`ReferenceDatasetService> storeDatasetFile> exit`);
		return [this.bucketName, dataFileKey];
	}

	public validateFileHeaders(headersFromFile: string[], headersFromMetadata: string[]): void {
		const headersAreEqual =
			headersFromFile.length === headersFromMetadata.length &&
			headersFromFile.every(function(element: string) {
				const result = headersFromMetadata.includes(element.trim());
				return result;
			});

		if (!headersAreEqual) {
			throw new InvalidFileHeaderError('datasetHeaders property does not match csv file header');
		}
	}

	public async create(securityContext: SecurityContext, referenceDatasetNew: NewReferenceDataset): Promise<ReferenceDataset> {
		this.log.info(`ReferenceDatasetService> create> referenceDataset:${referenceDatasetNew}`);

		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastContributor, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`admin\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// Validation - ensure alias is unique for the group
		if (await this.groupsService.isAlternateIdInUse(referenceDatasetNew.name, securityContext.groupId)) {
			throw new AlternateIdInUseError(referenceDatasetNew.name);
		}

		if (referenceDatasetNew.activeAt && !dayjs(referenceDatasetNew.activeAt).isValid()) {
			throw new InvalidRequestError('Invalid Date specified double check if the date/time is in ISO8601 local time');
		}

		const id = ulid().toLowerCase();
		const initialVersion = 1;

		const { data, ...rest } = referenceDatasetNew;

		const referenceDataset: ReferenceDatasetWithS3 = {
			...rest,
			id,
			groups: [securityContext.groupId],
			createdBy: securityContext.email,
			createdAt: new Date(Date.now()).toISOString(),
			version: initialVersion,
			state: 'frozen',
			status: 'inProgress',
			statusMessage: 'processing dataset(csv)',
			activeAt: referenceDatasetNew.activeAt ? dayjs.utc(referenceDatasetNew.activeAt).toISOString() : undefined,
		};

		const uid = new ShortUniqueId({ length: 10 });
		const changeId = uid();

		if (referenceDatasetNew.datasetSource === 's3') {
			referenceDataset.uploadUrl = await this.getReferenceDatasetUploadUrl(securityContext, id, changeId);
			referenceDataset.status = 'pendingUpload';
			referenceDataset.statusMessage = 'expecting dataset(csv) to be uploaded using the signed url';
		} else {
			const headersFromFile = parse(data)[0];
			this.validateFileHeaders(headersFromFile, referenceDatasetNew.datasetHeaders);
			const [bucket, key] = await this.storeDatasetFile(id, data, changeId);

			referenceDataset.s3Location = {
				bucket,
				key,
			};
			referenceDataset.indexS3Location = {
				bucket,
				key: `${this.bucketPrefix}/${id}/${changeId}/`,
			};

			// kick of indexing process here if the datasource was inline or file upload.
			// if the datasource was s3, then this method gets called in the eventbridge lambda which handles bucket events
			await this.executeIndexerStateMachine(referenceDataset);
		}

		await this.repository.put(referenceDataset);

		await this.tagService.submitGroupSummariesProcess(securityContext.groupId, PkType.ReferenceDataset, referenceDatasetNew.tags, {});

		await this.eventPublisher.publishEvent({
			id,
			resourceType: 'referenceDataset',
			eventType: 'created',
		});

		this.log.debug(`ReferenceDatasetService> create> exit> referenceDataset:${referenceDataset}`);

		delete referenceDataset.s3Location;
		delete referenceDataset.indexS3Location;

		return referenceDataset;
	}

	public async getFileHeaders(bucket: string, key: string): Promise<string[] | undefined> {
		this.log.info(`ReferenceDatasetService > getFileHeaders > in > bucket: ${bucket}, key: ${key}`);

		const s3Params: SelectObjectContentCommandInput = {
			Bucket: bucket,
			Key: key,
			ExpressionType: 'SQL',
			Expression: 'SELECT * FROM s3object s LIMIT 1',
			InputSerialization: {
				CSV: {
					FileHeaderInfo: 'NONE',
					FieldDelimiter: ',',
					AllowQuotedRecordDelimiter: true,
				},
				CompressionType: 'NONE',
			},
			OutputSerialization: {
				CSV: {
					FieldDelimiter: ',',
				},
			},
		};
		const result = await this.s3Client.send(new SelectObjectContentCommand(s3Params));
		let headers;
		if (result.Payload) {
			for await (const event of result.Payload) {
				if (event.Records?.Payload) {
					headers = toUtf8(event.Records.Payload).split(`\r\n`)[0]?.split(',');
				}
			}
		}

		this.log.info(`ReferenceDatasetService > getFileHeaders > exit > headers: ${JSON.stringify(headers)}`);
		return headers;
	}

	public async updatePartial(securityContext: SecurityContext, id: string, toUpdate: ReferenceDatasetUpdateMetadata): Promise<void> {
		this.log.info(`ReferenceDatasetService> updatePartial> referenceDataset:${JSON.stringify(toUpdate)}`);

		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastContributor, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`admin\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		await this.repository.updatePartial(id, toUpdate);

		this.log.info(`ReferenceDatasetService> updatePartial> referenceDataset:${JSON.stringify(toUpdate)}`);
	}

	public async update(securityContext: SecurityContext, id: string, toUpdate: EditReferenceDataset & { s3Location?: S3Location; groups?: string[] }): Promise<ReferenceDataset> {
		this.log.info(`ReferenceDatasetService> update> referenceDataset:${JSON.stringify(toUpdate)}`);

		// check if we have changes to make besides the state property. State property is excluded, because we want to validate if you are not potentially
		const hasChanges = Object.keys(toUpdate);

		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastContributor, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`admin\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		const existing = await this.get(securityContext, id);

		if (!existing) {
			throw new Error(`ReferenceDataset with id: ${id} not found`);
		}

		// verify is permissible to group
		const isAllowed = this.authChecker.matchGroup(existing.groups, securityContext.groupId);
		if (!isAllowed) {
			throw new UnauthorizedError(`This group has not been granted access to reference dataset '${id}'.`);
		}

		// we need to short-circuit updating an existing RD if its current state is disabled or frozen. Users should only be allowed to make updates to existing RD
		// if the existing state is enabled or the user passes the state
		if (hasChanges.length > 0) {
			if (existing.state === 'disabled' && !hasChanges.includes('state')) {
				throw new ReferenceDatasetDefinitionError(`Cannot update ${id} since its current state is ${existing.state}`);
			}
		}

		if (toUpdate.activeAt && !dayjs(toUpdate.activeAt).isValid()) {
			throw new InvalidRequestError('Invalid Date specified double check if the date/time is in ISO8601 local time');
		}

		const currentVersion = existing.version;
		const updatedVersion = currentVersion + 1;
		const uid = new ShortUniqueId({ length: 10 });
		const changeId = uid();

		let referenceDatasetContent: string | S3Location = toUpdate.data;
		let headersFromFile: string[];
		let headersFromMetadata: string[] = existing.datasetHeaders;

		if (toUpdate.datasetHeaders) {
			headersFromMetadata = toUpdate.datasetHeaders;
		}

		let s3Location, uploadUrl, indexS3Location;

		// if the user is updating the headers and haven't provided the data content or datasetSource, then we need to validate the new headers with the existing file
		if (toUpdate.datasetHeaders && !toUpdate.datasetSource && !toUpdate.data) {
			referenceDatasetContent = existing.s3Location;
			headersFromFile = await this.getFileHeaders(referenceDatasetContent.bucket, referenceDatasetContent.key);
			this.validateFileHeaders(headersFromFile, headersFromMetadata);
		}

		if (toUpdate.datasetSource === 's3') {
			existing.state = 'frozen';
			existing.status = 'pendingUpload';
			existing.statusMessage = 'expecting dataset(csv) to be uploaded using the singed url';
			// the content will be uploaded later
			uploadUrl = await this.getReferenceDatasetUploadUrl(securityContext, id, changeId);
		} else if (toUpdate.data) {
			existing.state = 'frozen';
			existing.status = 'inProgress';
			existing.statusMessage = 'processing dataset(csv)';

			// If user specify file content in http request body
			referenceDatasetContent = toUpdate.data;
			headersFromFile = parse(referenceDatasetContent)[0];

			// store the dataset file either from inline or from the file
			try {
				// validate the headers, if this throws an error, we will catch it and update the status, state, and statusMessage on the RD
				this.validateFileHeaders(headersFromFile, headersFromMetadata);
				// validation is successful, lets store the new dataset file/inline data to S3
				const [dataFileBucket, dataFileKey] = await this.storeDatasetFile(id, referenceDatasetContent, changeId);
				// since it's an update (new file) we need to update its location on the RD object
				s3Location = { key: dataFileKey, bucket: dataFileBucket };
				// we expect the file to be re-indexed
				indexS3Location = {
					key: `${this.bucketPrefix}/${id}/${changeId}/`,
					bucket: dataFileBucket,
				};
			} catch (e) {
				existing.state = 'disabled';
				existing.status = 'failed';
				existing.statusMessage = `mismatched file headers, verify file headers match with reference dataset headers`;
			}
		}

		const merged = this.mergeUtils.mergeResource(existing, toUpdate as unknown) as ReferenceDatasetWithS3;
		merged.version = updatedVersion;
		merged.updatedBy = securityContext.email;
		merged.updatedAt = new Date(Date.now()).toISOString();
		merged.activeAt = toUpdate.activeAt ? dayjs.utc(toUpdate.activeAt).toISOString() : undefined;

		if (s3Location) {
			merged.s3Location = s3Location;
		}

		if (indexS3Location) {
			merged.indexS3Location = indexS3Location;
		}

		// determine which tags are to add/delete
		const tagDiff = this.tagService.diff(existing.tags, merged.tags);

		await this.repository.update(merged, tagDiff.toAdd, tagDiff.toDelete);

		await this.tagService.submitGroupSummariesProcess(securityContext.groupId, PkType.ReferenceDataset, tagDiff.toAdd, tagDiff.toDelete);

		if (toUpdate.data) {
			await this.executeIndexerStateMachine(merged);
		}

		await this.eventPublisher.publishEvent({
			id,
			resourceType: 'referenceDataset',
			eventType: 'created',
			old: existing,
			new: merged,
		});

		this.log.info(`ReferenceDatasetService> update> exit > updatedReferenceDataSet:${merged}`);
		delete merged.s3Location;

		return {
			...merged,
			uploadUrl,
		};
	}

	public async getReferenceDatasetUploadUrl(securityContext: SecurityContext, id: string, version: number, expiration: number = DEFAULT_SIGNED_URL_EXPIRATION): Promise<string> {
		this.log.info(`ReferenceDatasetService> getReferenceDatasetUploadUrl> id:${id}`);

		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');

		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller's role should be at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		const encodedGroupId = securityContext.groupId.replaceAll('/', '|||');

		const params: PutObjectCommand = new PutObjectCommand({
			Bucket: this.bucketName,
			Key: `${this.bucketPrefix}/${id}/${version}/${encodedGroupId}/${fileUploadName}`,
		});

		const signedUrl = await this.getSignedUrl(this.s3Client, params, { expiresIn: expiration });

		this.log.info(`ReferenceDatasetService>  > generatePipelineExecutionUrl > exit`);
		return signedUrl;
	}

	public async getReferenceDatasetDownloadUrl(securityContext: SecurityContext, id: string, version?: number, expiration: number = DEFAULT_SIGNED_URL_EXPIRATION): Promise<SignedUrlResponse> {
		this.log.info(`ReferenceDatasetService>  getContentSignedUrl> id:${id}, version: ${version}`);
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller's role should be at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		let referenceDataset;
		if (version) {
			referenceDataset = await this.repository.get(id, version);
		} else {
			[referenceDataset] = (await this.repository.listByIds([id])) as ReferenceDatasetWithS3[];
		}

		if (!referenceDataset || !referenceDataset.s3Location) {
			throw new NotFoundError(`File for Reference Dataset ${id} cannot be found`);
		}

		const params: GetObjectCommandInput = {
			Key: referenceDataset?.s3Location?.key,
			Bucket: referenceDataset?.s3Location?.bucket,
		};

		const signedUrl = await this.getSignedUrl(this.s3Client, new GetObjectCommand(params), { expiresIn: expiration });
		this.log.info(`ReferenceDatasetService>  getContentSignedUrl> exit > signedUrl: ${signedUrl}`);
		return { url: signedUrl };
	}

	public async getReferenceDatasetIndexDownloadUrl(securityContext: SecurityContext, id: string, version?: number, expiration = DEFAULT_SIGNED_URL_EXPIRATION): Promise<SignedUrlResponse> {
		this.log.info(`ReferenceDatasetService>  getReferenceDatasetIndexDownloadUrl> id:${id}, version: ${version}`);
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller's role should be at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		let referenceDataset;
		if (version) {
			referenceDataset = await this.repository.get(id, version);
		} else {
			[referenceDataset] = (await this.repository.listByIds([id])) as ReferenceDatasetWithS3[];
		}

		if (!referenceDataset || !referenceDataset.indexS3Location) {
			throw new NotFoundError(`Index for Reference Dataset ${id} cannot be found`);
		}

		const params: GetObjectCommandInput = {
			Key: referenceDataset?.indexS3Location?.key,
			Bucket: referenceDataset?.indexS3Location?.bucket,
		};

		const signedUrl = await this.getSignedUrl(this.s3Client, new GetObjectCommand(params), { expiresIn: expiration });
		this.log.info(`ReferenceDatasetService>  getContentSignedUrl> exit > signedUrl: ${signedUrl}`);
		return { url: signedUrl };
	}

	public async getContent(securityContext: SecurityContext, id: string, version?: number): Promise<string> {
		this.log.info(`ReferenceDatasetService>  getContent> id:${id}, version: ${version}`);

		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller's role should be at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		let referenceDataset;
		if (version) {
			referenceDataset = await this.repository.get(id, version);
		} else {
			[referenceDataset] = (await this.repository.listByIds([id])) as ReferenceDatasetWithS3[];
		}

		if (!referenceDataset) {
			throw new NotFoundError(`File for Reference Dataset ${id} cannot be found`);
		}

		const params: GetObjectCommandInput = {
			Key: referenceDataset?.s3Location?.key,
			Bucket: referenceDataset?.s3Location?.bucket,
		};

		const referenceDatasetObject = await this.s3Client.send(new GetObjectCommand(params));
		this.log.info(`ReferenceDatasetService> getContent> exit>`);
		return referenceDatasetObject.Body as unknown as string;
	}

	public async delete(securityContext: SecurityContext, id: string): Promise<void> {
		this.log.info(`ReferenceDatasetService>  delete> id:${id}, securityContext: ${securityContext}`);
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastAdmin, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller's role should be at least a \`superAdmin\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// check exists along with security checks
		const existing = await this.get(securityContext, id);

		await this.repository.delete(id);

		// async tag group processing
		await this.tagService.submitGroupSummariesProcess(securityContext.groupId, PkType.ReferenceDataset, {}, existing.tags);

		await this.eventPublisher.publishEvent({
			id,
			resourceType: 'referenceDataset',
			eventType: 'deleted',
			old: existing,
		});

		this.log.info(`ReferenceDatasetService>  delete> exit:${id}`);
	}

	public async get(securityContext: SecurityContext, id: string, version?: number): Promise<ReferenceDatasetWithS3 | undefined> {
		this.log.info(`ReferenceDatasetService>  get> id:${id}, version: ${version}`);

		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller's role should be at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		const referenceDataset = await this.repository.get(id, version);
		if (version) {
			const latest = await this.repository.get(id);
			if (latest.state === 'disabled' || latest.state === 'frozen') {
				referenceDataset.state = latest.state;
			}
		}

		if (!referenceDataset) {
			throw new NotFoundError(`Reference Dataset ${id} cannot be found`);
		}

		// verify is permissible to group
		const isAllowed = this.authChecker.matchGroup(referenceDataset.groups, securityContext.groupId);
		if (!isAllowed) {
			throw new UnauthorizedError(`The reference dataset is not part of this group.`);
		}

		this.log.info(`ReferenceDatasetService> get> exit> referenceDataset:${JSON.stringify(referenceDataset)}`);
		return referenceDataset;
	}

	public async list(securityContext: SecurityContext, options: ReferenceDatasetListOptions): Promise<[ReferenceDataset[], ReferenceDatasetListPaginationKey]> {
		this.log.info(`ReferenceDatasetService> listReferenceDatasets>  options: ${JSON.stringify(options)}`);

		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller's role should be at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		let referenceDatasets: ReferenceDataset[] = [],
			paginationKey,
			referenceDatasetIds = [];

		if (options.name) {
			this.log.debug(`ReferenceDatasetService> listReferenceDatasets> searching by name : ${options.name}`);
			options.name = options.name.toLowerCase();
			referenceDatasetIds = await this.resourceService.listIdsByAlternateId(securityContext.groupId, options.name, {
				includeParentGroups: options?.includeParentGroups,
				includeChildGroups: options?.includeChildGroups,
			});
		} else {
			this.log.debug(`ReferenceDatasetService> listReferenceDatasets> listing by group context : ${securityContext.groupId}`);
			[referenceDatasetIds, paginationKey] = await this.resourceService.listIds(securityContext.groupId, PkType.ReferenceDataset, {
				tagFilter: options?.tags,
				includeParentGroups: options?.includeParentGroups,
				includeChildGroups: options?.includeChildGroups,
				pagination: {
					count: options?.count,
					from: {
						paginationToken: options?.exclusiveStart?.paginationToken,
					},
				},
			});
		}

		if ((referenceDatasetIds?.length ?? 0) > 0) {
			referenceDatasets = (await this.repository.listByIds(referenceDatasetIds)) as ReferenceDataset[];
		}
		this.log.info(`ReferenceDatasetService> listReferenceDatasets>  referenceDatasets: ${JSON.stringify(referenceDatasets)}`);
		return [referenceDatasets, paginationKey];
	}

	public async listVersions(securityContext: SecurityContext, id: string, options: ReferenceDatasetListVersionsOptions): Promise<[ReferenceDataset[], ReferenceDatasetListVersionPaginationKey]> {
		this.log.info(`ReferenceDatasetService> listVersions> id:${id}, options:${JSON.stringify(options)}`);
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId], securityContext.groupRoles, atLeastReader, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller's role should be at least a \`reader\` of the group in context \`${JSON.stringify(securityContext.groupId)}`);
		}

		// retrieve the versions
		let referenceDatasets: ReferenceDataset[] = [];
		let paginationKey: ReferenceDatasetListVersionPaginationKey = undefined;
		do {
			// retrieve a page of versions
			[referenceDatasets, paginationKey] = await this.repository.listVersions(id, options);

			// as each version may have different groups applied, check group membership individually
			const versionsToRemove: number[] = [];
			for (let i = 0; i < referenceDatasets.length; i++) {
				const version = referenceDatasets[i];
				const isAllowed = this.authChecker.matchGroup(version.groups, securityContext.groupId);
				if (!isAllowed) {
					versionsToRemove.push(i);
				}
			}
			for (let i = versionsToRemove.length - 1; i >= 0; i--) {
				referenceDatasets.splice(versionsToRemove[i], 1);
			}

			// once we have checked the version we may have ended up with less than the requested page of results. if so, retrieve the next page
		} while (paginationKey !== undefined && referenceDatasets.length < options.count);

		this.log.info(`ReferenceDatasetService> listVersions> exit> referenceDatasets:${JSON.stringify([referenceDatasets, paginationKey])}`);
		return [referenceDatasets, paginationKey];
	}

	public async grant(securityContext: SecurityContext, id: string, groupId: string): Promise<void> {
		this.log.debug(`ReferenceDatasetService> grant> id:${id}, groupId:${groupId}`);

		// Authz check - Only `admin` and above of both current and target groups may grant
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId, groupId], securityContext.groupRoles, atLeastAdmin, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`admin\` of either the group in context \`${JSON.stringify(securityContext.groupId)} or the target group \`${groupId}\`.`);
		}

		// retrieve existing (also verifying permissions)
		const existing = await this.get(securityContext, id);
		if (!existing) {
			throw new NotFoundError(`Reference Dataset '${id}' not found.`);
		}

		// verify target group exists
		const targetGroupExists = await this.groupsService.isGroupExists(groupId);
		if (!targetGroupExists) {
			throw new NotFoundError(`Group '${id}' not found.`);
		}

		// grant
		await this.groupsService.grant(
			{
				id: existing.id,
				alternateId: existing.name,
				keyPrefix: PkType.ReferenceDataset,
			},
			{ id: groupId }
		);

		// update the main resource item
		existing.groups.push(groupId);
		await this.update(securityContext, id, existing);

		this.log.debug(`ReferenceDatasetService> grant> exit:`);
	}

	public async revoke(securityContext: SecurityContext, id: string, groupId: string): Promise<void> {
		this.log.debug(`ReferenceDatasetService> revoke> id:${id}, groupId:${groupId}`);

		// Authz check - Only `admin` and above of both current and target groups may grant
		const isAuthorized = this.authChecker.isAuthorized([securityContext.groupId, groupId], securityContext.groupRoles, atLeastAdmin, 'all');
		if (!isAuthorized) {
			throw new UnauthorizedError(`The caller is not an \`admin\` of either the group in context \`${JSON.stringify(securityContext.groupId)} or the target group \`${groupId}\`.`);
		}

		// retrieve existing (also verifying permissions)
		const existing = await this.get(securityContext, id);
		if (!existing) {
			throw new NotFoundError(`Reference Dataset '${id}' not found.`);
		}

		// verify target group exists
		const targetGroupExists = await this.groupsService.isGroupExists(groupId);
		if (!targetGroupExists) {
			throw new NotFoundError(`Group '${id}' not found.`);
		}

		// revoke
		await this.groupsService.revoke(
			{
				id: existing.id,
				alternateId: existing.name,
				keyPrefix: PkType.ReferenceDataset,
			},
			{ id: groupId }
		);

		// update the main resource item
		const index = existing.groups.indexOf(groupId);
		if (index > 0) {
			existing.groups.splice(index, 1);
			await this.update(securityContext, id, existing);
		}

		this.log.debug(`ReferenceDatasetService> revoke> exit:`);
	}

	public async executeIndexerStateMachine(referenceDataset: ReferenceDataset): Promise<void> {
		// Trigger State Machine
		const { executionArn } = await this.sfnClient.send(
			new StartExecutionCommand({
				stateMachineArn: this.stateMachineArn,
				input: JSON.stringify(referenceDataset),
			})
		);

		if (!executionArn) {
			throw new Error('Could not start State Machine');
		}
	}
}
