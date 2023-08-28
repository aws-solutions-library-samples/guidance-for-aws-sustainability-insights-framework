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


exports.shorthands = undefined;

exports.up = pgm => {

	pgm.sql(`ALTER TABLE "ActivityNumberValue" ALTER COLUMN "val" TYPE numeric;`);
	pgm.sql(`ALTER TABLE "ActivityNumberLatestValue" ALTER COLUMN "val" TYPE numeric;`);
	pgm.sql(`ALTER TABLE "MetricValue" ALTER COLUMN "groupValue" TYPE numeric, ALTER COLUMN "subGroupsValue" TYPE numeric;`);
	pgm.sql(`ALTER TABLE "MetricLatestValue" ALTER COLUMN "groupValue" TYPE numeric, ALTER COLUMN "subGroupsValue" TYPE numeric;`);
};

exports.down = pgm => {
};
