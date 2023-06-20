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

import type { BaseLogger } from 'pino';
import type { Transformer, Transform } from '../common/models.js';
import { TransformerDefinitionError } from '../common/errors.js';

export class TransformerValidator {
	private readonly log: BaseLogger;

	public constructor(log: BaseLogger) {
		this.log = log;
	}


	public validateTransformer(transformer: Transformer): void {
		this.log.debug(`Validator> validateTransformer> in: transformer :${transformer}`);

		// check if transformer has parameters defined
		if ((!transformer.parameters.length ?? 0) === 0) {
			throw new TransformerDefinitionError(`Transformer must have parameters defined.`);
		}

		// validate by sorting the transforms and then check if they are in sequence and don't skip over any indexes and always start from 0
		this.validateTransformsSequence(transformer.transforms);

		// validate transform outputs set as keys
		this.validateTransformsOutputKeys(transformer.transforms);

		// cross-transform validation
		this.validateTransforms(transformer.transforms);

		// individual transform validation
		for (const t of transformer.transforms) {
			this.validateTransformOutput(t);
		}

		this.log.debug(`Validator> validateTransformer> out:`);
	}

	private validateTransformsSequence(transforms: Transform[]): void {
		transforms?.sort((a, b) => (a.index > b.index ? 1 : -1));

		if (transforms?.[0]?.index !== 0) {
			throw new TransformerDefinitionError('The position of the transforms (their `index`) must begin from 0.');
		}

		// Validation - index sequence must not be skipping or missing a position
		for (let i = 0; i < transforms.length; i++) {
			if (i !== transforms[i]?.index) {
				throw new TransformerDefinitionError(`The order of the transforms (their 'index') must not be skipping or missing a position.`);
			}
		}
	}

	private validateTransformsOutputKeys(transforms: Transform[]): void {
		// as of now we only allow 5 outputs (not including first output) to be key outputs
		let outputsKeySet = new Set();
		let outputKeys = [];
		let numberOutputKeys = 0;
		let timestampAggregatedField = 0;
		let hasAggregateConfiguration = false;
		let invalidAggregateType = 0;

		transforms.forEach((t) => {
			t.outputs?.forEach((o) => {
				// add the key to the outputsKeySet, we will use this to later validate if the output keys matches this set
				outputsKeySet.add(o.key);
				outputKeys.push(o.key);
				// check if the output is specified as unique and ignore the first index, since its the required timestamp one
				if (o.includeAsUnique && t.index !== 0) {
					// tracker for the output keys used
					numberOutputKeys += 1;
				}

				if (o.aggregate) {
					// if a field contains aggregate field then this pipeline has aggregate configuration defined
					hasAggregateConfiguration = true;
					if (o.aggregate === 'groupBy' && o.type === 'timestamp') {
						// there should be only 1 output with timestamp type that can be used to groupBy
						// this timestamp type will be used as the for the aggregated result
						timestampAggregatedField += 1;
					}

					// check if the aggregate function can be applied to non-number
					if (!['groupBy', 'count'].includes(o.aggregate) && o.type !== 'number') {
						// it only makes sense to aggregate field with number type
						invalidAggregateType += 1;
					}
				}
			});
		});

		if (hasAggregateConfiguration) {
			if (timestampAggregatedField !== 1) {
				throw new TransformerDefinitionError(`Only 1 timestamp field can be aggregated, the field will be used as date field for the aggregated output.`);
			}
			if (invalidAggregateType > 0) {
				throw new TransformerDefinitionError(`Only fields with number type can be aggregated using aggregation functions other than groupBy.`);
			}
		}

		// check if the keys were more than 5, if they were throw an error
		if (numberOutputKeys > 5) {
			throw new TransformerDefinitionError(`Only up to 5 outputs (other than timestamp) can be defined as keys. ${numberOutputKeys} are defined as keys.`);
		}

		// need to validate that all transform output keys are unique
		// sets can only have unique items, we compare the set with the outputKey array if they both match we are good, if not then there is a key which is reused,
		// we will throw an error if the size of the set doesn't match the outputKey array
		if (outputsKeySet.size !== outputKeys.length) {
			throw new TransformerDefinitionError('Transform output key needs to be unique.');
		}

		// validate that all transforms are not marked as unique. There always needs to be an unmarked transform
		if (transforms.length - 1 === numberOutputKeys) {
			throw new TransformerDefinitionError('All transform outputs cannot be marked as unique. At-least one transform output needs to stay unmarked.');
		}
	}

	private validateTransforms(transforms: Transform[]): void {
		let assignToGroupUsages = 0;

		transforms.forEach((t) => {
			if (t.formula.toLowerCase().includes("assign_to_group")) {
				assignToGroupUsages += 1;
			}
		});

		if (assignToGroupUsages > 1) {
			throw new TransformerDefinitionError(`Only 1 transform can use the ASSIGN_TO_GROUP() function.`);
		}
	}

	private validateTransformOutput(transform: Transform): void {
		this.log.debug(`Validator> validateTransformOutputs> in: outputs:${JSON.stringify(transform)}`);

		if ((transform.outputs?.length ?? 0) === 0) {
			throw new TransformerDefinitionError(`Transform must have an output defined.`);
		}

		// Only 1 output support for launch. multiple outputs are post launch
		if ((transform.outputs?.length ?? 0) > 1) {
			throw new TransformerDefinitionError(`Only 1 output per transform is supported.`);
		}

		if (transform.index === 0) {
			const firstOutput = transform.outputs[0];

			if (firstOutput.type !== 'timestamp') {
				throw new TransformerDefinitionError(`The 1st output of the 1st transform must be the timestamp of the incoming event.`);
			}

			if ((firstOutput.metric?.length ?? 0) > 0) {
				throw new TransformerDefinitionError(`The timestamp of the event cannot be marked as a Metric.`);
			}
		}
	}
}
