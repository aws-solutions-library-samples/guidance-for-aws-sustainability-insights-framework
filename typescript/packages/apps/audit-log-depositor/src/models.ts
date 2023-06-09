interface AuditMessages {
	logs: AuditMessage[];
}

interface AuditMessage {
	key: string;
	auditLog: unknown;
}
