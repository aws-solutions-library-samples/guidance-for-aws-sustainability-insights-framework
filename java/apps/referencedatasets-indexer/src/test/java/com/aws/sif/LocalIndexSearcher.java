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
import lombok.extern.slf4j.Slf4j;
import org.apache.lucene.analysis.standard.StandardAnalyzer;
import org.apache.lucene.document.Document;
import org.apache.lucene.index.DirectoryReader;
import org.apache.lucene.index.IndexReader;
import org.apache.lucene.queryparser.classic.ParseException;
import org.apache.lucene.queryparser.classic.QueryParser;
import org.apache.lucene.search.IndexSearcher;
import org.apache.lucene.search.Query;
import org.apache.lucene.search.ScoreDoc;
import org.apache.lucene.search.TopDocs;
import org.apache.lucene.store.FSDirectory;
import org.apache.lucene.util.Version;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

@Slf4j
public class LocalIndexSearcher {

    private IndexRequest.IndexRequestBuilder prepareRequest() {
        return IndexRequest.builder()
                .id("01gkmvmny0m6gd4vbjc2mp7xa8")
                .groups(new String[]{"a/b/c"})
                .datasetHeaders(new String[]{"Index", "Organization Id", "Name", "Website", "Country", "Description", "Founded", "Industry", "No of Employees"});

    }

    @Test
    public void search() throws IOException, ParseException {

        var request = prepareRequest().build();

        var indexLocation = String.format("%s/index",  request.getId());

        Path path = Paths.get("/tmp", indexLocation);

        FSDirectory directory = FSDirectory.open(path);
        DirectoryReader reader = DirectoryReader.open(directory);

        IndexSearcher searcher = new IndexSearcher(reader);

        Query query = new QueryParser("Industry", new StandardAnalyzer()).parse("think");

        TopDocs topDocs = searcher.search(query, 10);

        List<Document> documents = new ArrayList<>();
        for (ScoreDoc scoreDoc : topDocs.scoreDocs) {
            documents.add(searcher.doc(scoreDoc.doc));
        }

        log.debug("docs", documents.get(0));
    }
}
