import { parseMultipartRequest } from "@remix-run/multipart-parser";

const UNLIMITED = Number.MAX_SAFE_INTEGER;

/**
 * Reads a request body as FormData, keeping each file part's declared Content-Type and filename.
 *
 * Bun's `Request.formData()` derives the type of a file part from its filename extension instead
 * of the declared Content-Type, so multipart bodies are parsed here. Rejects on malformed input.
 * Size limits are left to tenant quotas.
 */
export async function readFormData(request: Request): Promise<FormData> {
	const contentType = request.headers.get("content-type") ?? "";
	if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
		return await request.formData();
	}

	const formData = new FormData();
	const parts = parseMultipartRequest(request, {
		maxHeaderSize: UNLIMITED,
		maxFileSize: UNLIMITED,
		maxParts: UNLIMITED,
		maxTotalSize: UNLIMITED,
	});

	for await (const part of parts) {
		const name = part.name ?? "";
		if (!part.isFile) {
			formData.append(name, part.text);
			continue;
		}

		const declaredType = part.headers["content-type"]?.trim();
		formData.append(
			name,
			new File(part.content as BlobPart[], part.filename ?? "", {
				type: declaredType || "application/octet-stream",
			}),
		);
	}

	return formData;
}
