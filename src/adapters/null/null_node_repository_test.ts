import { expect } from "expect";
import { Users } from "domain/users_groups/users.ts";
import buildNullNodeRepository from "./null_node_repository.ts";

Deno.test("null node repository builds a valid synthetic node and ignores timestamp writes", async () => {
	const built = await buildNullNodeRepository();
	if (built.isLeft()) throw built.value;
	const repository = built.value;
	const node = (await repository.getById("any-node")).right;
	expect(node.title).toBe("Null");
	expect(node.owner).toBe(Users.ANONYMOUS_USER_EMAIL);
	expect((await repository.getByFid("any-fid")).right.metadata).toEqual(node.metadata);
	const before = node.metadata;
	expect((await repository.touch("any-node")).isRight()).toBe(true);
	expect((await repository.getById("any-node")).right.metadata).toEqual(before);
	expect((await repository.filter([])).nodes).toEqual([]);
});
