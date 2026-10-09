import { zipSync } from "fflate";
import { z } from "zod";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { uuid } from "domain/validation_schemas.ts";
import { AntboxError, BadRequestError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";

export const MAX_EXPORT_ALL_FILES = 100;
export const MAX_EXPORT_ALL_BYTES = 100 * 1024 * 1024;

export const ExportAllUuidsSchema = z.array(
	z.string().trim().pipe(z.union([
		uuid().refine((value) => !Nodes.isFid(value)),
		z.string().startsWith(Nodes.FID_PREFIX).min(Nodes.FID_PREFIX.length + 1),
	])),
).min(1).refine(
	(uuids) => new Set(uuids).size <= MAX_EXPORT_ALL_FILES,
	`At most ${MAX_EXPORT_ALL_FILES} unique files can be exported`,
);
export const ExportAllRequestSchema = z.object({ uuids: ExportAllUuidsSchema });

interface ExportAllContext {
	prepareFile(uuid: string): Promise<Either<AntboxError, NodeMetadata>>;
	readFile(uuid: string): Promise<Either<AntboxError, File>>;
}

/** Builds a bounded in-memory ZIP; it never persists an archive or deletes source files. */
export async function exportAllFiles(
	uuids: string[],
	context: ExportAllContext,
): Promise<Either<AntboxError, File>> {
	const validation = ExportAllUuidsSchema.safeParse(uuids);
	if (!validation.success) {
		return left(
			new BadRequestError(validation.error.issues.map((issue) => issue.message).join("; ")),
		);
	}

	try {
		const nodes = new Map<string, NodeMetadata>();
		let estimatedBytes = 0;
		for (const uuid of new Set(validation.data)) {
			const node = await context.prepareFile(uuid);
			if (node.isLeft()) return left(node.value);
			if (!Nodes.isFile(node.value)) {
				return left(new BadRequestError(`Node '${uuid}' is not a file`));
			}
			if (nodes.has(node.value.uuid)) continue;
			nodes.set(node.value.uuid, node.value);
			estimatedBytes += node.value.size ?? 0;
			if (estimatedBytes > MAX_EXPORT_ALL_BYTES) {
				return left(new BadRequestError("Export exceeds the 100 MiB limit"));
			}
		}

		const entries: Record<string, Uint8Array> = Object.create(null);
		const usedNames = new Set<string>();
		let actualBytes = 0;
		for (const node of nodes.values()) {
			const file = await context.readFile(node.uuid);
			if (file.isLeft()) return left(file.value);
			actualBytes += file.value.size;
			if (actualBytes > MAX_EXPORT_ALL_BYTES) {
				return left(new BadRequestError("Export exceeds the 100 MiB limit"));
			}
			const name = uniqueArchiveName(node.title, usedNames);
			entries[name] = new Uint8Array(await file.value.arrayBuffer());
		}

		// Store entries without compression to bound CPU cost for already-compressed PDFs/images.
		const bytes = zipSync(entries, { level: 0 });
		return right(
			new File([bytes], "antbox-export.zip", {
				type: "application/zip",
			}),
		);
	} catch (error) {
		return left(
			error instanceof AntboxError ? error : new UnknownError("Failed to export files"),
		);
	}
}

function uniqueArchiveName(title: string, usedNames: Set<string>): string {
	let name = title.normalize("NFC")
		// deno-lint-ignore no-control-regex -- Strip unsafe controls from archive filenames.
		.replace(/[\x00-\x1f\x7f/\\:*?"<>|]/g, "_")
		.replace(/^[.\s]+|[.\s]+$/g, "")
		.slice(0, 200)
		.replace(/[.\s]+$/g, "") || "file";
	if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) || name === "__proto__") {
		name = `_${name}`;
	}
	const dot = name.lastIndexOf(".");
	const stem = dot > 0 ? name.slice(0, dot) : name;
	const extension = dot > 0 ? name.slice(dot) : "";
	let candidate = name;
	let suffix = 2;
	while (usedNames.has(candidate.toLowerCase())) {
		candidate = `${stem} (${suffix++})${extension}`;
	}
	usedNames.add(candidate.toLowerCase());
	return candidate;
}
