import { join } from "node:path";

export function tempPath(directory: string, prefix: string): string {
	return join(directory, prefix + crypto.randomUUID());
}
