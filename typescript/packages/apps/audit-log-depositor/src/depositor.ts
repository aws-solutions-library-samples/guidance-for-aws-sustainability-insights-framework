import { PutObjectCommand, PutObjectCommandOutput, S3Client } from '@aws-sdk/client-s3';
import type { Logger } from 'pino';
import pLimit from 'p-limit';

export class Depositor {
	public constructor(private log: Logger, private s3Client: S3Client, private bucket: string, private concurrencyLimit: number) {}

	public async deposit(messages: AuditMessages): Promise<void> {
		this.log.debug(`Depositor> put> in> count:${messages.logs.length}`);

		const futures: Promise<PutObjectCommandOutput>[] = [];
		const limit = pLimit(this.concurrencyLimit);
		for (const message of messages.logs) {
			futures.push(limit(() => this.put(message)));
		}
		await Promise.all(futures);
	}

	private async put(message: AuditMessage): Promise<PutObjectCommandOutput> {
		this.log.debug(`Depositor> put> in> message:${JSON.stringify(message)}`);

		const cmd: PutObjectCommand = new PutObjectCommand({
			Bucket: this.bucket,
			Key: message.key,
			Body: JSON.stringify(message.auditLog),
		});
		return await this.s3Client.send(cmd);
	}
}
