import { assert, assertEquals } from "../../dev_deps.ts";
import { InMemoryNodeRepository } from "../../src/adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "../../src/adapters/inmem/inmem_storage_provider.ts";
import { DefaultFidGenerator } from "../../src/adapters/strategies/default_fid_generator.ts";
import { DefaultUuidGenerator } from "../../src/adapters/strategies/default_uuid_generator.ts";
import { AntboxService } from "../../src/application/antbox_service.ts";

import { Root } from "../../src/application/builtin_users/root.ts";
import { AuthContextProvider } from "../../src/domain/auth/auth_provider.ts";
import { UserNode } from "../../src/domain/nodes/user_node.ts";
import { ValidationError } from "../../src/shared/validation_error.ts";

Deno.test("Auth Service Facade (Antbox Service)", async (t) => {
	const service = new AntboxService({
		fidGenerator: new DefaultFidGenerator(),
		repository: new InMemoryNodeRepository(),
		storage: new InMemoryStorageProvider(),
		uuidGenerator: new DefaultUuidGenerator(),
	});

	const rootCtx: AuthContextProvider = { principal: Root, mode: "Direct" };

	await t.step(
		"should return the current user if the user is authenticated",
		async () => {
			const userOrErr = await service.getMe(rootCtx);
			assert(userOrErr.isRight(), (userOrErr.value as ValidationError).message);
			assertEquals(userOrErr.value, Root);
		},
	);

	await t.step(
		"when creating a user, the groups should be unique and must include the main group",
		async () => {
			const userOrErr = await service.createUser(rootCtx, {
				email: "user@domain.com",
				title: "User",
				group: Root.group,
				groups: ["some-group", "some-group", "other-group"],
			});

			assert(userOrErr.isRight(), (userOrErr.value as ValidationError).message);
			assertEquals((userOrErr.value as UserNode).groups, [
				Root.group,
				"other-group",
				"some-group",
			]);
		},
	);
});
