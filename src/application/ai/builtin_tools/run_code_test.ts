import { describe, it } from "bdd";
import { expect } from "expect";
import type { NodeServiceProxy } from "application/nodes/node_service_proxy.ts";
import type { AspectServiceProxy } from "application/aspects/aspect_service_proxy.ts";
import { createRunCodeTool } from "./run_code.ts";

function createTool(find: (...args: unknown[]) => Promise<unknown> = () => Promise.resolve([])) {
	const nodes = { find } as unknown as NodeServiceProxy;
	const aspects = {} as unknown as AspectServiceProxy;
	return createRunCodeTool(nodes, aspects, { greeting: "hello" });
}

describe("createRunCodeTool", () => {
	it("runs plain JavaScript and returns the string result", async () => {
		const run = createTool();
		const result = await run(`export default async function() { return "done"; }`);
		expect(result).toBe("done");
	});

	it("accepts TypeScript syntax", async () => {
		const run = createTool();
		const result = await run(`
interface Row { id: number; label: string }
type Rows = Row[];

export default async function({ custom }: { custom: { greeting: string } }): Promise<string> {
	const rows: Rows = [{ id: 1, label: custom.greeting }];
	return rows.map((row: Row): string => \`\${row.id}:\${row.label}\`).join(",");
}`);
		expect(result).toBe("1:hello");
	});

	it("supports method calls on the injected SDKs", async () => {
		const calls: unknown[][] = [];
		const run = createTool((...args) => {
			calls.push(args);
			return Promise.resolve({ nodes: [{ title: "a" }, { title: "b" }] });
		});
		const result = await run(`
export default async function({ nodes }) {
	const found = await nodes.find([["title", "contains", "a"]]);
	return JSON.stringify(found.nodes.map((node) => node.title));
}`);
		expect(JSON.parse(result)).toEqual(["a", "b"]);
		expect(calls).toEqual([[[["title", "contains", "a"]]]]);
	});

	it("handles code that ends with a call to join()", async () => {
		const run = createTool();
		const result = await run(
			`export default async function() { return ["a", "b", "c"].map((x) => x.toUpperCase()).join() }`,
		);
		expect(result).toBe("A,B,C");
	});

	it("serializes non-string results as JSON", async () => {
		const run = createTool();
		const result = await run(`export default async function() { return { count: 2 }; }`);
		expect(JSON.parse(result)).toEqual({ count: 2 });
	});

	it("reports an error when the default export is not a function", async () => {
		const run = createTool();
		const result = JSON.parse(await run(`export default { not: "a function" };`));
		expect(result.error).toBe(true);
		expect(result.message).toContain("Module must export a default function");
	});

	it("reports errors thrown by the code", async () => {
		const run = createTool();
		const result = JSON.parse(
			await run(`export default async function() { throw new TypeError("boom"); }`),
		);
		expect(result.error).toBe(true);
		expect(result.name).toBe("TypeError");
		expect(result.message).toBe("boom");
	});
});
