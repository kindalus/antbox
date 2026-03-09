import { describe, it } from "bdd";
import { expect } from "expect";
import { parseFeatureUpload } from "./features_handlers.ts";

const featureModule = `export default {
	uuid: "raw_upload_feature",
	title: "Raw Upload Feature",
	description: "Parses a raw JavaScript upload",
	exposeAction: true,
	runOnCreates: false,
	runOnUpdates: false,
	runOnDeletes: false,
	runManually: true,
	filters: [],
	exposeExtension: false,
	exposeAITool: false,
	groupsAllowed: [],
	parameters: [{
		name: "uuids",
		type: "array",
		arrayType: "string",
		required: true,
		description: "Node UUIDs"
	}, {
		name: "suffix",
		type: "string",
		required: true,
		description: "Suffix to append"
	}],
	returnType: "void",
	tags: ["upload"],
	async run() {
		return undefined;
	},
};`;

const featureModuleWithoutUuid = `export default {
	title: "Filename Feature",
	description: "Uses filename fallback",
	exposeAction: true,
	runOnCreates: false,
	runOnUpdates: false,
	runOnDeletes: false,
	runManually: true,
	filters: [],
	exposeExtension: false,
	exposeAITool: false,
	groupsAllowed: [],
	parameters: [{
		name: "uuids",
		type: "array",
		arrayType: "string",
		required: true,
		description: "Node UUIDs"
	}],
	returnType: "void",
	async run() {
		return undefined;
	},
};`;

const invalidActionFeatureModule = `export default {
	uuid: "invalid_action_feature",
	title: "Invalid Action Feature",
	description: "Missing uuids parameter",
	exposeAction: true,
	runOnCreates: false,
	runOnUpdates: false,
	runOnDeletes: false,
	runManually: true,
	filters: [],
	exposeExtension: false,
	exposeAITool: false,
	groupsAllowed: [],
	parameters: [{
		name: "suffix",
		type: "string",
		required: true
	}],
	returnType: "void",
	async run() {
		return undefined;
	},
};`;

describe("features_handlers", () => {
	describe("parseFeatureUpload", () => {
		it("parses multipart feature uploads", async () => {
			const formData = new FormData();
			formData.set(
				"file",
				new File([featureModule], "different name.js", {
					type: "application/javascript",
				}),
			);

			const req = new Request("http://localhost/v2/features/-/upload", {
				method: "POST",
				body: formData,
			});

			const result = await parseFeatureUpload(req);

			expect(result.isRight()).toBe(true);
			if (!result.isRight()) {
				return;
			}

			expect(result.value.uuid).toBe("raw_upload_feature");
			expect(result.value.title).toBe("Raw Upload Feature");
			expect(result.value.parameters[0].name).toBe("uuids");
			expect(result.value.parameters[1].name).toBe("suffix");
			expect(result.value.run).toContain("return undefined;");
			expect(result.value.run.startsWith("async function")).toBe(true);
		});

		it("falls back to the uploaded file name when uuid is missing", async () => {
			const formData = new FormData();
			formData.set(
				"file",
				new File([featureModuleWithoutUuid], "minha feature.js", {
					type: "application/javascript",
				}),
			);

			const req = new Request("http://localhost/v2/features/-/upload", {
				method: "POST",
				body: formData,
			});

			const result = await parseFeatureUpload(req);

			expect(result.isRight()).toBe(true);
			if (!result.isRight()) {
				return;
			}

			expect(result.value.uuid).toBe("minha_feature");
		});

		it("rejects requests without a file", async () => {
			const req = new Request("http://localhost/v2/features/-/upload", {
				method: "POST",
				body: new FormData(),
			});

			const result = await parseFeatureUpload(req);

			expect(result.isLeft()).toBe(true);
			if (!result.isLeft()) {
				return;
			}

			expect(result.value.message).toContain("{ file }");
		});

		it("rejects action uploads without required uuids parameter", async () => {
			const formData = new FormData();
			formData.set(
				"file",
				new File([invalidActionFeatureModule], "invalid_action_feature.js", {
					type: "application/javascript",
				}),
			);

			const req = new Request("http://localhost/v2/features/-/upload", {
				method: "POST",
				body: formData,
			});

			const result = await parseFeatureUpload(req);

			expect(result.isLeft()).toBe(true);
			if (!result.isLeft()) {
				return;
			}

			expect(result.value.message).toContain(
				"Action features must declare required parameter 'uuids'",
			);
		});
	});
});
