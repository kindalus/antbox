import { NodeMetadata } from "domain/nodes/node_metadata.ts";

/**
 * Generates an ETag for a node in the format: uuid-yyyymmddHHmmss
 * @param node The node to generate ETag for
 * @returns ETag string
 */
export function generateETag(node: NodeMetadata): string {
	const modifiedDate = new Date(node.modifiedTime!);

	// Format date as yyyymmddHHmmss
	const year = modifiedDate.getUTCFullYear();
	const month = String(modifiedDate.getUTCMonth() + 1).padStart(2, "0");
	const day = String(modifiedDate.getUTCDate()).padStart(2, "0");
	const hours = String(modifiedDate.getUTCHours()).padStart(2, "0");
	const minutes = String(modifiedDate.getUTCMinutes()).padStart(2, "0");
	const seconds = String(modifiedDate.getUTCSeconds()).padStart(2, "0");

	const dateString = `${year}${month}${day}${hours}${minutes}${seconds}`;

	return `${node.uuid}-${dateString}`;
}

/**
 * Creates ETag header value wrapped in quotes
 * @param node The node to generate ETag for
 * @returns ETag header value with quotes
 */
export function createETagHeader(node: NodeMetadata): string {
	return `"${generateETag(node)}"`;
}
