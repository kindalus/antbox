import { describe, it } from "bdd";
import { expect } from "expect";
import { loadTemplate } from "./index.ts";

describe("loadTemplate", () => {
	it("loads a template trying each extension", async () => {
		const feature = await loadTemplate("example-feature");
		const config = await loadTemplate("example-config");

		expect(feature?.mimetype).toBe("text/javascript");
		expect(feature?.content.length).toBeGreaterThan(0);
		expect(config?.mimetype).toBe("application/json");
	});

	it("returns null for a missing template", async () => {
		expect(await loadTemplate("does-not-exist")).toBeNull();
	});

	it("does not read files outside the templates directory", async () => {
		expect(await loadTemplate("../templates_handlers")).toBeNull();
		expect(await loadTemplate("../../../deno")).toBeNull();
		expect(await loadTemplate("../../../../../../../../etc/passwd")).toBeNull();
	});
});
