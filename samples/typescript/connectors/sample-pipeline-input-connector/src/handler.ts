import type { EventBridgeHandler } from 'aws-lambda';
import type { ConnectorIntegrationRequestEvent, ConnectorIntegrationResponseEvent } from './models';
import { EventBridgeClient, PutEventsCommandInput, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { PIPELINE_PROCESSOR_CONNECTOR_REQUEST_EVENT, PIPELINE_PROCESSOR_CONNECTOR_RESPONSE_EVENT } from './events';

export const handler: EventBridgeHandler<string, ConnectorIntegrationRequestEvent, void> = async (event, _context, _callback) => {
	console.log(`handler: event: ${JSON.stringify(event)}, context:${_context}`);

	// we are going to capture the connector integration request and filter out the event we are interested in
	// NOTE: we should only receive events which matches our rule pattern defined on the Rule definition in CDK stack
	if (event?.['detail-type'] === PIPELINE_PROCESSOR_CONNECTOR_REQUEST_EVENT) {
		// The event body will be like this:
		// {
		// 	"detail-type": "SIF>com.aws.sif.pipelineProcessor>connectorIntegration>request",
		// 	"source": "com.aws.sif.pipelineProcessor",
		// 	"account": "xxxxxxxxxxxx",
		// 	"time": "2023-03-23T16:41:22Z",
		// 	"region": "us-east-1",
		// 	"resources": [],
		// 	"detail": {
		// 	"pipeline": {
		// 	...
		// 	},
		// 	"executionId": "01gw7nh580em9cxz9m7j0p7x8f",
		// 		"connector": {
		// 		"name": "sif-csv-pipeline-input-connector",
		// 			"parameters": {
		// 		      ...
		// 		}
		// 	},
		// 	 "transformedInputUploadUrl": "https://<bucket>.s3.us-ea…6910549103d97cca0e07&X-Amz-SignedHeaders=host&x-id=PutObject",
		// 	 "rawInputDownloadUrl": "https://<bucket>.s3.us-ea…7e2605e77c792d6975a7&X-Amz-SignedHeaders=host&x-id=GetObject"
		//  }
		// }


		// STEP 1: we can start resolving the integration request by first gathering the source data
		// if our connector relies on an input upload file which is uploaded to kick off the pipeline execution we can download that file like so:
		// the example below utilizes axios to perform the downloading of the raw uploaded file
		// EXAMPLE:
		// const response = await axios({
		// 	method: 'GET',
		// 	url: event.rawInputDownloadUrl,
		// 	responseType: 'stream'
		// });
		// response.data.pipe(fs.createWriteStream("TEMP LOCATION OF FILE"));

		// STEP 2: Converting the source data into SIF format which is json object with key/val pairs terminated by new line char "/\r\n/" (key-val pair of json lines)
		// NOTE: these objects below are just a sample json
		// EXAMPLE:
		// {"a":1,"b":2,"c":3}
		// {"a":11,"b":12,"c":13}
		// {"a":21,"b":22,"c":23}

		// STEP 3: Uploading the converted source data to "transformedInputUploadUrl" pre-signed url.
		// EXAMPLE: (utilizing axios to upload the converted source data)
		// await axios.put(transformedInputUploadUrl, fs.readFileSync("TEMP LOCATION OF CONVERTED FILE"));


		// STEP 4: Publishing the connector integration response event
		// The response event can be error or success, any failures within the code needs to be handled appropriately by publishing the relevant success or error message back to SIF
		// EVENT SAMPLE:
		// {
		//  // this will not change, need to stay as-is
		//  "detail-type": "SIF>com.aws.sif.pipelineProcessor>connectorIntegration>response",
		//  // this will be your source name for custom connector
		//  "source": "com.sif.connectors.csv",
		//  "region": "us-east-1",
		//  "resources": [],
		//  "detail": {
		//   // executionId, pipelineId, status are required. These can be referenced from the connector integration request payload
		//   "executionId": "01gw7nh580em9cxz9m7j0p7x8f",
		//   "pipelineId": "01gw7nh2hsdzge4tpkp1578462",
		//   // can be "success" or "error"
		//   "status": "success",
		//   // message to reflect on the reason for the status
		//   "statusMessage": "successfully processed input file for pipeline: 01gw7nh2hsdzge4tpkp1578462, execution: 01gw7nh580em9cxz9m7j0p7x8f"
		//  }
		// }
		// EXAMPLE: (utilizing the function below)
		// await publishEvent({
		// 	executionId: <extracted from the incoming event>,
		// 	pipelineId: <extracted from the incoming event>,
		//  This is the status reporting that the integration was successful or not: "error | success"
		// 	status: 'error',
		//  specify any relevant info pertaining the status
		// 	statusMessage: 'failed to parse the source data due to ...'
		// })
	} else {
		console.log(`handler: received an unrecognized event: ${JSON.stringify(event)}`);
	}
};

// The function below publishes an EventBridge event back to SIF for consumption
// @ts-ignore
const publishEvent = async (eventDetail: ConnectorIntegrationResponseEvent) => {
	const params: PutEventsCommandInput = {
		Entries: [{
			// this the source name for the event. Name this to anything which makes sense to you from the perspective of your connector
			Source: 'com.connectors.input.sampleInputConnector',
			// we need to publish this event to a particular EventBridge event bus for SIF to properly consume the event, this gets resolved from env vars passed through the stack
			EventBusName: process.env['EVENT_BUS_NAME'],
			// the detailType is set the response event detail type which is specified by SIF for incoming message, in this case its the connector response event detail type
			DetailType: PIPELINE_PROCESSOR_CONNECTOR_RESPONSE_EVENT,
			// we will specify the response payload in the Detail part of this object.
			Detail: JSON.stringify(eventDetail)
		}]
	};
	const eventBridgeClient = new EventBridgeClient({ region: process.env['AWS_REGION'] });

	await eventBridgeClient.send(new PutEventsCommand(params));
};

