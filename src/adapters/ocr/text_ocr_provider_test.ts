import { describe, it } from "bdd";
import { expect } from "expect";
import { TextOCRProvider } from "./text_ocr_provider.ts";

describe("TextOCRProvider", () => {
	const provider = new TextOCRProvider();

	it("extracts text from text/plain file", async () => {
		const file = new File(["Hello, world!"], "test.txt", { type: "text/plain" });
		const result = await provider.ocr(file);
		expect(result.isRight()).toBe(true);
		if (result.isRight()) {
			expect(result.value).toBe("Hello, world!");
		}
	});

	it("extracts text from text/markdown file", async () => {
		const content = "# Title\n\nSome markdown content.";
		const file = new File([content], "test.md", { type: "text/markdown" });
		const result = await provider.ocr(file);
		expect(result.isRight()).toBe(true);
		if (result.isRight()) {
			expect(result.value).toBe(content);
		}
	});

	it("extracts text from text/html file", async () => {
		const content = "<html><body>Hello</body></html>";
		const file = new File([content], "test.html", { type: "text/html" });
		const result = await provider.ocr(file);
		expect(result.isRight()).toBe(true);
		if (result.isRight()) {
			expect(result.value).toBe(content);
		}
	});

	it("returns error for unsupported mimetype", async () => {
		const file = new File(["data"], "test.pdf", { type: "application/pdf" });
		const result = await provider.ocr(file);
		expect(result.isLeft()).toBe(true);
		if (result.isLeft()) {
			expect(result.value.errorCode).toBe("UnsupportedMimetype");
		}
	});

	it("returns empty string for empty file", async () => {
		const file = new File([""], "empty.txt", { type: "text/plain" });
		const result = await provider.ocr(file);
		expect(result.isRight()).toBe(true);
		if (result.isRight()) {
			expect(result.value).toBe("");
		}
	});
});
