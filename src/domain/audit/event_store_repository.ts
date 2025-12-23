import type { AuditEvent } from "./audit_event.ts";
import type { Either } from "shared/either.ts";
import type { AntboxError } from "shared/antbox_error.ts";

export interface EventStoreRepository {
	append(
		streamId: string,
		mimetype: string,
		event: Omit<AuditEvent, "streamId" | "sequence">,
	): Promise<Either<AntboxError, void>>;

	getStream(
		streamId: string,
		mimetype: string,
	): Promise<Either<AntboxError, AuditEvent[]>>;

	getStreamsByMimetype(
		mimetype: string,
	): Promise<Either<AntboxError, Map<string, AuditEvent[]>>>;
}
