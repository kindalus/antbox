import { describe, it } from "bdd";
import { expect } from "expect";
import { ValidationError } from "shared/validation_error.ts";
import { MetaNode } from "./meta_node.ts";
import { Nodes } from "./nodes.ts";

describe("MetaNode", () => {
	it("create returns a meta node for valid metadata", () => {
		const result = MetaNode.create({ title: "Meta node", owner: "user@domain.com" });

		expect(result.isRight()).toBe(true);
		expect(result.right.mimetype).toBe(Nodes.META_NODE_MIMETYPE);
	});

	it("create returns a validation error instead of throwing for invalid metadata", () => {
		for (
			const metadata of [
				{ title: "ab", owner: "user@domain.com" },
				{ title: "Meta node", owner: "not an email" },
				{ uuid: "bad uuid!", title: "Meta node", owner: "user@domain.com" },
			]
		) {
			const result = MetaNode.create(metadata);

			expect(result.isLeft(), JSON.stringify(metadata)).toBe(true);
			expect(result.value).toBeInstanceOf(ValidationError);
		}
	});
});
