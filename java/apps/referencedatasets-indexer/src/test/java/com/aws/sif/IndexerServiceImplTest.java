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

import org.apache.lucene.index.DirectoryReader;
import org.apache.lucene.search.IndexSearcher;
import org.apache.lucene.store.FSDirectory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.zeroturnaround.zip.commons.FileUtils;
import uk.org.webcompere.systemstubs.environment.EnvironmentVariables;
import uk.org.webcompere.systemstubs.jupiter.SystemStub;
import uk.org.webcompere.systemstubs.jupiter.SystemStubsExtension;

import java.io.File;
import java.io.IOException;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;


import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@ExtendWith(SystemStubsExtension.class)
@Slf4j
public class IndexerServiceImplTest {

    @SystemStub
    private EnvironmentVariables environmentVariables;
    @Mock
    private S3Utils s3Utils;

    @Mock
    private Config config;


    private IndexerService underTest;


    @BeforeEach
    public void initEach(){
        environmentVariables
                .set("AWS_REGION", "us-west-2")
                .set("TENANT_ID", "abc123")
                .set("ENVIRONMENT", "dev");

        underTest = new IndexerImpl(s3Utils,config, new ZipUtils());
    }

    @Test
    public void happyPath() throws IOException {
        S3SourceLocation location = new S3SourceLocation();
        location.setBucket("bucket");

        S3Location indexS3Location = new S3Location();
        indexS3Location.setBucket("bucket");
        indexS3Location.setKey("referenceDatasets/rd1/ImfGXETymI/");

        var request = IndexRequest.builder()
                .id("rd1")
                .groups(new String[]{"/"})
                .datasetHeaders(new String[]{"Organization Id","Index","Name","Website","Country","Description","Founded","Industry","Number of employees"})
                .version(2)
                .s3Location(location)
                .indexS3Location(indexS3Location)
                .build();

        when(config.getString("indexer.temp.location")).thenReturn("/tmp");


        // build some data, which we can use later to do some searching on.
        when(s3Utils.download(request.getS3Location())).thenReturn(
                "Index,Organization Id,Name,Website,Country,Description,Founded,Industry,Number of employees\n" +
                "1,E84A904909dF528,Liu-Hoover,http://www.day-hartman.org/,Western Sahara,Ergonomic zero administration knowledge user,1980,Online Publishing,6852\n" +
                "2,AAC4f9aBF86EAeF,Orr-Armstrong,https://www.chapman.net/,Algeria,Ergonomic radical budgetary management,1970,Import / Export,7994\n" +
                "3,ad2eb3C8C24DB87,Gill-Lamb,http://lin.com/,Cote d'Ivoire,Programmable intermediate conglomeration,2005,Apparel / Fashion,5105\n" +
                "4,D76BB12E5eE165B,Bauer-Weiss,https://gillespie-stout.com/,OR,Synergistic maximized definition,2015,Dairy,9069\n" +
                "5,2F31EddF2Db9aAE,Love-Palmer,https://kramer.com/,Denmark,Optimized optimizing moderator,2010,Management Consulting,6991\n" +
                "6,6774DC1dB00BD11,\"Farmer, Edwards and Andrade\",http://wolfe-boyd.com/,Norfolk Island,Virtual leadingedge benchmark,2003,Mental Health Care,3503\n" +
                "7,116B5cD4eE1fAAc,\"Bass, Hester and Mcclain\",https://meza-smith.com/,Uzbekistan,Multi-tiered system-worthy hub,1994,Computer Hardware,2762\n" +
                "8,AB2eA15d98b6BD4,\"Strickland, Gray and Jensen\",http://kerr.info/,Israel,Team-oriented fresh-thinking knowledge user,1987,Performing Arts,7020\n" +
                "9,0c6D831e8DceCfE,\"Sparks, Decker and Powell\",https://www.howe.net/,Israel,Down-sized content-based info-mediaries,1977,Marketing / Advertising / Sales,2709\n" +
                "10,9ABE0c8aee135d6,\"Osborn, Ford and Macdonald\",http://www.mcdonald-watts.biz/,Syrian Arab Republic,Optional coherent focus group,1990,Investment Banking / Venture,5731\n" +
                "1000,3ddb89ecD83B533,\"Maddox, Owen and Shepherd\",https://www.hamilton.com/,Guinea,Reactive bottom-line pricing structure,2019,Animation,4467\n");

        var actual = (IndexResponse) underTest.process(request);

        assertEquals(actual.id, request.getId());
        assertEquals(actual.groupId, request.getGroups()[0]);
        assertEquals(actual.status, "success");
        assertEquals(actual.statusMessage, "successfully created index");
        assertEquals(actual.indexS3Location.getBucket(), "bucket");
        assertEquals(actual.indexS3Location.getKey(), "referenceDatasets/rd1/ImfGXETymI/index.zip");

        // validate if the index itself was created
        File indexDir = new File("/tmp/rd1/2/index");
        assertTrue(indexDir.exists());

        // validate if the index zip was created
        File indexedZip = new File("/tmp/rd1/2/index.zip");
        assertTrue(indexedZip.exists());

        // Lets test some queries on the index itself
        Path path = Paths.get("/tmp/rd1/2/index");
        FSDirectory directory = FSDirectory.open(path);
        DirectoryReader reader = DirectoryReader.open(directory);
        IndexSearcher searcher = new IndexSearcher(reader);
        // all of this code above is to initialize the searcher

        // test if the number of documents indexed the number of rows in indexed
        assertEquals(reader.numDocs(), 11);

        var uniqueIdTest = Searcher.search(searcher, "Organization Id", "_docId", "E84A904909dF528");

        // verify the unique _docId field we create to introduce a unique id field
        // the unique id field has the following format <datasetid>_<version>_<row#>
        assertEquals(uniqueIdTest, "rd1_2_0");

        // let's search something which doesn't exist
        var somethingThatDoesntExist = Searcher.search(searcher, "Index", "Organization Id", "non-existing-item");
        // it should return nothing, zilch, nada !
        assertNull(somethingThatDoesntExist);

        // will try to find a value which is on a tokenized field, the term "edwards" in the dataset appears at item 6
        // and its actually "Farmer, Edwards and Andrade". this should get us the Index which is 6
        var partOfText = Searcher.search(searcher, "Name", "Index", "edwards");
        // you might wonder why 6 is a string, everything we index is indexed as string today. The caculator is smart enough
        // to cast types and figure out whats what. To keep things simple we can index as string. If tomorrow we need to index
        // as strict types, we need to change the reference dataset api which somehow tells us what individual column types are.
        assertEquals(partOfText, "6");

        // let's test an edge case were if the term is one of 'OR' or 'AND' etc which are actual query language specific terms, causes an issue where the search query looks like an incomplete query
        // basically we have to ensure 'OR' and other keywords are treated as string literals
        var orTermSearch = Searcher.search(searcher, "Country", "_docId", "OR");

        assertEquals(orTermSearch, "rd1_2_3");

    }

    @Test
    public void cannotDownloadData() {
        var request = IndexRequest.builder()
                .id("rd2")
                .groups(new String[]{"/"})
                .datasetHeaders(new String[]{"Index", "Organization Id", "Name", "Website", "Country", "Description", "Founded", "Industry", "Number of employees"})
                .version(2)
                .build();

        when(s3Utils.download(request.getS3Location()))
                .thenThrow(new RuntimeException(String.format("\"Failed downloading %s, error: %s",  request, "some error" )));

        var actual = (IndexResponse) underTest.process(request);

        assertEquals(actual.status, "failed");
        assertEquals(actual.statusMessage, String.format("\"Failed downloading %s, error: %s",  request, "some error" ));

    }

    @Test
    public void largeDatasetSorts() throws IOException, URISyntaxException {
        S3SourceLocation location = new S3SourceLocation();
        location.setBucket("bucket");

        S3Location indexS3Location = new S3Location();
        indexS3Location.setBucket("bucket");
        indexS3Location.setKey("referenceDatasets/rd3/ImfGXETymI/");

        var request = IndexRequest.builder()
                .id("rd3")
                .groups(new String[]{"/"})
                .datasetHeaders(new String[]{"Index", "Organization Id", "Name", "Website", "Country", "Description", "Founded", "Industry", "Number of employees"})
                .version(2)
                .s3Location(location)
                .indexS3Location(indexS3Location)
                .build();

        when(config.getString("indexer.temp.location")).thenReturn("/tmp");

        // lets load some larger data to index
        when(s3Utils.download(request.getS3Location())).thenReturn(Files.readString(Paths.get(getClass().getClassLoader().getResource("sample-data-1k.csv").toURI())));

        // let's load the index
        var actual = (IndexResponse) underTest.process(request);

        Path path = Paths.get("/tmp/rd3/2/index");
        FSDirectory directory = FSDirectory.open(path);
        DirectoryReader reader = DirectoryReader.open(directory);
        IndexSearcher searcher = new IndexSearcher(reader);
        // all of this code above is to initialize the searcher

        // test if the number of documents indexed the number of rows in indexed, sample-data-1k has 1k rows + 1 header
        assertEquals(reader.numDocs(), 1000);

        // lets perform several searchers and then compare the first result. We want to ensure that they are always in order and the first one is always the same.
        // This tests the  "Sort.INDEXORDER" paramter passed through the search. This allows us to sort the results by their index order (the order the docs were indexed, this is will be based on the sequentialness of the csv)
        // If we dont have  "Sort.INDEXORDER" then the order of the results can be different, becauses the searcher is going to search by relevance.
        var docs = Searcher.searchMultiple(searcher, "Name", "group",10);
        var docs2 = Searcher.searchMultiple(searcher, "Name", "group",4);
        var docs3 = Searcher.searchMultiple(searcher, "Name", "group",1);

        // let's compare the results from docs and docs2 and we are going to compare the _docId field to be the same
        assertEquals(docs.get(0).get("_docId"), docs2.get(0).get("_docId"));

        // let's compare the results from docs2 and docs3 and we are going to compare the _docId field to be the same
        assertEquals(docs2.get(0).get("_docId"), docs3.get(0).get("_docId"));

    }

    @Test
    public void dataset40KTiming() throws URISyntaxException, IOException {
        S3SourceLocation location = new S3SourceLocation();
        location.setBucket("bucket");

        S3Location indexS3Location = new S3Location();
        indexS3Location.setBucket("bucket");
        indexS3Location.setKey("referenceDatasets/rd4/ImfGXETymI/");

        var request = IndexRequest.builder()
                .id("rd4")
                .groups(new String[]{"/"})
                .datasetHeaders(new String[]{"Year","Industry_aggregation_NZSIOC","Industry_code_NZSIOC","Industry_name_NZSIOC","Units","Variable_code","Variable_name","Variable_category","Value","Industry_code_ANZSIC06"})
                .version(2)
                .s3Location(location)
                .indexS3Location(indexS3Location)
                .build();

        when(config.getString("indexer.temp.location")).thenReturn("/tmp");

        // lets load some larger data to index
        when(s3Utils.download(request.getS3Location())).thenReturn(Files.readString(Paths.get(getClass().getClassLoader().getResource("sample-data-40k.csv").toURI())));

        // let's load the index
        long startTime = System.currentTimeMillis();
        var actual = (IndexResponse) underTest.process(request);
        long estimatedTime = System.currentTimeMillis() - startTime;

        // its takes about under 2 secs, avg to create an index of ~ 40k rows (6MB file)
        // don't want to create a test case here for avg time, because this will be different for different types of machine configs like memory, cpu etc.
        log.debug("estimated time creating an index of a csv of about 6MBs and 40k rows: {}", estimatedTime);

        Path path = Paths.get("/tmp/rd4/2/index");
        FSDirectory directory = FSDirectory.open(path);
        DirectoryReader reader = DirectoryReader.open(directory);
        // all of this code above is to initialize the searcher

        // test if the number of documents indexed the number of rows in indexed, sample-data-40k has 41715 rows + 1 header
        assertEquals(reader.numDocs(), 41715);

    }

    @Test
    public void mismatchedHeaders() {
        S3SourceLocation location = new S3SourceLocation();
        location.setBucket("bucket");

        S3Location indexS3Location = new S3Location();
        indexS3Location.setBucket("bucket");
        indexS3Location.setKey("referenceDatasets/rd5/ImfGXETymI/");

        var request = IndexRequest.builder()
                .id("rd5")
                .groups(new String[]{"/"})
                .datasetHeaders(new String[]{"Organization Id","Index","Namess","Websitfee","Countries","Description","Founded","Industry","Number of employees"})
                .version(2)
                .s3Location(location)
                .indexS3Location(indexS3Location)
                .build();

        when(config.getString("indexer.temp.location")).thenReturn("/tmp");


        // build some data, which we can use later to do some searching on. only 2 rows are enough, its going to throw an error anyway !
        when(s3Utils.download(request.getS3Location())).thenReturn(
                "Index,Organization Id,Name,Website,Country,Description,Founded,Industry,Number of employees\n" +
                        "1,E84A904909dF528,Liu-Hoover,http://www.day-hartman.org/,Western Sahara,Ergonomic zero administration knowledge user,1980,Online Publishing,6852\n" +
                        "1000,3ddb89ecD83B533,\"Maddox, Owen and Shepherd\",https://www.hamilton.com/,Guinea,Reactive bottom-line pricing structure,2019,Animation,4467\n");

        var actual = (IndexResponse) underTest.process(request);

        assertEquals(actual.status, "failed");
        assertEquals(actual.statusMessage, "\"Failed creating index rd5, error: mismatched headers: referenceDataset headers: [Organization Id, Index, Namess, Websitfee, Countries, Description, Founded, Industry, Number of employees], file headers: [Index, Organization Id, Name, Website, Country, Description, Founded, Industry, Number of employees]");

    }

    @Test
    public void fileWithNullVals() throws IOException, URISyntaxException {
        S3SourceLocation location = new S3SourceLocation();
        location.setBucket("bucket");

        S3Location indexS3Location = new S3Location();
        indexS3Location.setBucket("bucket");
        indexS3Location.setKey("referenceDatasets/rd6/ImfGXETymI/");

        var request = IndexRequest.builder()
                .id("rd6")
                .groups(new String[]{"/"})
                .datasetHeaders(new String[]{"1_stat_ef","1_stat_ef_full","1_stat_ref_unit","1_mob_fuels","1_mob_gas_vehicles","1_ref","1_ref_full","2_types","2_loc","2_loc_full","2_mar","2_mar_full","2_ste","2_ste_full","Energy Units Options","Energy Unit Conversion","Volume Unit Options","Volume Unit Conversion","Gas Volume Options","Gas Volume Unit Conversion","mass options","mass values"})
                .version(2)
                .s3Location(location)
                .indexS3Location(indexS3Location)
                .build();

        when(config.getString("indexer.temp.location")).thenReturn("/tmp");


        // load data which has null vals in cells in different places
        when(s3Utils.download(request.getS3Location())).thenReturn(Files.readString(Paths.get(getClass().getClassLoader().getResource("sample-data-null.csv").toURI())));

        var actual = (IndexResponse) underTest.process(request);

        Path path = Paths.get("/tmp/rd6/2/index");
        FSDirectory directory = FSDirectory.open(path);
        DirectoryReader reader = DirectoryReader.open(directory);
        IndexSearcher searcher = new IndexSearcher(reader);
        // all of this code above is to initialize the searcher

        // test if the number of documents indexed the number of rows in indexed, sample-data-40k has 96 rows + 1 header
        assertEquals(reader.numDocs(), 91);

        var randomTerm = Searcher.search(searcher, "1_mob_fuels", "2_types", "Diesel");

        assertEquals(randomTerm, "Market");

        var emptyStringInCSV = Searcher.search(searcher, "1_mob_fuels", "2_types", "Jet Fuel");

        assertEquals(emptyStringInCSV, "");

        var nullItem = Searcher.search(searcher, "1_mob_fuels", "2_types", "something that doesnt exist");

        assertNull(nullItem);

        var termSearch = Searcher.search(searcher, "1_ref", "2_loc", "R-402B");

        assertEquals(termSearch, "FRCC");

    }


    @Test
    public void small2LinesWithQuotedValuesTest() throws IOException, URISyntaxException {
        S3SourceLocation location = new S3SourceLocation();
        location.setBucket("bucket");

        S3Location indexS3Location = new S3Location();
        indexS3Location.setBucket("bucket");
        indexS3Location.setKey("referenceDatasets/rd7/ImfGXETymI/");

        var request = IndexRequest.builder()
                .id("rd7")
                .groups(new String[]{"/"})
                .datasetHeaders(new String[]{"Type", "Multiplier"})
                .version(2)
                .s3Location(location)
                .indexS3Location(indexS3Location)
                .build();

        when(config.getString("indexer.temp.location")).thenReturn("/tmp");


        // load data which has null vals in cells in different places
        when(s3Utils.download(request.getS3Location())).thenReturn(
                "Type,Multiplier\n" +
                    "Type1,\"Stationary Combustion:Biomass Fuels - \n" +
                        "Kraft Pulping Liquor, by Wood Furnish:Straw\"\n" +
                    "Type2,\"Multiplier,2\"\n");


        var actual = (IndexResponse) underTest.process(request);

        Path path = Paths.get("/tmp/rd7/2/index");
        FSDirectory directory = FSDirectory.open(path);
        DirectoryReader reader = DirectoryReader.open(directory);
        IndexSearcher searcher = new IndexSearcher(reader);
        // all of this code above is to initialize the searcher

        // test if the number of documents indexed the number of rows in indexed, sample-data-40k has 96 rows + 1 header
        assertEquals(reader.numDocs(), 2);

    }

    @AfterEach
    public void de_initEach() throws IOException {
        // BE CAREFUL: DONT mess with this, you don't want to delete the entire /tmp dir on your local machine
        FileUtils.deleteDirectory(new File("/tmp/rd1"));
        FileUtils.deleteDirectory(new File("/tmp/rd2"));
        FileUtils.deleteDirectory(new File("/tmp/rd3"));
        FileUtils.deleteDirectory(new File("/tmp/rd4"));
        FileUtils.deleteDirectory(new File("/tmp/rd5"));
        FileUtils.deleteDirectory(new File("/tmp/rd6"));
        FileUtils.deleteDirectory(new File("/tmp/rd7"));
    }

}
