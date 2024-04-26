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


export function exportDataToS3Query(queryString:string, bucket:string, key:string):string {

	 const exportQuery = `SELECT * from aws_s3.query_export_to_s3(
		'${queryString}',
		aws_commons.create_s3_uri(
		'${bucket}',
		'${key}',
		'${process.env['AWS_REGION']}'
		),
		options :='format csv , HEADER true'
		);
	 `
		return exportQuery;
};

export function  prepareS3ExportQuery(queryString:string):string{
	return queryString.replaceAll('\'','\'\'');
}
