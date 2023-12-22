#!/usr/bin/env node
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

import { getSifMetadata } from '@sif/cdk-common';
import axios from 'axios';
import * as fs from 'fs';

import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Repository metadata to be injected into the CloudFormation tag
const sifMetadata = await getSifMetadata();

// Root CA used to establish SSL connection to Aurora database
const certificateResponse = await axios.get('https://www.amazontrust.com/repository/AmazonRootCA1.pem');

fs.writeFileSync(`${__dirname}/predeploy.json`, JSON.stringify({ sifMetadata, sifCertificate: certificateResponse.data }));






