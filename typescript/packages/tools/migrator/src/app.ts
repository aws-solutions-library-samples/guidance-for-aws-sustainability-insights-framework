import { runExit } from 'clipanion';
import { MetricsMigrator } from './migrators/metrics.migrator.js';
import { ExecutionsMigrator } from './migrators/executions.migrator.js';

const commandsMap = {
	'MetricsMigrator': MetricsMigrator,
	'ExecutionsMigrator': ExecutionsMigrator
};

runExit([
	commandsMap[process.env['MODULE']]
]);
