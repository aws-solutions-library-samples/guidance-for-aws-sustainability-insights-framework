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

	public constructor(
		private readonly log: BaseLogger
	) {
	}

	public validateDataPipelineTransformer(transformer: Transformer) {
		this.log.debug(`TransformerValidator> validateDataPipelineTransformer> in: transformer :${transformer}`);

		// rules: validate common rules
		this.validateCommonRules(transformer);
		// rule: validate unsupported features such as metric an aggregations
		this.validateUnsupportedMetricsAndAggregations(transformer);
	}

	public validateImpactPipelineTransformer(transformer: Transformer) {
		this.log.debug(`TransformerValidator> validateDataPipelineTransformer> in: transformer :${transformer}`);

		// rules: validate common rules
		this.validateCommonRules(transformer);
		// rule: validate unsupported features such as metric an aggregations
		this.validateUnsupportedMetricsAndAggregations(transformer);
		// rule: validate mandatory output column names [activityName, impactName, componentKey, componentValue, componentType].
		this.validateImpactsRequiredColumns(transformer);
	}

	public validateActivitiesPipelineTransformer(transformer: Transformer) {
		this.log.debug(`TransformerValidator> validateActivitiesPipelineTransformer> in: transformer :${transformer}`);

		// validate common rules
		this.validateCommonRules(transformer);
		// validate any aggregations specified, this is only applicable if the pipeline type is activities
		this.validateTransformAggregations(transformer);
		// validate the assign_to_group function specified within the transform, only applicable if pipeline type is activities
		this.validateTransformAssignToGroup(transformer);
		// validate the first transform, the validation happens uniquely on the first transform being timestamp and only 1 output metric is supported
		this.validateFirstTransform(transformer);

	}


	private validateCommonRules(transformer: Transformer) {
		this.log.debug(`TransformerValidator> validateCommonRules> in: transformer :${transformer}`);

		/*
		common transformer validation rules
		1. transformer should have parameters
		2. transformers within the transformer should have the right sequence, the sequence should always start from 0 and should not be skipping
		3. individual transform output validation
		 */

		// check if transformer has parameters defined
		if ((!transformer.parameters.length ?? 0) === 0) {
			throw new TransformerDefinitionError(`Transformer must have parameters defined.`);
		}

		// validate by sorting the transforms and then check if they are in sequence and don't skip over any indexes and always start from 0
		this.validateTransformsSequence(transformer.transforms);

		// validate transform outputs set as keys
		this.validateTransformsOutputKeys(transformer.transforms);

		// individual transform validation
		for (const t of transformer.transforms) {
			this.validateTransformOutput(t);
		}

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

	private validateTransformAggregations(transformer: Transformer) {
		this.log.debug(`TransformerValidator> validateTransformAggregations> in: transformer :${transformer}`);
		// as of now we only allow 5 outputs (not including first output) to be key outputs
		let timestampAggregatedField = 0;
		let hasAggregateConfiguration = false;
		let invalidAggregateType = 0;
		let numberAggregatedField = 0;

		transformer.transforms.forEach((t) => {
			t.outputs?.forEach((o) => {
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

					// check if the aggregate function has be applied to number
					if (!['groupBy', 'count'].includes(o.aggregate) && o.type === 'number') {
						// there should be 1 or more number aggregations
						numberAggregatedField += 1;
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
			if(numberAggregatedField === 0){
				throw new TransformerDefinitionError(`There should be at least 1 number field that is being aggregated using aggregation functions.`);
			}
		}
	}

	private validateTransformsOutputKeys(transforms: Transform[]): void {
		// as of now we only allow 5 outputs (not including first output) to be key outputs
		let outputsKeySet = new Set();
		let outputKeys = [];
		let numberOutputKeys = 0;

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
			});
		});

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

	private validateTransformAssignToGroup(transformer: Transformer): void {
		let assignToGroupUsages = 0;

		transformer.transforms.forEach((t) => {
			if (t.formula.toLowerCase().includes('assign_to_group')) {
				assignToGroupUsages += 1;
			}
		});

		if (assignToGroupUsages > 1) {
			throw new TransformerDefinitionError(`Only 1 transform can use the ASSIGN_TO_GROUP() function.`);
		}
	}

	private validateFirstTransform(transformer: Transformer) {
		const firstTransform = transformer.transforms[0];

		const firstOutput = firstTransform.outputs[0];

		if (firstOutput.type !== 'timestamp') {
			throw new TransformerDefinitionError(`The 1st output of the 1st transform must be the timestamp of the incoming event.`);
		}

		if ((firstOutput.metrics?.length ?? 0) > 0) {
			throw new TransformerDefinitionError(`The timestamp of the event cannot be marked as a Metric.`);
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
	}

	private validateUnsupportedMetricsAndAggregations(transformer: Transformer): void {
		this.log.debug(`Validator> validateUnsupportedMetricsAndAggregations> in: outputs:${JSON.stringify(transformer)}`);

		transformer.transforms.forEach((t) => {
			t.outputs?.forEach((o) => {
				// check if output contains metric or aggregation, if it does, we gotta throw an error
				if (o.metrics || o.aggregate) {
					throw new TransformerDefinitionError(`Metrics and Aggregations are not supported for pipeline types: data and impacts`);
				}
			});
		});
	}

	private validateImpactsRequiredColumns(transformer: Transformer) {
		this.log.debug(`Validator> validateImpactsRequiredColumns> in: outputs:${JSON.stringify(transformer)}`);
		const mandatoryOutputColNames = ['activityName', 'impactName', 'componentKey', 'componentValue', 'componentType'];
		// so, we need to extract all the output keys from the individual transforms. We map the transforms then we map the outputs then we flatten the array, but this doesn't eliminate any dupes, we handle that by sticking the gnarly one-liner into a set
		const transformOutputNames = new Set(transformer.transforms.map(t => t.outputs.map(o => o.key)).flat());

		// check if the mandatory output names are present in the transform output names
		if (!mandatoryOutputColNames.every(x => transformOutputNames.has(x))) {
			throw new TransformerDefinitionError('Missing mandatory output columns. For data pipeline type the following columns are mandatory \'activityName\', \'impactName\', \'componentKey\', \'componentValue\', \'componentType\'');
		}

	}
}
