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

/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {

	// List of tables and attributes to update
	const tables = [
		{ latestTableName: 'ActivityNumberLatestValue', valueType: 'numeric(16,6)', valueTableName: 'ActivityNumberValue' },
		{ latestTableName: 'ActivityStringLatestValue', valueType: 'character varying(128)', valueTableName: 'ActivityStringValue' },
		{ latestTableName: 'ActivityBooleanLatestValue', valueType: 'boolean', valueTableName: 'ActivityBooleanValue' },
		{ latestTableName: 'ActivityDateTimeLatestValue', valueType: 'timestamp without time zone', valueTableName: 'ActivityDateTimeValue' }
	];

	// Base table type to be reused below
	const baseLatestValuesTable = {
		activityId: {
			type: 'integer',
			notNull: true
		},
		name: {
			type: 'character varying(128)',
			notNull: true
		},
		createdAt: {
			type: 'timestamp without time zone',
			notNull: true
		},
		executionId: {
			type: 'character(26)',
			notNull: true
		},
		auditId: {
			type: 'uuid'
		}
	};

	tables.forEach(table => {

		// --- CREATE THE LATEST VALUE TABLE ---
		pgm.createTable(table.latestTableName, {
			...baseLatestValuesTable,
			val: {
				type: table.valueType
			}
		});

		pgm.addConstraint(table.latestTableName, `${table.latestTableName}_pk`, { primaryKey: ['activityId', 'name'] });

		// TODO: add index?
		//pgm.createIndex(table.latestTableName, '???')

		// the tenant username is being set by the deployment helper
		pgm.sql(`ALTER TABLE public."${table.latestTableName}" OWNER TO ${process.env['TENANT_USERNAME']};`);

		// --- CREATE FUNCTION AND TRIGGER TO UPDATE LATEST WHEN VALUE TABLE IS UPDATED ---
		pgm.createFunction(
			`latest${table.valueTableName}Function`,
			[],
			{ returns: 'trigger', language: 'plpgsql', replace: true },
			`
            BEGIN
            IF new."error" = false THEN
                INSERT INTO public."${table.latestTableName}" ("activityId","name","createdAt","executionId","val","auditId")
                VALUES (new."activityId", new."name", new."createdAt", new."executionId", new."val", new."auditId")
                ON CONFLICT ("activityId","name") DO
                UPDATE SET "createdAt" = new."createdAt",
                    "executionId" = new."executionId",
                    "val" = new."val",
                    "auditId" = new."auditId";
            END IF;
            RETURN NULL;
            END
            `);

		pgm.createTrigger(table.valueTableName, `latest${table.valueTableName}Trigger`, { when: 'AFTER', operation: 'INSERT', function: `latest${table.valueTableName}Function`, level: 'ROW' });

		// --- POPULATE THE LATEST VALUES TABLE ---
		pgm.sql(`INSERT INTO public."${table.latestTableName}" ("activityId", "name", "createdAt", "executionId", "val", "auditId")
        SELECT av."activityId",
            av."name",
            av."createdAt",
            av."executionId",
            av."val",
            av."auditId"
        FROM "${table.valueTableName}" av JOIN
            (   SELECT "activityId", "name", max("createdAt") as "createdAt"
                FROM "${table.valueTableName}" jav
                WHERE jav."error" = 'false'
                GROUP BY jav."activityId", jav."name"
            ) l USING ("activityId", "name", "createdAt")
        `);

	});

};

exports.down = pgm => {
};
