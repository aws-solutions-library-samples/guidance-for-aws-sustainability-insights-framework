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

import org.apache.lucene.analysis.standard.StandardAnalyzer;
import org.apache.lucene.document.Document;
import org.apache.lucene.queryparser.classic.ParseException;
import org.apache.lucene.queryparser.classic.QueryParser;
import org.apache.lucene.search.*;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

public class Searcher {

    public static String search(IndexSearcher searcher, String keyColumn, String outputColumn, String value) {
        List<Document> documents = new ArrayList<>();
        try {

            // a thing to notice in the parse method that we wrap the value in double quotes, this is done to perform exact match search and avoid cases
            // where the value could be "OR" which is a lucene query lang syntax keyword or values with special chars "R-123" where the result would do fuzzy search and find "R-*"
            Query query = new QueryParser(keyColumn, new StandardAnalyzer()).parse(String.format("\"%s\"", value));

            TopDocs topDocs = searcher.search(query, 10, Sort.INDEXORDER);
            for (ScoreDoc scoreDoc : topDocs.scoreDocs) {
                documents.add(searcher.doc(scoreDoc.doc));
            }

        } catch (Exception e) {
            throw new RuntimeException("searching failed, no results found", e);
        }

        if(documents.size() == 0) {
            return null;
        }

        if(documents.get(0).get(outputColumn) == null) {
            return null;
        }

        return documents.get(0).get(outputColumn);
    }

    public static List<Document> searchMultiple(IndexSearcher searcher, String keyColumn,  String value, int limit) {
        List<Document> documents = new ArrayList<>();
        try {
            Query query = new QueryParser(keyColumn, new StandardAnalyzer()).parse(value);

            TopDocs topDocs = searcher.search(query, limit, Sort.INDEXORDER);
            for (ScoreDoc scoreDoc : topDocs.scoreDocs) {
                documents.add(searcher.doc(scoreDoc.doc));
            }

        } catch (Exception e) {
            throw new RuntimeException("searching failed, no results found", e);
        }

        return documents;
    }

}
