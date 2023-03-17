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

package com.aws.sif;

import com.typesafe.config.Config;
import de.siegmar.fastcsv.reader.CsvReader;
import lombok.extern.slf4j.Slf4j;
import org.apache.lucene.document.Document;
import org.apache.lucene.document.Field;
import org.apache.lucene.document.TextField;
import org.apache.lucene.index.IndexWriter;
import org.apache.lucene.index.IndexWriterConfig;
import org.apache.lucene.store.FSDirectory;
import org.jetbrains.annotations.NotNull;

import javax.inject.Inject;
import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.concurrent.atomic.AtomicInteger;


@Slf4j
public class IndexerImpl implements IndexerService {

    private final S3Utils s3;

    private final CsvReader.CsvReaderBuilder readerBuilder;

    private final Config config;

    private final ZipUtils zip;

    @Inject
    public IndexerImpl(S3Utils s3, Config config, ZipUtils zip) {
        this.s3 = s3;
        this.config = config;
        this.zip = zip;
        this.readerBuilder = CsvReader.builder();
    }

    @Override
    public IndexResponse process(@NotNull IndexRequest request) {
        log.debug("process> in> request:{}", request);

        S3Location indexS3Location;

        try {
            // download the referenceDataset file from S3
            var data = downloadReferenceDataset(request);
            // create a path to the output for the lucene index
            Path indexPath = Paths.get(config.getString("indexer.temp.location"), String.format("%s/%d/index",  request.getId(), request.getVersion()));
            // create the lucene index using the request, path and the data
            createLuceneIndex(request, indexPath, data);
            // zip the index for easier uploading/downloading from S3
            String indexOutputZipPath = indexPath + ".zip";
            createIndexZip(indexPath.toString(), indexOutputZipPath);
            // upload the reference dataset lucene zipped index to s3
            indexS3Location = uploadReferenceDatasetIndex(request, indexOutputZipPath);

        } catch (Exception e) {
            var message = String.format("Failed processing index request: %s", e.getMessage());
            log.error(message);

            return IndexResponse.builder()
                    .id(request.getId())
                    .status("failed")
                    .groupId(request.getGroups()[0])
                    .statusMessage(e.getMessage())
                    .build();
        }

        return IndexResponse.builder()
                .id(request.getId())
                .status("success")
                .groupId(request.getGroups()[0])
                .statusMessage("successfully created index")
                .indexS3Location(indexS3Location)
                .build();
    }

    private String downloadReferenceDataset(IndexRequest request) {
        return s3.download(request.getS3Location());
    }

    private void createLuceneIndex(IndexRequest request, Path indexPath, String data) {
        log.debug("createLuceneIndex> in> request:{}, path:{}", request, indexPath);

        try {
            // grab the headers of the csv, we will use this later to create lucene document field
            String[] referenceDatasetHeaders = request.getDatasetHeaders();

            // create a new indexer writer
            FSDirectory indexDir = FSDirectory.open(indexPath);
            IndexWriterConfig indexWriterConfig = new IndexWriterConfig(new CustomAnalyzer())
                    .setOpenMode(IndexWriterConfig.OpenMode.CREATE);

            IndexWriter indexWriter = new IndexWriter(indexDir, indexWriterConfig);

            var reader = this.readerBuilder.build(data);
            // this is kinda funny, that doing a next on the reader solves a problem where the header itself was getting indexed
            // killed 2 birds with one stone ! I get the file headers and the iterator has moved to the contents of the file (second line) where it's ready to be indexed
            var fileHeaders = reader.iterator().next().getFields().toArray(new String[0]);

            // validate the headers to match with the reference datasets, this is important. If the headers don't match then the indexing
            validateHeaders(referenceDatasetHeaders, fileHeaders);

            AtomicInteger index = new AtomicInteger();
            // iterate over each row of the csv
            reader.forEach((row) -> {

                // for each row, create a new lucene document
                Document document = new Document();

                // we will create a unique id field <referenceDatasetId>_<version>_<rowNumber> per document and store that in a field called _docId
                // This is done to ensure when we create and documents they are unique per row per version per referenceDataset to avoid collisions
                // The filed name is called "_docId" so it doesn't collide with user defined id column in the dataset.
                Field idField = new TextField("_docId", String.format("%s_%d_%d", request.getId(), request.getVersion(), index.get()), Field.Store.YES);
                document.add(idField);

                // iterate over the headers, we use this type of loop instead of simplified ones because we need to use the
                // index to get the row and the value for it.
                for(int i=0; i < fileHeaders.length; i++) {
                    // create a new lucene text field for the document
                    // according to the docs TextField field type for lucene doc tokenizes the full input string (which means it's capable of performing full text-searches)
                    Field field = new TextField(fileHeaders[i], row.getField(i), Field.Store.YES);
                    // add the field to the document
                    document.add(field);
                }

                // add the document to the writer
                try {
                    indexWriter.addDocument(document);
                } catch (IOException e) {
                    var message = String.format("\"Failed creating index error: %s", e.getMessage() );
                    throw new RuntimeException(message, e);
                }

                // increment the atomic counter
                index.getAndIncrement();

            });

            // close the writer, this creates the final index
            indexWriter.close();
        } catch (Exception e) {
            var message = String.format("\"Failed creating index %s, error: %s", request.getId(), e.getMessage() );
            log.error("createLuceneIndex> " + e.getMessage(), e);
            throw new RuntimeException(message, e);
        }
    }

    private void createIndexZip(String sourcePath, String destinationPath) {
        log.debug("createIndexZip> in> sourcePath:{}, destinationPath: {}", sourcePath, destinationPath);
        // zip the index, the index created by lucene is a directory, for easy uploading and download via S3 we will create a zip file
        try {
            this.zip.zipDirectory(sourcePath, destinationPath);
        } catch (Exception e) {
            var message = String.format("\"Failed creating index zip file %s, error: %s",  destinationPath, e.getMessage() );
            log.error("createIndexZip> " + e.getMessage(), e);
            throw new RuntimeException(message, e);
        }
    }

    private S3Location uploadReferenceDatasetIndex(IndexRequest request, String indexOutputZipPath) {
        log.debug("uploadReferenceDatasetIndex> in> request:{}, indexOutputZipPath: {}", request, indexOutputZipPath);

        // NOTE: the version here is incremented to reflect the future state of the reference dataset eventually when the object
        // is updated in dynamodb. This updates outside of this indexer, the state machine has a second step after indexing the dataset
        // which will update the referenceDataset record to the future version. Hence we will create the index where its in sync with
        // the future and final version of the dataset
        String keyPath = String.format("%sindex.zip",  request.getIndexS3Location().getKey());

        S3Location location = new S3Location();
        location.setBucket(request.getIndexS3Location().getBucket());
        location.setKey(keyPath);

        // upload the zipped index to S3
        this.s3.uploadFile(location, indexOutputZipPath);

        return location;
    }

    private void validateHeaders(String[] referenceDatasetHeaders, String[] fileHeaders) {
        // since we don't care about the order, we just need to match if the elements match or not. Sorting them both provides us the ability to compare them easily
        // why did I choose to do the validation this way ? couple of reasons. T
        // 1 The headers can contain duplicates like so "state,zipcode,state,city" (if excel allows it, then its valid !)
        // the order of the headers don't matter. we will index them by how they are defined in the file itself.
        // we just need to compare if the length matches and the items are the same.
        // to avoid nested for-loops etc, we can do in a simpler way, sort both of the arrays and then compare them, voila !
        // clone the array to not alter the order of the orignal ones !!!
        var a1 = referenceDatasetHeaders.clone();
        var a2 = fileHeaders.clone();
        Arrays.sort(a1);
        Arrays.sort(a2);

        if(!Arrays.equals(a1, a2)) {
            throw new RuntimeException(String.format("mismatched headers: referenceDataset headers: %s, file headers: %s", Arrays.toString(referenceDatasetHeaders), Arrays.toString(fileHeaders)));
        }


    }


}
