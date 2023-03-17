# Reference Datasets Overview

## Introduction

This module allows user to upload file containing extra information of the datasets used in when calculating emission. The created reference dataset resource
can be referenced when users create
the [calculation](../calculations/README.md) resource or [pipeline configuration](../pipelines/README.md) resource.

## REST API

Refer to the [Swagger](docs/swagger.json) for a detailed list of the available REST API endpoints.

## Walkthrough

### Pre-requisite

For this walkthrough, we assume that user had been logged in, has the right permission and the group context is set to `/group1` in the id token generated
by `Cognito`.

For more details access controls and permissions, look at the [Access Management](../access-management/README.md) module.

### Example 1: Creating Reference Dataset

Content of sample file named `sampleData.csv` shown below:

```csv
ZIP,STATE
1111,WA
2222,CO
```

#### Request

You can create the reference dataset referencing your local csv file using [multipart/form-data](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods/POST)
content type as shown below:

```shell
curl --location --request POST 'http://<REFERENCE_DATASET_URL>/referenceDatasets' \
	--header 'Accept-Version: 1.0.0' \
	--header 'Content-Type: multipart/form-data' \
	--header 'Authorization: <token>' \
	--form 'name="sample_dataset"' \
	--form 'description="this dataset contains zip code and state"' \
	--form 'data=@"./sampleData.csv"' \ 						# Path to your local reference dataset file
	--form 'datasetHeaders="[\"ZIP\",\"STATE\"]";type=application/json' \ 		# notice that you have specify the application/json type
	--form 'tags="{\"type\":\"Material/Metal/Steel\"}";type=application/json' 	# notice that you have specify the application/json type
```

or `application/json` as shown below:

```shell
POST /referenceDatasets
Accept: application/json
Content-Type: application/json

{
  "name": "sample_dataset",
  "description": "this dataset contains zip code and state",
  "data": "ZIP,STATE\n1111,WA\n2222,CO",
  "datasetHeaders": [
    "ZIP",
    "STATE"
  ],
  "tags": {
    "datasource": "GHG Protocol",
    "type": "Material/Metal/Steel"
  }
}
```

#### Response

```sh
HTTP: 201 OK
Content-Type: application/json

{
  "id": "01gfsht4w2a2ht6jxze9x8gtc5",
  "createdAt": "2022-10-20T01:58:33.098Z",
  "createdBy": "someone@example.com",
  "name": "sample_dataset",
  "version": 1,
  "description": "this dataset contains zip code and state",
  "datasetHeaders": [
    "ZIP",
    "STATE"
  ],
  "groups": [
    "/group1"
  ],
  "tags": {
    "type": "Material/Metal/Steel",
    "datasource": "GHG Protocol"
  },
  "state": "enabled"
}
```

### Example 2: Retrieving The Newly Created Reference Dataset

Using the reference dataset id returned by the previous example, you can then retrieve the reference dataset by issuing the following command:

#### Request

```shell
GET /referenceDatasets/<referenceDatasetId>
Accept: application/json
```

#### Response

```shell
Content-Type: application/application/json
{
    "id": "01gfsht4w2a2ht6jxze9x8gtc5",
    "createdAt": "2022-10-20T01:58:33.098Z",
    "createdBy": "someone@example.com",
    "name": "sample_dataset",
    "version": 1,
    "description": "this dataset contains zip code and state",
    "datasetHeaders": [
        "ZIP",
        "STATE"
    ],
    "groups": [
        "/group1"
    ],
    "tags": {
        "type": "Material/Metal/Steel",
        "datasource": "GHG Protocol"
    },
    "state": "enabled"
}

```

### Example 3: Listing All Reference Datasets On Your Current Group Context

If you create multiple reference datasets, you can list all of them by issuing the following commands (this will return all reference datasets in your **current
group context**):

#### Request

```shell
GET /referenceDatasets
Accept: application/json
```

#### Response

```shell
Content-Type: application/application/json
{
    "referenceDatasets": [
        {
            "id": "01gfsht4w2a2ht6jxze9x8gtc5",
            "createdAt": "2022-10-20T01:58:33.098Z",
            "createdBy": "someone@example.com",
            "name": "sample_dataset",
            "version": 1,
            "description": "this dataset contains zip code and state",
            "datasetHeaders": [
                "ZIP",
                "STATE"
            ],
            "groups": [
                "/group1"
            ],
            "tags": {
                "type": "Material/Metal/Steel",
                "datasource": "GHG Protocol"
            },
            "state": "enabled"
        }
    ]
}

```

### Example 4: Modifying Reference Dataset

Content of the updated file named `sampleDataUpdated.csv` sample is shown below:

```csv
ZIP,STATE,COUNTRY
1111,WA,USA
2222,CO,USA
```

You can modify the reference dataset referencing your local csv file using `multipart/form-data` content type as shown below:

```shell
curl --location --request PATCH 'http://<REFERENCE_DATASET_URL>/referenceDatasets' \
	--header 'Accept-Version: 1.0.0' \
	--header 'Content-Type: multipart/form-data' \
	--header 'Authorization: <token>' \
	--form 'description="this dataset contains zip code, state and country"' \
	--form 'data=@"./sampleDataUpdated.csv"' \ # Path to your updated file
	--form 'datasetHeaders="[\"ZIP\",\"STATE\"]";type=application/json'
```

or `application/json` as shown below:

```shell
PATCH /referenceDatasets/<referenceDatasetId>
Accept: application/json
Content-Type: application/json

{
	"description": "this dataset contains zip code state, and country",
	"data": "ZIP,STATE,COUNTRY\n1111,WA,USA\n2222,CO,USA",
	"datasetHeaders": [
		"ZIP",
		"STATE",
		"COUNTRY"

	]
}
```

#### Response

```sh
HTTP: 200
Content-Type: application/json

{
    "id": "01gfsht4w2a2ht6jxze9x8gtc5",
    "createdAt": "2022-10-20T01:58:33.098Z",
    "createdBy": "someone@example.com",
    "updatedAt": "2022-10-20T02:10:01.136Z",
    "updatedBy": "someone@example.com",
    "name": "sample_dataset",
    "version": 2,
    "description": "this dataset contains zip code state, and country",
    "datasetHeaders": [
        "ZIP",
        "STATE",
        "COUNTRY"
    ],
    "groups": [
        "/group1"
    ],
    "tags": {
        "type": "Material/Metal/Steel",
        "datasource": "GHG Protocol"
    },
    "state": "enabled"
}
```

### Example 5: Listing Multiple Versions Of Reference Dataset

You can list all the versions of a particular reference dataset by issuing the following command:

#### Request

```shell
GET /referenceDatasets/<id>/versions
Accept: application/json

```

#### Response

```shell
Content-Type: application/json
{
	"referenceDatasets": [
		{
			"id": "01gfsht4w2a2ht6jxze9x8gtc5",
			"createdAt": "2022-10-20T01:58:33.098Z",
			"createdBy": "someone@example.com",
			"name": "sample_dataset",
			"version": 1,
			"description": "this dataset contains zip code and state",
			"datasetHeaders": [
				"ZIP",
				"STATE"
			],
			"groups": [
				"/group1"
			],
			"tags": {
				"type": "Material/Metal/Steel",
				"datasource": "GHG Protocol"
			},
			"state": "enabled"
		},
		{
			"id": "01gfsht4w2a2ht6jxze9x8gtc5",
			"createdAt": "2022-10-20T01:58:33.098Z",
			"createdBy": "someone@example.com",
			"updatedAt": "2022-10-20T02:10:01.136Z",
			"updatedBy": "someone@example.com",
			"name": "sample_dataset",
			"version": 2,
			"description": "this dataset contains zip code state, and country",
			"datasetHeaders": [
				"ZIP",
				"STATE",
				"COUNTRY"
			],
			"groups": [
				"/group1"
			],
			"tags": {
				"type": "Material/Metal/Steel",
				"datasource": "GHG Protocol"
			},
			"state": "enabled"
		}
	]
}
```

### Example 6: Getting The Content Of Reference Dataset As Signed Url

You can retrieve the `Get Signed Url` of the reference dataset uploaded file by running the following command:

#### Request

```shell
GET /referenceDatasets/<id>/data
Accept: application/json # Notice the application/json type
```

#### Response

```shell
Content-Type: application/json
{
  "url": "https://<bucketname>.s3.ap-southeast-2.amazonaws.com/01gfsht4w2a2ht6jxze9x8gtc5/2/data.csv?X-Amz-A..."
}

```

### Example 7: Getting the Content of Reference Dataset in the Body Content

You can retrieve the content file of the reference dataset in the http response body by issuing the following command:

#### Request

```shell
GET /referenceDatasets/<id>/data
Accept: text/csv # Notice the text/csv type
```

#### Response

```shell
Content-Type: text/csv
ZIP,STATE,COUNTRY
1111,WA,USA
2222,CO,USA
```

### Example 8: Listing Reference Datasets By Tags

You can retrieve all reference datasets using its tag value (and its parent). In the sample above we're creating reference dataset with
tags `Material/Metal/Steel`, this allows user to list the reference dataset by passing that tag value and all its parents (`Material/Metal/Steel`
,`Material/Metal`,`Material`)

#### Request

```shell
GET /referenceDatasets?tags=type=Material/Metal/Steel
Accept: application/json
```

#### Response

```shell
Content-Type: application/json
{
    "referenceDatasets": [
        {
            "id": "01gfsht4w2a2ht6jxze9x8gtc5",
            "createdAt": "2022-10-20T01:58:33.098Z",
            "createdBy": "someone@example.com",
            "updatedAt": "2022-10-20T02:10:01.136Z",
            "updatedBy": "someone@example.com",
            "name": "sample_dataset",
            "version": 2,
            "description": "this dataset contains zip code state, and country",
            "datasetHeaders": [
                "ZIP",
                "STATE",
                "COUNTRY"
            ],
            "groups": [
                "/group1"
            ],
            "tags": {
                "type": "Material/Metal/Steel",
                "datasource": "GHG Protocol"
            },
            "state": "enabled"
        }
    ]
}
```

### Example 9: Listing Reference Datasets By Its Alias (Name)

You can retrieve all reference datasets using its alias (`name` is the alias used by Reference Dataset module)

#### Request

```shell
GET /referenceDatasets?name=sample_dataset
Accept: application/json
```

#### Response

```shell
Content-Type: application/json
{
    "referenceDatasets": [
        {
            "id": "01gfsht4w2a2ht6jxze9x8gtc5",
            "createdAt": "2022-10-20T01:58:33.098Z",
            "createdBy": "someone@example.com",
            "updatedAt": "2022-10-20T02:10:01.136Z",
            "updatedBy": "someone@example.com",
            "name": "sample_dataset",
            "version": 2,
            "description": "this dataset contains zip code state, and country",
            "datasetHeaders": [
                "ZIP",
                "STATE",
                "COUNTRY"
            ],
            "groups": [
                "/group1"
            ],
            "tags": {
                "type": "Material/Metal/Steel",
                "datasource": "GHG Protocol"
            },
            "state": "enabled"
        }
    ]
}
```

### Example 10: Creating Reference Dataset By Uploading The File Using Signed Url

#### Request

You can create the reference dataset by uploading the file into s3 using signed url in 2 steps.

First, create the reference dataset metadata by running the command below (specify `datasetSource` parameter as `s3`):

```shell
POST /referenceDatasets
Accept: application/json
Content-Type: application/json

{
  "name": "sample_dataset",
  "description": "this dataset contains zip code and state",
  "datasetSource" : "s3",
  "datasetHeaders": [
    "ZIP",
    "STATE"
  ],
  "tags": {
    "datasource": "GHG Protocol",
    "type": "Material/Metal/Steel"
  }
}
```

#### Response

```sh
HTTP: 201 OK
Content-Type: application/json

{
  "id": "01gfsht4w2a2ht6jxze9x8gtc5",
  "createdAt": "2022-10-20T01:58:33.098Z",
  "createdBy": "someone@example.com",
  "name": "sample_dataset",
  "version": 1,
  "description": "this dataset contains zip code and state",
  "datasetHeaders": [
    "ZIP",
    "STATE"
  ],
  "groups": [
    "/group1"
  ],
  "tags": {
    "type": "Material/Metal/Steel",
    "datasource": "GHG Protocol"
  },
  "state": "enabled",
  "uploadUrl": "https://<s3 bucket>/referenceDatasets/01gfsht4w2a2ht6jxze9x8gtc5/2/%7C%7C%7C/data_upload.csv?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Conten..."
}
```

Note the `uploadUrl` in the response, this is the signed url that you can use to upload your local data file by running the command below:

```sh
curl --upload-file ./my_local_data_file.csv 'https://s3-presigned-url-goes-here'
```

### Example 11: Updating Reference Dataset By Uploading The File Using Signed Url

#### Request

You can create the reference dataset by uploading the file into s3 using signed url in 2 steps.

First, update the reference dataset metadata by running the command below (specify `datasetSource` parameter as `s3`):

```shell
PATCH /referenceDatasets/<referenceDatasetId>
Accept: application/json
Content-Type: application/json

{
  "datasetSource" : "s3",
  "datasetHeaders": [
    "ZIP",
    "STATE",
    "COUNTRY"
  ]
}
```

#### Response

```sh
HTTP: 201 OK
Content-Type: application/json

{
  "id": "01gfsht4w2a2ht6jxze9x8gtc5",
  "createdAt": "2022-10-20T01:58:33.098Z",
  "createdBy": "someone@example.com",
  "name": "sample_dataset",
  "version": 3,
  "description": "this dataset contains zip code , state and country",
  "datasetHeaders": [
    "ZIP",
    "STATE",
    "COUNTRY"
  ],
  "groups": [
    "/group1"
  ],
  "tags": {
    "type": "Material/Metal/Steel",
    "datasource": "GHG Protocol"
  },
  "state": "enabled",
  "uploadUrl": "https://<s3 bucket>/referenceDatasets/01gfsht4w2a2ht6jxze9x8gtc5/4/%7C%7C%7C/data_upload.csv?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNE..."
}
```

Note the `uploadUrl` in the response, this is the signed url that you can use to upload your local data file by running the command below:

```sh
curl --upload-file ./my_local_data_file.csv 'https://s3-presigned-url-goes-here'
```

### Example 12: Listing All Tags Created As Part Of Resource Creation

You can retrieve all tags that as filter when you're listing the reference datasets by running the command below:

#### Request

```shell
GET /referenceDatasets/tags/<tagKey> # In the create example the tagKey is type
Accept: application/json
```

#### Response

```shell
Content-Type: application/json
{
    "values": {
        "material": "Material"
    }
}
```

You can also specify `parentValue` in the query string to list its children as shown below:

#### Request

```shell
GET /referenceDatasets/tags/<tagKey>?parentValue=<parentValue> # In the create example the tagKey is type and parentValue can be Material or Material/Metal
Accept: application/json
```

#### Response

```shell
Content-Type: application/json
{
    "values": {
        "material/metal": "Metal"
    }
}
```
