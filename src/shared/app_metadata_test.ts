import { describe, it } from "bdd";
import { expect } from "expect";
import fs from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { APP_NAME, APP_VERSION, SERVER_HEADER_VALUE, setServerHeader } from "./app_metadata.ts";

describe("app_metadata", () => {
	it("loads app name and version from package.json", () => {
		expect(APP_NAME).toBe("antbox");
		expect(APP_VERSION.length > 0).toBe(true);
	});

	it("builds the canonical Server header value", () => {
		expect(SERVER_HEADER_VALUE).toBe(`${APP_NAME}/${APP_VERSION}`);

		const headers = new Headers();
		setServerHeader(headers);
		expect(headers.get("Server")).toBe(SERVER_HEADER_VALUE);
	});

	it("keeps openapi info.version aligned with the app version", async () => {
		const openApiText = await fs.readFile("openapi.yaml", "utf8");
		const openApi = parseYaml(openApiText) as {
			info?: { version?: string };
		};

		expect(openApi.info?.version).toBe(APP_VERSION);
	});
});
