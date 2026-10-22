import { expect } from "expect";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { AspectsService } from "application/aspects/aspects_service.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import type { AspectProperty } from "domain/configuration/aspect_data.ts";
import { FileNode } from "domain/nodes/file_node.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { NodeAspectRules } from "./node_aspect_rules.ts";
import { NodeService } from "./node_service.ts";

const admin: AuthenticationContext = {
	tenant: "test",
	mode: "Direct",
	principal: { email: Users.ROOT_USER_EMAIL, groups: [Groups.ADMINS_GROUP_UUID] },
};

Deno.test("aspect UUID validation rejects malformed values before repository lookup", async () => {
	const configRepo = new InMemoryConfigurationRepository();
	const service = new AspectsService(configRepo);
	let lookups = 0;
	const rules = new NodeAspectRules(configRepo, () => {
		lookups++;
		throw new Error("Invalid references must not reach the repository");
	});
	for (
		const [type, arrayType, values] of [
			["uuid", undefined, [42, [], "bad/id"]],
			["array", "uuid", [42, "node-1234", [42], ["bad/id"]]],
		] as const
	) {
		const property: AspectProperty = { name: "reference", title: "Reference", type, arrayType };
		const aspect = await service.createAspect(admin, {
			uuid: `reference-${type}`,
			title: "Reference aspect",
			filters: [],
			properties: [property],
		});
		if (aspect.isLeft()) throw aspect.value;
		for (const value of values) {
			const node = FileNode.create({
				title: "Test file",
				owner: admin.principal.email,
				mimetype: "text/plain",
				aspects: [aspect.value.uuid],
				properties: { [`${aspect.value.uuid}:reference`]: value },
			}).right;
			expect((await rules.validateAndUpdate(node)).isLeft()).toBe(true);
		}
	}
	expect(lookups).toBe(0);
});

Deno.test("searchable aspect properties survive save and update and populate fulltext", async () => {
	const configRepo = new InMemoryConfigurationRepository();
	const aspects = new AspectsService(configRepo);
	const property: AspectProperty = {
		name: "code",
		title: "Code",
		type: "string",
		searchable: true,
	};
	const created = await aspects.createAspect(admin, {
		uuid: "catalog",
		title: "Catalog",
		filters: [],
		properties: [property, {
			name: "details",
			title: "Details",
			type: "object",
			searchable: true,
		}],
	});
	if (created.isLeft()) throw created.value;
	expect(created.value.properties[0].searchable).toBe(true);
	const changed = await aspects.updateAspect(admin, "catalog", { title: "Updated catalog" });
	if (changed.isLeft()) throw changed.value;
	expect(changed.value.properties[0].searchable).toBe(true);
	const service = new NodeService({
		configRepo,
		repository: new InMemoryNodeRepository(),
		storage: new InMemoryStorageProvider(),
		bus: { publish() {}, subscribe() {}, unsubscribe() {} },
	});
	const folder = await service.create(admin, {
		title: "Folder",
		parent: Nodes.ROOT_FOLDER_UUID,
		mimetype: Nodes.FOLDER_MIMETYPE,
	});
	if (folder.isLeft()) throw folder.value;
	const node = await service.create(admin, {
		title: "Item",
		parent: folder.value.uuid,
		mimetype: Nodes.META_NODE_MIMETYPE,
		aspects: ["catalog"],
		properties: {
			"catalog:code": "UniqueSearchMarker",
			"catalog:details": { toString: null, valueOf: null, nested: "StructuredMarker" },
		},
	});
	if (node.isLeft()) throw node.value;
	expect(node.value.fulltext).toContain("uniquesearchmarker");
	expect(node.value.fulltext).toContain("structuredmarker");
	expect((await service.find(admin, "UniqueSearchMarker")).right.nodes.map((n) => n.uuid))
		.toEqual([node.value.uuid]);
	const invalid = await aspects.updateAspect(admin, "catalog", {
		properties: [{ ...property, searchable: "yes" as unknown as boolean }],
	});
	expect(invalid.isLeft()).toBe(true);
	expect((await aspects.getAspect(admin, "catalog")).right.properties[0].searchable).toBe(true);
});
