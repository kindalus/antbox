import { assert, assertFalse } from "../../dev_deps.ts";
import { InMemoryNodeRepository } from "../../src/adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "../../src/adapters/inmem/inmem_storage_provider.ts";
import { DefaultFidGenerator } from "../../src/adapters/strategies/default_fid_generator.ts";
import { DefaultUuidGenerator } from "../../src/adapters/strategies/default_uuid_generator.ts";
import { AntboxService } from "../../src/application/antbox_service.ts";
import { Anonymous } from "../../src/application/builtin_users/anonymous.ts";
import { Root } from "../../src/application/builtin_users/root.ts";
import { AuthContextProvider } from "../../src/domain/auth/auth_provider.ts";
import { Node } from "../../src/domain/nodes/node.ts";
import { ForbiddenError } from "../../src/shared/antbox_error.ts";
import { ValidationError } from "../../src/shared/validation_error.ts";

Deno.test("Aspect Service Facade (Antbox Service)", async (t) => {
	const service = new AntboxService({
		fidGenerator: new DefaultFidGenerator(),
		repository: new InMemoryNodeRepository(),
		storage: new InMemoryStorageProvider(),
		uuidGenerator: new DefaultUuidGenerator(),
	});

	const anonymousCtx: AuthContextProvider = { principal: Anonymous, mode: "Direct" };
	const rootCtx: AuthContextProvider = { principal: Root, mode: "Direct" };

	await t.step(
		"should return an error if user groups are not in the groupsAllowed property",
		async () => {
			const action = `
				export default {
    				uuid: "action_1",
					title: "action 1",	
    				runManually: true,
					groupsAllowed: ["--admins--"],


					async run(ctx, uuids, params) {
						console.log("Done");        
					}
				}`;

			const actionFile = new File([action], "action.js", { type: "application/javascript" });

			let nodeOrErr = await service.createOrReplaceAction(rootCtx, actionFile);
			assertFalse(nodeOrErr.isLeft(), (nodeOrErr.value as ValidationError).message);

			nodeOrErr = await service.create(rootCtx, {
				title: "Folder 1",
				mimetype: Node.FOLDER_MIMETYPE,
			});

			assertFalse(nodeOrErr.isLeft(), (nodeOrErr.value as ValidationError).message);

			const voidOrErr = await service.runAction(anonymousCtx, "action_1", [
				(nodeOrErr.value as Node).uuid,
			]);

			assert(
				voidOrErr.isLeft(),
				"action should not run because user is not in the allowed groups",
			);
			assert(voidOrErr.value instanceof ForbiddenError, "error should be a ForbiddenError");
		},
	);

	await t.step("should run action if user is in the allowed groups", async () => {
		const action = `
				export default {
					uuid: "action_2",
					title: "action 2",
					runManually: true,
					groupsAllowed: ["--admins--"],
					async run(ctx, uuids, params) {
						console.log("Done");
					}
				}`;

		const actionFile = new File([action], "action.js", { type: "application/javascript" });

		let nodeOrErr = await service.createOrReplaceAction(rootCtx, actionFile);
		assertFalse(nodeOrErr.isLeft(), (nodeOrErr.value as ValidationError).message);

		nodeOrErr = await service.create(rootCtx, {
			title: "Folder 2",
			mimetype: Node.FOLDER_MIMETYPE,
		});

		assertFalse(nodeOrErr.isLeft(), (nodeOrErr.value as ValidationError).message);

		const voidOrErr = await service.runAction(rootCtx, "action_2", [
			(nodeOrErr.value as Node).uuid,
		]);

		assertFalse(voidOrErr.isLeft());
	});
});
