import denoMetadata from "../../deno.json" with { type: "json" };
import { z } from "zod";

const appMetadataSchema = z.object({
	name: z.string().min(1),
	version: z.string().min(1),
});

const appMetadata = appMetadataSchema.parse(denoMetadata);

export const APP_NAME = appMetadata.name;
export const APP_VERSION = appMetadata.version;
export const SERVER_HEADER_VALUE = `${APP_NAME}/${APP_VERSION}`;

export function setServerHeader(headers: Headers): void {
	headers.set("Server", SERVER_HEADER_VALUE);
}
