import { assert, assertEquals } from "../../dev_deps.ts";
import { InMemoryNodeRepository } from "../adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "../adapters/inmem/inmem_storage_provider.ts";
import { DefaultFidGenerator } from "../adapters/strategies/default_fid_generator.ts";
import { DefaultUuidGenerator } from "../adapters/strategies/default_uuid_generator.ts";
import { Aspect } from "../domain/aspects/aspect.ts";
import { Node } from "../domain/nodes/node.ts";
import { AntboxError } from "../shared/antbox_error.ts";
import { AspectService } from "./aspect_service.ts";
import { NodeService } from "./node_service.ts";
import { NodeServiceContext } from "./node_service_context.ts";

Deno.test("createAspect", async (t) => {
	await t.step("Node uuid and title should be the same as aspect", async () => {
		const ctx: NodeServiceContext = {
			fidGenerator: new DefaultFidGenerator(),
			uuidGenerator: new DefaultUuidGenerator(),
			repository: new InMemoryNodeRepository(),
			storage: new InMemoryStorageProvider(),
		};

		const nodeService = new NodeService(ctx);
		const service = new AspectService(nodeService);

		const aspect: Aspect = {
			uuid: "advogado",
			title: "Advogado",
			builtIn: false,
			filters: [],
			properties: [],
		};

		const file = new File([JSON.stringify(aspect)], "advogado.json", {
			type: "application/json",
		});

		const nodeOrErr = await service.createOrReplace(file, {
			uuid: "jwWs91nx",
			title: ctx.uuidGenerator.generate(),
			parent: "--aspects--",
		});

		const node = nodeOrErr.value as Node;

		assert(nodeOrErr.isRight(), (nodeOrErr.value as AntboxError).errorCode);
		assertEquals(node.uuid, aspect.uuid);
		assertEquals(node.title, aspect.title);
	});
});
