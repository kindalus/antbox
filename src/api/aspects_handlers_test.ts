import { describe, it } from "bdd";
import { expect } from "expect";
import { parseAspectUpload } from "./aspects_handlers.ts";

describe("aspects_handlers", () => {
	describe("parseAspectUpload", () => {
		it("parses multipart aspect uploads", async () => {
			const formData = new FormData();
			formData.set(
				"file",
				new File(
					[
						JSON.stringify({
							uuid: "contract-metadata",
							title: "Contract Metadata",
							description: "Aspect from upload",
							filters: [["mimetype", "==", "application/pdf"]],
							properties: [],
						}),
					],
					"different aspect name.json",
					{ type: "application/json" },
				),
			);

			const req = new Request("http://localhost/v2/aspects/-/upload", {
				method: "POST",
				body: formData,
			});

			const result = await parseAspectUpload(req);

			expect(result.isRight()).toBe(true);
			if (!result.isRight()) {
				return;
			}

			expect(result.value.uuid).toBe("contract-metadata");
			expect(result.value.title).toBe("Contract Metadata");
			expect(result.value.filters[0]).toEqual(["mimetype", "==", "application/pdf"]);
		});

		it("falls back to the uploaded file name when uuid is missing", async () => {
			const formData = new FormData();
			formData.set(
				"file",
				new File(
					[
						JSON.stringify({
							title: "Fallback Aspect",
							filters: [],
							properties: [],
						}),
					],
					"meu aspecto.json",
					{ type: "application/json" },
				),
			);

			const req = new Request("http://localhost/v2/aspects/-/upload", {
				method: "POST",
				body: formData,
			});

			const result = await parseAspectUpload(req);

			expect(result.isRight()).toBe(true);
			if (!result.isRight()) {
				return;
			}

			expect(result.value.uuid).toBe("meu-aspecto");
		});

		it("rejects requests without a file", async () => {
			const req = new Request("http://localhost/v2/aspects/-/upload", {
				method: "POST",
				body: new FormData(),
			});

			const result = await parseAspectUpload(req);

			expect(result.isLeft()).toBe(true);
			if (!result.isLeft()) {
				return;
			}

			expect(result.value.message).toContain("{ file }");
		});
	});
});
