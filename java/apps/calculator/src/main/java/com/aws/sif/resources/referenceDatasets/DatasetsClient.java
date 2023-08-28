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

package com.aws.sif.resources.referenceDatasets;

import com.aws.sif.Authorizer;
import com.aws.sif.lambdaInvoker.LambdaInvoker;
import com.aws.sif.resources.ResourcesRepository;
import com.typesafe.config.Config;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.Validate;
import org.apache.lucene.analysis.standard.StandardAnalyzer;
import org.apache.lucene.document.Document;
import org.apache.lucene.index.DirectoryReader;
import org.apache.lucene.queryparser.classic.QueryParser;
import org.apache.lucene.search.*;
import org.apache.lucene.store.FSDirectory;
import org.zeroturnaround.zip.ZipUtil;

import javax.inject.Inject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.URL;
import java.nio.channels.Channels;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;

@Slf4j
public class DatasetsClient {
    private final LambdaInvoker<DatasetsList> datasetsListInvoker;
    private final LambdaInvoker<Dataset> datasetsInvoker;
    private final LambdaInvoker<DataDownload> dataDownloadInvoker;
    private final Config config;
    private final ResourcesRepository repository;
    private final Map<String, Dataset> referenceDatasetsCache;
    private final Map<String, IndexSearcher> indexCache;
    private final Map<String, ResourcesRepository.Mapping> mappingCache;
    private final Map<String, Integer> activationDateVersionCache;

    @Inject
    public DatasetsClient(LambdaInvoker<DatasetsList> datasetsListInvoker, LambdaInvoker<Dataset> datasetsInvoker, LambdaInvoker<DataDownload> dataDownloadInvoker,
            Config config, ResourcesRepository repository) {
        this.datasetsListInvoker = datasetsListInvoker;
        this.dataDownloadInvoker = dataDownloadInvoker;
        this.config = config;
        this.repository = repository;
        this.indexCache = new HashMap<>();
        this.mappingCache = new HashMap<>();
        this.activationDateVersionCache = new HashMap<>();
        this.datasetsInvoker = datasetsInvoker;
        this.referenceDatasetsCache = new HashMap<>();
    }

    public GetValueResponse getValue(String pipelineId, String executionId, String groupContextId, Authorizer authorizer, String name, String value, String outputColumn, String keyColumn, Optional<String> tenantId, Optional<String> version, Optional<String> versionAsAt) throws ReferenceDatasetNotFoundException {
        log.debug("getValue> in> pipelineId:{}, executionId:{}, groupContextId:{}, name:{}, value:{}, columnName:{}, tenantId:{}, version:{}, versionAsAt:{}",
                pipelineId, executionId, groupContextId, name, value, outputColumn, tenantId, version, versionAsAt);

        Validate.notEmpty(pipelineId);
        Validate.notEmpty(executionId);
        Validate.notEmpty(groupContextId);
        Validate.notEmpty(name);
        Validate.notEmpty(value);
        Validate.notEmpty(outputColumn);
        Validate.notEmpty(keyColumn);

        // find the id that corresponds to the name
        var mapping = getLatestByName(pipelineId, executionId, groupContextId, authorizer, name, tenantId);

        // find the key value from the dataset
        var actualVersion = ("latest".equals(version.orElse("latest"))) ? mapping.getLatestVersion() : Integer.parseInt(version.get());
        String result;

        if (versionAsAt.isPresent()) {
            result = getByIdVersionAsAtKey(pipelineId, executionId, groupContextId, authorizer, mapping.getId(), value, outputColumn, keyColumn, versionAsAt.get(), tenantId);
        } else {
            result = getByIdVersionKey(pipelineId, executionId, groupContextId, authorizer, mapping.getId(), value, outputColumn, keyColumn, actualVersion, tenantId);
        }

        var response = new GetValueResponse(result, actualVersion);
        log.debug("getValue> exit:{}", response);
        return response;
    }

    private String referenceDatasetVersionCacheKey(String pipelineId, String executionId, String groupContextId, String id, int version, Optional<String> tenantId) {
        return String.format("%s:%s:%s:%s:%s:%s", pipelineId, executionId, groupContextId, id, version, tenantId.orElse(""));
    }

    private ResourcesRepository.Mapping getLatestByName(String pipelineId, String executionId, String groupContextId, Authorizer authorizer, String name, Optional<String> tenantId) throws ReferenceDatasetNotFoundException {
        log.debug("getLatestByName> in> pipelineId:{}, executionId:{}, groupContextId:{}, name:{}, tenantId:{}",
                pipelineId, executionId, groupContextId, name, tenantId);

        // do we already have it cached locally?
        var cacheKey = String.format("%s:%s:%s:%s:%s", pipelineId, executionId, groupContextId, name, tenantId.orElse(""));
        if (!mappingCache.containsKey(cacheKey)) {
            // not in cache, but do we have it already available in the database?
            var mapping = repository.getMapping(pipelineId, executionId, groupContextId, ResourcesRepository.Type.LOOKUP, name);
            if (mapping!=null) {
                mappingCache.put(cacheKey, mapping);
            } else {
                // not in db either so let's get it, then cache it for future use
                var dataset = invokeGetDatasetByName(groupContextId, authorizer, name, tenantId);
                var newMapping = new ResourcesRepository.Mapping(dataset.getId(), dataset.getVersion());
                repository.saveMapping(pipelineId, executionId, groupContextId, ResourcesRepository.Type.LOOKUP, name, newMapping);
                mappingCache.put(cacheKey, newMapping);
            }
        }

        var mapping = mappingCache.get(cacheKey);
        log.debug("getLatestByName> exit:{}", mapping);
        return mapping;
    }

    private String getByIdVersionKey(String pipelineId, String executionId, String groupContextId, Authorizer authorizer, String id, String value, String outputColumn, String keyColumn, int version, Optional<String> tenantId) throws ReferenceDatasetNotFoundException {
        log.debug("getByIdVersionKey> in> pipelineId:{}, executionId:{}, groupContextId:{}, id:{}, value:{}, outputColumn:{}, keyColumn: {}, version:{}, tenantId:{}",
                pipelineId, executionId, groupContextId, id, value, outputColumn, keyColumn, version, tenantId);

        Validate.notEmpty(pipelineId);
        Validate.notEmpty(executionId);
        Validate.notEmpty(groupContextId);
        Validate.notEmpty(value);
        Validate.notEmpty(outputColumn);
        Validate.notEmpty(keyColumn);

        var referenceDatasetCacheKey = referenceDatasetVersionCacheKey(pipelineId, executionId, id, groupContextId, version, tenantId);
        if (!referenceDatasetsCache.containsKey(referenceDatasetCacheKey)) {
            var dataset = invokeGetDatasetByVersion(groupContextId, authorizer, id, version, tenantId);
            referenceDatasetsCache.put(referenceDatasetCacheKey, dataset);
        }
        var dataset = referenceDatasetsCache.get(referenceDatasetCacheKey);

        var headerList = Arrays.asList(dataset.getDatasetHeaders());
        String columnNotFoundErrorStr = String.format("Requested column '%s' or '%s' not found in dataset '%s' (version %s)", outputColumn, keyColumn, id, version);
        if (!headerList.contains(keyColumn) || !headerList.contains(outputColumn)) {
            throw new ArithmeticException(columnNotFoundErrorStr);
        }

        // do we already have the index initialized for the dataset
        var indexCacheKey = String.format("%s:%s:%s:%s:%d:%s", pipelineId, executionId, groupContextId, id, version, tenantId.orElse(""));
        log.trace("getByIdVersionKey> datasetCacheKey:{}", indexCacheKey);

        // check if index is already initialized in cache
        if(!indexCache.containsKey(indexCacheKey)) {
            // if not then, we have to initialize the index
            // first we have to check if the index file was download previously
            var localZippedIndexLocation = String.format("%s/%s/%s/%d/index.zip", config.getString("calculator.temp.location"), groupContextId.replaceAll("/","___"), id, version);
            var localExtractedIndexLocation = String.format("%s/%s/%s/%d/index", config.getString("calculator.temp.location"), groupContextId.replaceAll("/","___"), id, version);
            var localFile = new File(localZippedIndexLocation);
            // check if the zipped index file has already been downloaded
            if (!localFile.exists()) {
                // does not exist locally therefore download
                localFile.getParentFile().mkdirs();
                var downloadUrl = getDownloadUrl(groupContextId, authorizer, id, version, tenantId);
                download(downloadUrl.getUrl(), localZippedIndexLocation);
            }
            // at this point the index file should be available to initialize the index in memory and cache the searcher
            var searcher = initializeIndex(localZippedIndexLocation, localExtractedIndexLocation);
            // once initialized, lets add the searcher to indexCache. This is in memory so need to rebuild the index in memory
            // once it's been initialized. This will help us track multiple indexes and utilize an initialized searcher rather than
            // rebuilding the searcher everytime a lookup needs to happen.
            this.indexCache.put(indexCacheKey, searcher);
        }

        // At this point there should be a lucene index initialized which we can use to perform the searches
        IndexSearcher searcher = indexCache.get(indexCacheKey);

        List<Document> documents;
        try {
            // let's build the search query which we need to perform
            // another thing to notice in the parse method that we wrap the value in double quotes, this is done to perform exact match search and avoid cases
            // where the value could be "OR" which is a lucene query lang syntax keyword or values with special chars "R-123" where the result would do fuzzy search and find "R-*"
            Query query = new QueryParser(keyColumn, new StandardAnalyzer()).parse(String.format("\"%s\"", value));
            // since we are always looking for 1 result, this query limit can be set to 1. If there is a case where we need to return multiple results
            // that implementation can create the search and a constant specified on what a meaning limit needs to be.
            // NOTE: The search method also has "Sort.INDEXORDER" property passed in. This allows to sort the results by the order of how the docs were indexed
            // as compared to "Sort.RELEVANCE". The difference between the 2 is, one will sort based on relevance and other on index order. We need to ensure that
            // the returned results won't change in order based on their relevance but should always be sorted by how they were indexed.
            TopDocs docs = searcher.search(query, 1, Sort.INDEXORDER);
            // we get lucene docs back, gotta do some conversion
            documents = new ArrayList<>();
            // let's add them as "docs" to the docs list
            for (ScoreDoc scoreDoc : docs.scoreDocs) {
                documents.add(searcher.doc(scoreDoc.doc));
            }
        } catch (Exception e) {
            log.error("getByIdVersionKey> error> lucene exception:", e);
            throw new RuntimeException("failed to parse lucene query", e);
        }

        if (documents.size() == 0) {
            return null;
        }
        // let's get the output column the document has fields on it, we first get the first doc and then get the field we need.
        String result = documents.get(0).get(outputColumn);

        log.debug("getByIdVersionKey> out> result: {}", result);

        // at last, returning the search result value we were looking for
        return result;
    }

    private String getByIdVersionAsAtKey(String pipelineId, String executionId, String groupContextId, Authorizer authorizer, String id, String value, String outputColumn, String keyColumn, String versionAsAt, Optional<String> tenantId) throws ReferenceDatasetNotFoundException {
        log.debug("getByIdVersionAsAtKey> in> pipelineId:{}, executionId:{}, groupContextId:{}, id:{}, value:{}, outputColumn:{}, keyColumn: {}, versionAsAt:{}, tenantId:{}", pipelineId, executionId, groupContextId, id, value, outputColumn, keyColumn, versionAsAt, tenantId);

        Validate.notEmpty(pipelineId);
        Validate.notEmpty(executionId);
        Validate.notEmpty(groupContextId);
        Validate.notEmpty(value);
        Validate.notEmpty(outputColumn);
        Validate.notEmpty(keyColumn);
        Validate.notEmpty(versionAsAt);

        var activationDateVersionCacheKey = String.format("%s:%s:%s:%s:%s:%s", pipelineId, executionId, groupContextId, id, versionAsAt, tenantId.orElse(""));

        if (!activationDateVersionCache.containsKey(activationDateVersionCacheKey)) {
            var dataset = this.invokeGetDatasetByVersionAsAt(groupContextId, authorizer, id, versionAsAt, tenantId);
            activationDateVersionCache.put(activationDateVersionCacheKey, dataset.getVersion());
        }
        var version = activationDateVersionCache.get(activationDateVersionCacheKey);
        var result = this.getByIdVersionKey(pipelineId, executionId, groupContextId, authorizer, id, value, outputColumn, keyColumn, version, tenantId);

        log.debug("getByIdVersionAsAtKey> out> result: {}", result);
        // at last, returning the search result value we were looking for
        return result;
    }


    private Dataset invokeGetDatasetByName(String groupContextId, Authorizer authorizer, String name, Optional<String> tenantId) throws ReferenceDatasetNotFoundException {
        log.debug("invokeGetDatasetByName> in> groupContextId:{}, name:{}, tenantId:{}", groupContextId, name, tenantId);

        Validate.notEmpty(groupContextId);
        Validate.notEmpty(name);

        var functionName = config.getString("calculator.referenceDatasets.functionName");
        var path = "/referenceDatasets";

        var queryString = Optional.of(Map.of("name", name));

        var list = this.datasetsListInvoker.invokeFunction(functionName, groupContextId, authorizer, "GET", path, queryString, Optional.empty(), tenantId, DatasetsList.class);

        if (list.getBody()==null ||  list.getBody().getReferenceDatasets()==null ||  list.getBody().getReferenceDatasets().length==0) {
            throw new ReferenceDatasetNotFoundException(String.format("Reference dataset for name '%s' not found.", name));
        }
        var dataset = list.getBody().getReferenceDatasets()[0];

        log.debug("invokeGetDatasetByName> exit:{}", dataset);
        return dataset;
    }

    private Dataset invokeGetDatasetByVersion(String groupContextId, Authorizer authorizer, String id, int version, Optional<String> tenantId) throws ReferenceDatasetNotFoundException {
        log.debug("invokeGetDatasetByVersion> in> groupContextId:{}, version:{}, tenantId:{}", groupContextId, version, tenantId);

        Validate.notEmpty(groupContextId);
        Validate.notEmpty(id);

        var functionName = config.getString("calculator.referenceDatasets.functionName");
        var path = String.format("/referenceDatasets/%s/versions/%s", id, version);

        var datasetResponse = this.datasetsInvoker.invokeFunction(functionName, groupContextId, authorizer, "GET", path, Optional.empty(), Optional.empty(), tenantId, Dataset.class);

        var dataset = datasetResponse.getBody();

        log.debug("invokeGetDatasetByVersion> exit:{}", dataset);
        return dataset;
    }

    private Dataset invokeGetDatasetByVersionAsAt(String groupContextId, Authorizer authorizer, String id, String versionAsAt, Optional<String> tenantId) throws ReferenceDatasetNotFoundException {
        log.debug("invokeGetDatasetByVersionAsAt> in> groupContextId:{}, versionAsAt:{}, tenantId:{}", groupContextId, versionAsAt, tenantId);

        Validate.notEmpty(groupContextId);
        Validate.notEmpty(versionAsAt);
        Validate.notEmpty(id);

        var functionName = config.getString("calculator.referenceDatasets.functionName");
        var path = String.format("/referenceDatasets/%s/versions?versionAsAt=%s", id, versionAsAt);

        var list = this.datasetsListInvoker.invokeFunction(functionName, groupContextId, authorizer, "GET", path, Optional.empty(), Optional.empty(), tenantId, DatasetsList.class);

        if (list.getBody() == null || list.getBody().getReferenceDatasets() == null || list.getBody().getReferenceDatasets().length == 0) {
            throw new ReferenceDatasetNotFoundException(String.format("Reference dataset for specified versionAsAt '%s' not found.", versionAsAt));
        }
        var dataset = list.getBody().getReferenceDatasets()[0];

        log.debug("invokeGetDatasetByVersionAsAt> exit:{}", dataset);
        return dataset;
    }


    private DataDownload getDownloadUrl(String groupContextId, Authorizer authorizer, String id, int version, Optional<String> tenantId) throws ReferenceDatasetNotFoundException {
        log.debug("getDownloadUrl> in> groupContextId:{}, id:{}, version:{}, tenantId:{}", groupContextId, id, version, tenantId);

        Validate.notEmpty(groupContextId);
        Validate.notEmpty(id);

        var functionName = config.getString("calculator.referenceDatasets.functionName");
        var path = String.format("/referenceDatasets/%s/versions/%d/index", id, version);

        var response = this.dataDownloadInvoker.invokeFunction(functionName, groupContextId, authorizer, "GET", path, Optional.empty(), Optional.empty(), tenantId, DataDownload.class);

        var file = response.getBody();

        log.debug("getDownloadUrl> exit:{}", file);
        return file;

    }

    private IndexSearcher initializeIndex(String localIndexZipFileLocation, String tempIndexLocation) {
        log.debug("initializeIndex> in> localIndexFileLocation:{}", localIndexZipFileLocation);

        Validate.notEmpty(localIndexZipFileLocation);
        Validate.notEmpty(tempIndexLocation);

        try {
            Path path = Paths.get(tempIndexLocation);
            //first we have to unpack the zipped index file
            ZipUtil.unpack(new File(localIndexZipFileLocation), new File(tempIndexLocation));
            // let's delete the zip file, once we have unpacked it.
            File file = new File(localIndexZipFileLocation);
            file.delete();
            // use the lucene directory reader to open the directory
            FSDirectory directory = FSDirectory.open(path);
            DirectoryReader reader = DirectoryReader.open(directory);
            // initialize the lucene searcher
            log.debug("initializeIndex> out> ");

            return new IndexSearcher(reader);

        } catch (Exception e) {
            throw new RuntimeException("failed to initialize the lucene index", e);
        }

    }

    private void download(String fileURL, String localFilename) throws ReferenceDatasetNotFoundException {
        log.debug("download> in> fileURL:{}, localFilename:{}", fileURL, localFilename);

        Validate.notEmpty(fileURL);
        Validate.notEmpty(localFilename);

        try (var readableByteChannel = Channels.newChannel((new URL(fileURL)).openStream());
             var fileOutputStream = new FileOutputStream(localFilename);
             var fileChannel = fileOutputStream.getChannel()) {
            fileChannel.transferFrom(readableByteChannel, 0, Long.MAX_VALUE);
        } catch (IOException e) {
            throw new ReferenceDatasetNotFoundException("Unable to download reference dataset.", e);
        }
    }

    @Data
    public static class GetValueResponse {
        final String value;
        final int version;
    }
}
