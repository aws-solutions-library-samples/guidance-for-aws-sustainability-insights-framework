import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
export const getSSMParameter = async (path: string, context: string): Promise<{context: string, value:string}> => {
	const ssm = new SSMClient({});
	const response = await ssm.send(
		new GetParameterCommand({
			Name: path,
		})
	);
	return {
		context,
		value: response.Parameter?.Value as string
	};
}
