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
	const metricTableName = 'Metric';
	const metricValueTableName = 'MetricValue';
	const metricLatestValueTableName = 'MetricLatestValue';

	pgm.createSequence('Metric_metricId_seq', { type: 'integer', increment: 1, start: 1, cache: 1 });

	pgm.createTable(metricTableName, {
		metricId: {
			type: 'integer',
			notNull: true
		},
		groupId: {
			type: 'character varying(128)',
			notNull: true
		},
		date: {
			type: 'timestamp without time zone',
			notNull: true
		},
		timeUnit: {
			type: 'character(1)',
			notNull: true
		},
		name: {
			type: 'character varying(512)',
			notNull: true
		}
	});

	pgm.sql(
		`ALTER SEQUENCE "Metric_metricId_seq" OWNED BY "${metricTableName}"."metricId";\n` +
		'ALTER TABLE ONLY "Metric" ALTER COLUMN "metricId" SET DEFAULT nextval(\'"Metric_metricId_seq"\'::regclass);\n' +
		'SELECT pg_catalog.setval(\'"Metric_metricId_seq"\', 1, false);\n' +
		`ALTER TABLE ONLY "${metricTableName}" ADD CONSTRAINT "Metric_pkey" PRIMARY KEY ("metricId");\n` +
		`CREATE UNIQUE INDEX "Metric_uk" ON "${metricTableName}" ("groupId","date","name","timeUnit");`);

	pgm.sql(`ALTER TABLE public."${metricTableName}" OWNER TO ${process.env['TENANT_USERNAME']};`);

	pgm.createTable(metricValueTableName, {
		metricId: {
			type: 'integer',
			notNull: true
		},
		executionId: {
			type: 'character(26)',
			notNull: true
		},
		pipelineId: {
			type: 'character(26)',
			notNull: true
		},
		createdAt: {
			type: 'timestamp without time zone',
			notNull: true
		},
		groupValue: {
			type: 'numeric(16,6)'
		},
		subGroupsValue: {
			type: 'numeric(16,6)'
		}
	});

	pgm.sql(`ALTER TABLE ONLY "${metricValueTableName}" ADD CONSTRAINT "MetricValue_pkey" PRIMARY KEY ("metricId", "createdAt");`);
	pgm.sql(`ALTER TABLE public."${metricValueTableName}" OWNER TO ${process.env['TENANT_USERNAME']};`);

	pgm.createTable(metricLatestValueTableName, {
		metricId: {
			type: 'integer',
			notNull: true
		},
		executionId: {
			type: 'character(26)',
			notNull: true
		},
		pipelineId: {
			type: 'character(26)',
			notNull: true
		},
		createdAt: {
			type: 'timestamp without time zone',
			notNull: true
		},
		groupValue: {
			type: 'numeric(16,6)'
		},
		subGroupsValue: {
			type: 'numeric(16,6)'
		}
	});

	pgm.sql(`ALTER TABLE ONLY "${metricLatestValueTableName}" ADD CONSTRAINT "MetricLatestValue_pkey" PRIMARY KEY ("metricId");`);
	pgm.sql(`ALTER TABLE public."${metricLatestValueTableName}" OWNER TO ${process.env['TENANT_USERNAME']};`);

	// --- CREATE FUNCTION AND TRIGGER TO UPDATE LATEST WHEN VALUE TABLE IS UPDATED ---
	pgm.createFunction(
		`latest${metricValueTableName}Function`,
		[],
		{ returns: 'trigger', language: 'plpgsql', replace: true },
		`
            BEGIN
                INSERT INTO public."${metricLatestValueTableName}" ("metricId","executionId","pipelineId","createdAt","groupValue","subGroupsValue")
                VALUES (new."metricId", new."executionId", new."pipelineId", new."createdAt", new."groupValue", new."subGroupsValue")
                ON CONFLICT ("metricId") DO
                UPDATE SET "createdAt" = new."createdAt",
                    "executionId" = new."executionId",
                    "pipelineId" = new."pipelineId",
                    "groupValue" = new."groupValue",
                    "subGroupsValue" = new."subGroupsValue";
            RETURN NULL;
            END
            `);

	pgm.createTrigger(metricValueTableName, `latest${metricValueTableName}Trigger`, { when: 'AFTER', operation: 'INSERT', function: `latest${metricValueTableName}Function`, level: 'ROW' });
};
