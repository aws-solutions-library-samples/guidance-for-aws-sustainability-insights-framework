## Simple Pipeline Configuration Walkthrough

This walkthrough transforms a provided input file containing shape data into an output file containing the calculates area of the shapes.

Consider the following input file with the following structure:

> The file below contains arbitrary shapes and their size of sides or radius

**input.csv**

| date     | shape_no | shape_type | side_1 | side_2 | radius |
|----------|----------|------------|--------|--------|--------|
| 1/2/2023 | 1        | square     | 10     | 10     | 0      |
| 1/2/2023 | 2        | circle     | 0      | 0      | 5      |
| 1/2/2023 | 3        | square     | 20     | 15     | 0      |
| 1/2/2023 | 4        | unknown    | 10     | 10     | 0      |
| 1/2/2023 | 5        | circle     | 0      | 0      | 15     |

Consider the following generated output file:

> The file below is the expected output which contains the `shape_no`, `shape_type`, `area`, and `size` of the shapes

**output.csv**

| date       | shape_no | shape_type    | area   | size  |
|------------|----------|---------------|--------|-------|
| 1/2/2023   | 1        | square        | 20     | small |
| 1/2/2023   | 2        | circle        | 78.54  | small |
| 1/2/2023   | 3        | square        | 300    | large |
| 1/2/2023   | 4        | unknown shape | 0      | small |
| 1/2/2023   | 5        | circle        | 706.86 | large |

> Business Rules:
>
> - If `shape_type` is not a `circle` or `square` the calculated `area` should be 0
> - The output file should contain 4 columns: `shape_no`, `shape_type`, `area`, and `size`
> - If the `area` is greater than 100 then value of size should be `large` otherwise `small`

### Step 1: Configuring the pipeline

In this step we will be creating a pipeline that takes the above-mentioned `input.csv` file, transforms the data, and saves the output to the above-mentioned `output.csv`:

**REQUEST**

```http request
POST /pipelines

Headers:
    Content-Type: application/json
    Accept: application/json
    Accept-Version: 1.0.0
    Authorization: <REPLACE_WITH_AUTH_TOKEN>

Body:
{
	// since this walkthrough is based on uploading a CSV file we will configure a default csv connector to pre-process the csv input into SIF compatible format
    "connectorConfig": {
        "input": [
            {
                "name": "sif-csv-pipeline-input-connector"
            }
        ]
    },
    "name": "shapeTransformPipeline",

    // Tags can be specified to be used as searchable attributes using the list type api calls. Tags can be hierarchical in
    // nature (see `category` tag as an example).
    "tags": {
        // standard tag
        "source": "sap",
        // hierarchical tag
        "category": "A/B/C"
    },

    // user-defined non-searchable attributes
    "attributes": {
        "key": "val"
    },

    // Transformer Object contains configuration information for the input parameters (data feed to the pipeline) as well as the
    // transforms to be performed on the data feed
    "transformer": {
        // Parameters define the inputs required by the pipeline (i.e. columns that must be provided as part of the input file).
        // The config below contains 6 parameters which are referencing the  `date`, `shape_no`, `shape_type`, `side_1`, `side_2`, and `radius`
		// column from the input file as defined by the parameter `key`.
        "parameters": [
        	  {
                "index": 0,
                // key specifies parameter variable to be referenced in the transform formula
                "key": "date",
                // label for the parameter to describe the parameter (UI display purpose only)
                "label": "Date",
                // description for the parameter to describe the parameter (UI display purpose only)
                "description": "the date for the activity in the row",
                // type of input
                "type": "string"
            },
            {
                "index": 1,
                "key": "shape_no",
                "label": "shape_no",
                "description": "No of the shape (arbitrary sequence number)",
                "type": "number"
            },
            {
                "index": 2,
                "key": "shape_type",
                "label": "shape_type",
                "description": "types of shape",
                "type": "string"
            },
            {
                "index": 3,
                "key": "side_1",
                "label": "side_1",
                "description": "shape side 1 in mm",
                "type": "number"
            },
            {
                "index": 4,
                "key": "side_2",
                "label": "side_2",
               "description": "shape side 2 in mm",
                "type": "number"
            },
            {
                "index": 5,
                "key": "radius",
                "label": "radius",
                "description": "radius in mm",
                "type": "string"
            }
        ],

        // the transforms that will be applied to the input file
        "transforms": [
        	// the first transform will copy the `date` column over and apply the timestamp function
        	// the output of the first transform has to be `timestamp` format
			{
				// index must start from 0, increment each time by 1, and be in sequence
                "index": 0,
                "formula": "AS_TIMESTAMP(:date,'d/M/yy')",
                "outputs": [
                    {
                        "description": "Timestamp of bill.",
                        "index": 0,
                        "key": "time",
                        "label": "Time",
                        "type": "timestamp"
                    }
                ]
            },
            // the second transform copy the `data` column over, apply the timestamp function
            // and round it down to the first of the month,
            {
				"index": 1,
				"formula": "AS_TIMESTAMP(:reading date,'M/d/yy', roundDownTo='year')",
				"outputs": [
				  {
					"description": "Transform date to beginning of year.",
					"index": 0,
					"key": "year",
					"label": "Year",
					"type": "timestamp",
					// notice that we want to use this timestamp output group together any rows that has the same year
					// and apply aggregation function on them (we will calculate the average area for the year), we can only
					// specify one timestamp to `groupBy` when defining pipeline aggregation
					"aggregate": "groupBy"
				  }
				]
			},

            // the third transform will copy the `shape_no` column over
            {
                "index": 2,
                // parameters are referenced by prefixing the key with  ":"
                "formula": ":shape_no",
                "outputs": [
                    {
                        "description": "Shape No output",
                        "index": 0,
                        // the output key represents the name of the column to in the output file to save to
                        "key": "shape_no",
                        "label": "Shape No",
						// the expected type of the transformed result
                        "type": "number"
                    }
                ]
            },

            // The fourth transform, similar to the first, copies the `shape_type` column from the input file
            {
                "index": 3,
                "formula": ":shape_type",
                "outputs": [
                    {
                        "description": "Shape Type",
                        "index": 0,
                        "key": "shape_type",
                        "label": "Shape Type",
                        "type": "number"
                    }
                ]
            },

			// The fifth transform uses the `IF` function to decide how to calculate the shapes area
            {
                "index": 4,
                "formula": "IF(:shape_type=='square',:side_1*:side_2,IF(:shape_type=='circle',3.142*:radius^2,0))",
                "outputs": [
                    {
                        "description": "Area of the shape",
                        "index": 0,
                        "key": "area",
                        "label": "Area",
                        "type": "number",
                        // the optional aggregate field is used to specify what aggegration function to apply
                        // to the output key
                        "aggregate": "mean"
                    }
                ]
            },

            // Thr fourth transform uses another `IF` function to produce the output `small` or `large` based on the size of the area calculated
            // NOTE: you can also cascade if statements be nesting them.
            {
                "index": 5,
                "formula": "IF(REF('area')>=100,'large','small')",
                "outputs": [
                    {
                        "description": "size of the area 'small'|'large' ",
                        "index": 0,
                        "key": "size",
                        "label": "Size",
                        "type": "string"
                    }
                ]
            }
        ]
    }
}


```

**RESPONSE**

```http request
200 OK

Body:
{
    "id": "01gg8sq4rgwmexhac4n2kpxjg2",
    {
    "name": "shapeTransformPipeline",
    "tags": {
        "source": "sap",
        "category": "A/B/C"
    },
    "attributes": {
        "key": "val"
    },
    "transformer": {
        "parameters": [
            {
                "index": 0,
                "key": "date",
                "label": "Date",
                "description": "the date for the activity in the row",
                "type": "string"
            },
            {
                "index": 1,
                "key": "shape_no",
                "label": "shape_no",
                "description": "No of the shape (arbitrary sequence number)",
                "type": "number"
            },
            {
                "index": 2,
                "key": "shape_type",
                "label": "shape_type",
                "description": "types of shape",
                "type": "string"
            },
            {
                "index": 3,
                "key": "side_1",
                "label": "side_1",
                "description": "shape side 1 in mm",
                "type": "number"
            },
            {
                "index": 4,
                "key": "side_2",
                "label": "side_2",
                "description": "shape side 2 in mm",
                "type": "number"
            },
            {
                "index": 5,
                "key": "radius",
                "label": "radius",
                "description": "radius in mm",
                "type": "string"
            }
        ],
        "transforms": [
            {
                "index": 0,
                "formula": "AS_TIMESTAMP(:date,'d/M/yy')",
                "outputs": [
                    {
                        "description": "Timestamp of bill.",
                        "index": 0,
                        "key": "time",
                        "label": "Time",
                        "type": "timestamp"
                    }
                ]
            },
            {
                "index": 1,
                "formula": "AS_TIMESTAMP(:reading date,'M/d/yy', roundDownTo='month')",
                "outputs": [
                    {
                        "description": "Transform date to beginning of year.",
                        "index": 0,
                        "key": "year",
                        "label": "Year",
                        "type": "timestamp",
                        "aggregate": "groupBy"
                    }
                ]
            },
            {
                "index": 2,
                "formula": ":shape_no",
                "outputs": [
                    {
                        "description": "Shape No output",
                        "index": 0,
                        "key": "shape_no",
                        "label": "Shape No",
                        "type": "number"
                    }
                ]
            },
            {
                "index": 3,
                "formula": ":shape_type",
                "outputs": [
                    {
                        "description": "Shape Type",
                        "index": 0,
                        "key": "shape_type",
                        "label": "Shape Type",
                        "type": "number"
                    }
                ]
            },
            {
                "index": 4,
                "formula": "IF(:shape_type=='square',:side_1*:side_2,IF(:shape_type=='circle',3.142*:radius^2,0))",
                "outputs": [
                    {
                        "description": "Area of the shape",
                        "index": 0,
                        "key": "area",
                        "label": "Area",
                        "type": "number",
                        "aggregate": "mean"
                    }
                ]
            },
            {
                "index": 5,
                "formula": "IF(REF('area')>=100,'large','small')",
                "outputs": [
                    {
                        "description": "size of the area 'small'|'large' ",
                        "index": 0,
                        "key": "size",
                        "label": "Size",
                        "type": "string"
                    }
                ]
            }
        ]
    },
    "id": "01gv2gvbfdsac9g84ac1ja0rp9",
    "groups": [
        "/"
    ],
    "createdBy": "<some-email>",
    "createdAt": "2022-10-26T00:05:19.248Z",
    "version": 1,
    "state": "enabled"
}

```

### Step 2: Generating a data file upload URL

Once we have defined a pipeline we can request a data file upload url to feed a data file to the pipeline.

**REQUEST**

```http request
POST /pipelines/<REPLACE_WITH_PIPELINE_ID>/executions

Headers
    Content-Type: application/json
    Accept: application/json
    Accept-Version: 1.0.0
    Content-Type: application/json
    Authorization: <REPLACE_WITH_AUTH_TOKEN>
```

**RESPONSE**

```http request
202 Accepted

{
	"actionType": "create",
	"createdAt": "2023-03-23T18:03:43.725Z",
	"createdBy": "someone@somewhere.com",
	"id": "01gw7t84qd9b9c8sd8xv4ec86t",
	"inputUploadUrl": "https://<bucket>.s3.us-east-1.amazonaws.com/pipelines/01gw7t7pz6ehfhs60ea11qs21j/executions/01gw7t84qd9b9c8sd8xv4ec86t/input/raw?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-C...",
	"pipelineId": "01gw7t7pz6ehfhs60ea11qs21j",
	"pipelineVersion": 1,
	"connectorOverrides": {
		"my-custom-connector": {
			"parameters": {
				"key1": "val1"
			}
		}
	},
	"status": "waiting",
	"groupContextId": "/"
}
```

### Step 3: Uploading the data file to the generated URL

Once an upload URL is generated the sample data file can be uploaded to the pipeline to start execution.

> For this walk-through the file located at `<path-to-ssass>/packages/apps/pipelines/test/shapes.csv` can be used as-is to feed the pipeline we configured at step 1.

**REQUEST**

```shell
POST {{REPLACE_WITH_INPUT_UPLOAD_SIGNED_URL}}

Headers:
    Content-Type: text/csv

"<file contents here>"
```

### Step 3: Check the execution status

Once the file is uploaded to the pipeline, the processor will start processing the file. This creates an execution of the pipeline. Executions for a pipeline can be viewed as follows:

**REQUEST**

```http request
GET /pipelines/{REPLACE_WITH_PIPELINE_ID}/executions

Headers:
    Accept: application/json
    Accept-Version: 1.0.0
    Content-Type: application/json
    Authorization: <REPLACE_WITH_AUTH_TOKEN>
```

**RESPONSE**

```http request
200 OK

Body:
{
    "executions": [
        {
            "id": "qjtgfnrh3",
            "createdAt": "2022-10-25T23:59:22.122Z",
            "updatedAt": "2022-10-25T23:59:42.878Z",
            "createdBy": "<some-email>",
            "updatedBy": "<some-email>",
            "status": "in_progress",
        }
    ]
}

```

### Step 4: Generating am output file download URL

Once the execution is reporting as successful (repeat step 3 until execution is completed), we can generate the output file download URL.

**REQUEST**

```http request
POST /pipelines/{REPLACE_WITH_PIPELINE_ID}/exeuctions/{REPLACE_WITH_EXECUTION_ID}/outputDownloadUrl

Headers:
    Accept: application/json
    Accept-Version: 1.0.0
    Content-Type: application/json
    Authorization: <REPLACE_WITH_AUTH_TOKEN>
```

**RESPONSE**

```shell
202 Accepted

{
    "url": "https://<bucket-name>/pipelines/01gg87pq1jecs04rbgcr1423xq/executions/gq6jg1nlj/input.csv?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha...."
}
```

### Step 5: Download the pipeline execution output file

The URL generated from step 4 can now be used to download the output file as follows:

**REQUEST**

```http request
GET {{REPLACE_WITH_OUTPUT_DOWNLOAD_SIGNED_URL}}
```

Refer to the [./swagger.json](swagger documentation) for details of the full set of API's available.

### (Optional) Step 6: Updating an existing pipeline configuration

The configuration of an existing pipeline can be updated as follows:

> NOTE: Everytime a pipeline is updated, the version is incremented.

**REQUEST**

```http request
PATCH /pipelines/{REPLACE_WITH_PIPELINE_ID}

Headers:
    Accept: application/json
    Accept-Version: 1.0.0
    Content-Type: application/json
    Authorization: <REPLACE_WITH_AUTH_TOKEN>

Body:
{
    "tags": {
        // setting a tag to `null` will remove the tag
        "source": null
    },

    "attributes": {
        // setting an attribute to `null` will remove the tag
        "key": null,
        "newKey": "value"
    },

    // Updating the transformer requires resubmitting the entire transformer configuration:
    "Transformer": {...}
}

```

**RESPONSE**

```http request
200 OK

Body:

{
    "id": "01gg8sq4rgwmexhac4n2kpxjg2",
    "name": "shapeTransformPipeline7",
    "transformer": {
        "transforms": [
            {
                "index": 0,
                "formula": "AS_TIMESTAMP(:date,'d/M/yy')",
                "outputs": [
                    {
                        "description": "Timestamp of bill.",
                        "index": 0,
                        "key": "time",
                        "label": "Time",
                        "type": "timestamp"
                    }
                ]
            },
            {
                "index": 1,
                "formula": "AS_TIMESTAMP(:reading date,'M/d/yy', roundDownTo='month')",
                "outputs": [
                    {
                        "description": "Transform date to beginning of year.",
                        "index": 0,
                        "key": "year",
                        "label": "Year",
                        "type": "timestamp",
                        "aggregate": "groupBy"
                    }
                ]
            },
            {
                "index": 2,
                "formula": ":shape_no",
                "outputs": [
                    {
                        "description": "Shape No output",
                        "index": 0,
                        "key": "shape_no",
                        "label": "Shape No",
                        "type": "number"
                    }
                ]
            },
            {
                "index": 3,
                "formula": ":shape_type",
                "outputs": [
                    {
                        "description": "Shape Type",
                        "index": 0,
                        "key": "shape_type",
                        "label": "Shape Type",
                        "type": "number"
                    }
                ]
            },
            {
                "index": 4,
                "formula": "IF(:shape_type=='square',:side_1*:side_2,IF(:shape_type=='circle',3.142*:radius^2,0))",
                "outputs": [
                    {
                        "description": "Area of the shape",
                        "index": 0,
                        "key": "area",
                        "label": "Area",
                        "type": "number",
                        "aggregate": "mean"
                    }
                ]
            },
            {
                "index": 5,
                "formula": "IF(REF('area')>=100,'large','small')",
                "outputs": [
                    {
                        "description": "size of the area 'small'|'large' ",
                        "index": 0,
                        "key": "size",
                        "label": "Size",
                        "type": "string"
                    }
                ]
            }
        ],
        "parameters": [
            {
                "index": 0,
                "key": "date",
                "label": "Date",
                "description": "the date for the activity in the row",
                "type": "string"
            },
            {
                "index": 1,
                "key": "shape_no",
                "label": "shape_no",
                "description": "No of the shape (arbitrary sequence number)",
                "type": "number"
            },
            {
                "index": 2,
                "key": "shape_type",
                "label": "shape_type",
                "description": "types of shape",
                "type": "string"
            },
            {
                "index": 3,
                "key": "side_1",
                "label": "side_1",
                "description": "shape side 1 in mm",
                "type": "number"
            },
            {
                "index": 4,
                "key": "side_2",
                "label": "side_2",
                "description": "shape side 2 in mm",
                "type": "number"
            },
            {
                "index": 5,
                "key": "radius",
                "label": "radius",
                "description": "radius in mm",
                "type": "string"
            }
        ]
    },
    "state": "enabled",
    "version": 2,
    "attributes": {
        "newKey": "value",
    },
    "tags": {
        "category": "X/Y/Z"
    },
    "groups": [
        "/"
    ],
    "createdAt": "2022-10-26T00:05:19.248Z",
    "createdBy": "<some-email>",
    "updatedAt": "2022-10-26T21:47:53.915Z",
    "updatedBy": "<some-email>"
}

```

### (OPTIONAL) Step 7: listing all versions for a specific pipeline

The following can be used to view all versions of an existing pipeline:

**REQUEST**

```http request
GET /pipelines/<REPLACE_WITH_PIPELINE_ID>/versions

Headers:
    Accept: application/json
    Accept-Version: 1.0.0
    Content-Type: application/json
    Authorization: <REPLACE_WITH_AUTH_TOKEN>
```

**RESPONSE**

```http request
200 OK

Body:
{
    "pipelines": [
        {
        // pipeline object which can referenced from any of the above responses
         ...
        },
        {
         ...
        }
    ]
}
```

### (OPTIONAL) Step 8: Retrieving a specific version for a specific pipeline

If you wanted to retrieve the specific version of your pipeline the following request can be made.

**REQUEST**

```http request
GET /pipelines/<REPLACE_WITH_PIPELINE_ID>/versions/<REPLACE_WITH_VERSION>

Headers:
 Accept-Version: 1.0.0
 Content-Type: application/json
 Authorization: <REPLACE_WITH_AUTH_TOKEN>
```

**RESPONSE**

```http request
200 OK

Body:
{
    "pipelines": [
		...
	]
},
```

### (OPTIONAL) Step 8: Retrieving the latest version of a pipeline

If you want to retrieve the latest version of a pipeline the following request can be made:

**REQUEST**

```http request
GET /pipelines/<REPLACE_WITH_PIPELINE_ID>

Headers:
    Accept: application/json
    Accept-Version: 1.0.0
    Content-Type: application/json
    Authorization: <REPLACE_WITH_AUTH_TOKEN>
```

**RESPONSE**

```http request
200 OK

Body:
{
 // pipeline object which can referenced from any of the above responses
  ...
},
```

### (OPTIONAL) Step 9: Listing pipelines

If you want to list out all pipelines you can make the following API request to retrieve them (depending on the size of the list, this API will also return pagination parameters with the payload).

Listing pipelines with no filters:

**REQUEST**

```http request
GET /pipelines

Headers:
    Accept: application/json
    Accept-Version: 1.0.0
    Content-Type: application/json
    Authorization: <REPLACE_WITH_AUTH_TOKEN>
```

**RESPONSE**

```http request
200 OK

Body:
{
    "pipelines": [
        {
            // pipeline object which can referenced from any of the above responses
            ...
        },
        {
            ...
        }
    ]
}
```

Listing pipelines by tags:

**REQUEST**

```http request
GET /pipelines?tags=category:A,source:sap

Headers:
    Accept: application/json
    Accept-Version: 1.0.0
    Content-Type: application/json
    Authorization: <REPLACE_WITH_AUTH_TOKEN>
```

Listing pipelines by pagination:

**REQUEST**

```http request
GET /pipelines?count=5&fromPipelineId=<REPLACE_WITH_PIPELINED_ID_FROM_PAGINATION>

Headers:
    Accept: application/json
    Accept-Version: 1.0.0
    Content-Type: application/json
    Authorization: <REPLACE_WITH_AUTH_TOKEN>
```
