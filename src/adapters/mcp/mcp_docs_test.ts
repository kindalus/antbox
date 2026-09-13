import { describe, it } from "bdd";
import { expect } from "expect";

const README_PATH = new URL("../../../README.md", import.meta.url);
const MCP_DOC_PATH = new URL("../../../docs/mcp.md", import.meta.url);

interface Docs {
	readme: string;
	mcpDoc: string;
}

interface CurlExample {
	file: string;
	headers: Record<string, string>;
	body: Record<string, unknown>;
	bodyError?: string;
}

/** Methods whose request body carries the name mirrored into the `Mcp-Name` header. */
const NAME_PARAMETER_BY_METHOD: Record<string, "name" | "uri"> = {
	"tools/call": "name",
	"resources/read": "uri",
};

async function readDocs(): Promise<Docs> {
	return {
		readme: await Deno.readTextFile(README_PATH),
		mcpDoc: await Deno.readTextFile(MCP_DOC_PATH),
	};
}

/** Joins shell line continuations and returns each `curl ... $BASE_URL/mcp` command. */
function mcpCurlCommands(text: string): string[] {
	const joined = text.replace(/\\\r?\n[ \t]*/g, " ");
	return joined.split(/\r?\n/).filter((line) =>
		line.includes("curl") && line.includes("$BASE_URL/mcp")
	);
}

function unquoteShellDoubleQuoted(raw: string): string {
	return raw.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

/** Replaces the documented `META='...'` helper variable used by the examples. */
function expandDocumentedVariables(body: string, fileText: string): string {
	const meta = /META='([^']*)'/.exec(fileText)?.[1] ?? "";
	return body.replace(/\$\{META\}/g, meta).replace(/\$META\b/g, meta);
}

function parseCurlExamples(text: string, file: string): CurlExample[] {
	const examples: CurlExample[] = [];

	for (const command of mcpCurlCommands(text)) {
		const headers: Record<string, string> = {};
		for (const match of command.matchAll(/-H\s+(?:"([^"]*)"|'([^']*)')/g)) {
			const header = match[1] ?? match[2] ?? "";
			const separator = header.indexOf(":");
			if (separator > 0) {
				headers[header.slice(0, separator).trim().toLowerCase()] = header.slice(separator + 1)
					.trim();
			}
		}

		const dataMatch = /(?:^|\s)-d\s+(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/.exec(command);
		if (!dataMatch) {
			examples.push({
				file,
				headers,
				body: {},
				bodyError: "missing -d request body",
			});
			continue;
		}
		const rawBody = dataMatch[1] !== undefined
			? unquoteShellDoubleQuoted(dataMatch[1])
			: (dataMatch[2] ?? "");

		let body: Record<string, unknown>;
		let bodyError: string | undefined;
		try {
			body = JSON.parse(expandDocumentedVariables(rawBody, text)) as Record<string, unknown>;
		} catch {
			body = {};
			bodyError = "request body is not parseable JSON";
		}

		examples.push({ file, headers, body, bodyError });
	}

	return examples;
}

function violationsOf(example: CurlExample): string[] {
	const violations: string[] = [];
	const method = example.body.method;
	const where = `${example.file} (${typeof method === "string" ? method : "unparsed body"})`;

	if (example.bodyError) {
		violations.push(`${where}: ${example.bodyError}`);
		return violations;
	}

	const mediaRanges = (example.headers["accept"] ?? "")
		.split(",")
		.map((range) => range.split(";")[0].trim().toLowerCase());
	for (const required of ["application/json", "text/event-stream"]) {
		if (!mediaRanges.includes(required)) {
			violations.push(`${where}: Accept must list the exact media range ${required}`);
		}
	}
	if (example.headers["content-type"] !== "application/json") {
		violations.push(`${where}: missing Content-Type: application/json`);
	}
	if (example.headers["mcp-protocol-version"] !== "2026-07-28") {
		violations.push(`${where}: missing MCP-Protocol-Version: 2026-07-28`);
	}
	if (typeof method !== "string") {
		violations.push(`${where}: body has no JSON-RPC method`);
		return violations;
	}
	if (example.headers["mcp-method"] !== method) {
		violations.push(`${where}: Mcp-Method header must equal the body method`);
	}

	const params = example.body.params as
		| { _meta?: Record<string, unknown>; name?: unknown; uri?: unknown }
		| undefined;
	const meta = params?._meta;
	if (meta?.["io.modelcontextprotocol/protocolVersion"] !== "2026-07-28") {
		violations.push(
			`${where}: _meta must carry io.modelcontextprotocol/protocolVersion 2026-07-28`,
		);
	}
	const capabilities = meta?.["io.modelcontextprotocol/clientCapabilities"];
	if (typeof capabilities !== "object" || capabilities === null || Array.isArray(capabilities)) {
		violations.push(`${where}: _meta clientCapabilities must be a non-array JSON object`);
	}

	const nameParameter = NAME_PARAMETER_BY_METHOD[method];
	const mcpName = example.headers["mcp-name"];
	if (nameParameter) {
		const expectedName = params?.[nameParameter];
		if (typeof expectedName !== "string") {
			violations.push(`${where}: body params.${nameParameter} is missing`);
		} else if (mcpName !== expectedName) {
			violations.push(`${where}: Mcp-Name header must equal params.${nameParameter}`);
		}
	} else if (mcpName !== undefined) {
		violations.push(`${where}: Mcp-Name header must be omitted for ${method}`);
	}

	return violations;
}

function allExamples(docs: Docs): CurlExample[] {
	return [
		...parseCurlExamples(docs.readme, "README.md"),
		...parseCurlExamples(docs.mcpDoc, "docs/mcp.md"),
	];
}

/** Removes the request body from the first documented /mcp curl command. */
function removeFirstMcpRequestBody(text: string): string {
	return text.replace(
		/(\$BASE_URL\/mcp"[\s\S]*?)[ \t]*\\\n[ \t]*-d\s+(?:"(?:[^"\\]|\\.)*"|'[^']*')/,
		"$1",
	);
}

describe("modern MCP documentation", () => {
	it("checks every discovered /mcp curl, with non-vacuous extraction per document", async () => {
		const docs = await readDocs();
		const readmeExamples = parseCurlExamples(docs.readme, "README.md");
		const mcpDocExamples = parseCurlExamples(docs.mcpDoc, "docs/mcp.md");

		expect(readmeExamples.length).toBe(mcpCurlCommands(docs.readme).length);
		expect(mcpDocExamples.length).toBe(mcpCurlCommands(docs.mcpDoc).length);
		expect(readmeExamples.length).toBeGreaterThanOrEqual(1);
		expect(mcpDocExamples.length).toBeGreaterThanOrEqual(5);

		const methods = allExamples(docs).map((example) => example.body.method);
		expect(methods).toContain("server/discover");
		expect(methods).toContain("tools/call");
		expect(methods.filter((method) => method === "resources/read").length).toBeGreaterThan(0);
	});

	it("every documented /mcp curl example satisfies the 2026-07-28 request contract", async () => {
		const violations = allExamples(await readDocs()).flatMap(violationsOf);

		expect(violations).toEqual([]);
	});

	it("fails when a required header is removed from an example", async () => {
		const docs = await readDocs();
		const mutated = docs.mcpDoc.replace(/[ \t]*-H "Mcp-Method: tools\/call" \\\n/, "");

		expect(mutated).not.toEqual(docs.mcpDoc);
		const violations = parseCurlExamples(mutated, "docs/mcp.md").flatMap(violationsOf);
		expect(violations.some((violation) => violation.includes("Mcp-Method"))).toBe(true);
	});

	it("fails when an entire request body is deleted from an example", async () => {
		const docs = await readDocs();

		const mutatedReadme = removeFirstMcpRequestBody(docs.readme);
		expect(mutatedReadme).not.toEqual(docs.readme);
		const readmeViolations = parseCurlExamples(mutatedReadme, "README.md").flatMap(violationsOf);
		expect(readmeViolations.some((violation) => violation.includes("missing -d request body")))
			.toBe(true);

		const mutatedMcpDoc = removeFirstMcpRequestBody(docs.mcpDoc);
		expect(mutatedMcpDoc).not.toEqual(docs.mcpDoc);
		const mcpDocViolations = parseCurlExamples(mutatedMcpDoc, "docs/mcp.md").flatMap(
			violationsOf,
		);
		expect(mcpDocViolations.some((violation) => violation.includes("missing -d request body")))
			.toBe(true);
	});

	it("fails on lookalike Accept media types", async () => {
		const docs = await readDocs();
		const mutated = docs.mcpDoc.replace(
			/-H "Accept: application\/json, text\/event-stream"/,
			'-H "Accept: application/json-bogus, text/event-stream-bogus"',
		);

		expect(mutated).not.toEqual(docs.mcpDoc);
		const violations = parseCurlExamples(mutated, "docs/mcp.md").flatMap(violationsOf);
		expect(violations.some((violation) => violation.includes("Accept"))).toBe(true);
	});

	it("fails when clientCapabilities is an array", async () => {
		const docs = await readDocs();
		const mutated = docs.mcpDoc.replace(
			/("io\.modelcontextprotocol\/clientCapabilities":)\{\}/,
			"$1[]",
		);

		expect(mutated).not.toEqual(docs.mcpDoc);
		const violations = parseCurlExamples(mutated, "docs/mcp.md").flatMap(violationsOf);
		expect(violations.some((violation) => violation.includes("clientCapabilities"))).toBe(true);
	});

	it("fails when a required _meta field is removed from an example", async () => {
		const docs = await readDocs();
		const mutated = docs.mcpDoc.replace(
			/,"io\.modelcontextprotocol\/clientCapabilities":\{\}/,
			"",
		);

		expect(mutated).not.toEqual(docs.mcpDoc);
		const violations = parseCurlExamples(mutated, "docs/mcp.md").flatMap(violationsOf);
		expect(violations.some((violation) => violation.includes("clientCapabilities"))).toBe(true);
	});

	it("states the conditional Mcp-Name, Base64 sentinel, and body-limit defaults", async () => {
		const docs = await readDocs();
		const mcpDoc = docs.mcpDoc.toLowerCase();

		expect(mcpDoc).toContain("conditionally required");
		expect(mcpDoc).toContain("=?base64?");
		expect(mcpDoc).toContain("case-sensitive");
		expect(mcpDoc).toContain("sentinel");

		for (const text of [docs.mcpDoc, docs.readme]) {
			expect(text).toContain("mcpMaxRequestBodyBytes");
			expect(text).toContain("1048576");
			expect(text).toContain("413");
			expect(text.toLowerCase()).toContain("default");
		}
	});
});
