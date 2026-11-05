/**
 * Builds a Response that carries a file's bytes with exactly the headers given.
 *
 * Bun adds a `Content-Disposition` header when a Response is served from a File or Blob body,
 * even a re-wrapped one, and sends stream bodies without a `Content-Length`. The bytes are
 * therefore read into memory and sent as a plain buffer. `Content-Length` is always set.
 */
export async function fileResponse(
	file: Blob,
	headers: HeadersInit = {},
	status = 200,
): Promise<Response> {
	const bytes = await file.arrayBuffer();
	const responseHeaders = new Headers(headers);
	responseHeaders.set("Content-Length", bytes.byteLength.toString());
	return new Response(bytes, { status, headers: responseHeaders });
}
