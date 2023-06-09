import { runExit } from 'clipanion';
import { MetricsMigrator } from './migrators/metrics.migrator.js';

runExit([
	MetricsMigrator
]);
