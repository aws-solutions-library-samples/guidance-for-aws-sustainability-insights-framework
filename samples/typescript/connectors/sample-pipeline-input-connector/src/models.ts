export type AttributeType = 'string' | 'number' | 'boolean' | 'timestamp';
export interface TransformOutput {
	index: number;
	key: string;
	type: AttributeType;
	metrics?: string[];
	aggregate?: string;
	includeAsUnique?: boolean;
	_keyMapping?: string;
}

export interface Parameter {
	label?: string;
	key: string;
	type: AttributeType;
}
export interface Transform {
	index: number;
	formula: string;
	outputs: TransformOutput[];
}

export interface Transformer {
	transforms: Transform[];
	parameters: Parameter[];
}

export interface ConnectorConfig {
	name: string;
	parameters?: Record<string, string>;
}

interface Pipeline {
	id: string;
	connectorConfig?: {
		input?: ConnectorConfig[];
		output?: ConnectorConfig[];
	}
	transformer: Transformer;
	version: number;
	createdBy: string;
	processorOptions?: {
		chunkSize?: number;
	};
	_aggregatedOutputKeyAndTypeMap: Record<string, string>;
}
export interface ConnectorIntegrationRequestEvent {
	executionId: string;
	pipeline: Pipeline;
	connector: {
		name: string,
		parameters: Record<string, any>;
	}
	rawInputDownloadUrl?: string;
	transformedInputUploadUrl: string
}

export interface ConnectorIntegrationResponseEvent {
	executionId: string,
	pipelineId: string,
	status: 'success' | 'error',
	statusMessage: string
}
