import { it } from "bdd";
import { expect } from "expect";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { AspectsService } from "application/aspects/aspects_service.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import type { AspectProperty } from "domain/configuration/aspect_data.ts";
import { FileNode } from "domain/nodes/file_node.ts";
import { MetaNode } from "domain/nodes/meta_node.ts";
import { PropertyRequiredError } from "domain/nodes/property_errors.ts";
import { ValidationError } from "shared/validation_error.ts";
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

it("aspect UUID validation rejects malformed values before repository lookup", async () => {
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

it("searchable aspect properties survive save and update and are searchable", async () => {
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
	expect("fulltext" in node.value).toBe(false);
	for (const query of ["UniqueSearchMarker", "structuredmarker"]) {
		expect((await service.find(admin, query)).right.nodes.map((n) => n.uuid))
			.toEqual([node.value.uuid]);
	}
	const invalid = await aspects.updateAspect(admin, "catalog", {
		properties: [{ ...property, searchable: "yes" as unknown as boolean }],
	});
	expect(invalid.isLeft()).toBe(true);
	expect((await aspects.getAspect(admin, "catalog")).right.properties[0].searchable).toBe(true);
});

async function aspectFixture(properties: AspectProperty[]) {
	const configRepo = new InMemoryConfigurationRepository();
	const repository = new InMemoryNodeRepository();
	const now = new Date().toISOString();
	// Saved directly so the fixture can hold aspects that upload validation would reject.
	await configRepo.save("aspects", {
		uuid: "rules",
		title: "Rules",
		filters: [],
		properties,
		createdTime: now,
		modifiedTime: now,
	});
	const service = new NodeService({
		configRepo,
		repository,
		storage: new InMemoryStorageProvider(),
		bus: { publish() {}, subscribe() {}, unsubscribe() {} },
	});
	const folder = await service.create(admin, {
		title: "Folder",
		parent: Nodes.ROOT_FOLDER_UUID,
		mimetype: Nodes.FOLDER_MIMETYPE,
	});
	if (folder.isLeft()) throw folder.value;
	const parent = folder.value.uuid;
	const create = (properties: Record<string, unknown>) =>
		service.create(admin, {
			title: "Item",
			parent,
			mimetype: Nodes.META_NODE_MIMETYPE,
			aspects: ["rules"],
			properties,
		});
	const update = (uuid: string, properties: Record<string, unknown>) =>
		service.update(admin, uuid, { properties });
	const stored = async (uuid: string) =>
		(await repository.getById(uuid)).right.metadata.properties ?? {};
	return { repository, parent, create, update, stored };
}

it("an invalid stored validationRegex fails validation instead of throwing", async () => {
	const { create, update } = await aspectFixture([
		{ name: "code", title: "Code", type: "string", validationRegex: "[unclosed" },
	]);

	const created = await create({ "rules:code": "x" });
	expect(created.isLeft()).toBe(true);
	expect(created.value).toBeInstanceOf(ValidationError);
	expect((created.value as ValidationError).message).toContain("validationRegex");

	const empty = await create({});
	if (empty.isLeft()) throw empty.value;
	const updated = await update(empty.value.uuid, { "rules:code": "x" });
	expect(updated.isLeft()).toBe(true);
	expect(updated.value).toBeInstanceOf(ValidationError);
});

it("readonly properties are write-once: settable on update until a value is stored", async () => {
	const { create, update, stored } = await aspectFixture([
		{ name: "code", title: "Code", type: "string", readonly: true },
		{ name: "note", title: "Note", type: "string" },
	]);
	const node = await create({ "rules:note": "first" });
	if (node.isLeft()) throw node.value;

	expect((await update(node.value.uuid, { "rules:code": "A" })).isRight()).toBe(true);
	expect((await stored(node.value.uuid))["rules:code"]).toBe("A");

	expect((await update(node.value.uuid, { "rules:code": "B" })).isRight()).toBe(true);
	expect((await update(node.value.uuid, { "rules:code": null })).isRight()).toBe(true);
	expect(await stored(node.value.uuid)).toEqual({ "rules:code": "A", "rules:note": "first" });

	const createdWithValue = await create({ "rules:code": "C" });
	if (createdWithValue.isLeft()) throw createdWithValue.value;
	expect((await stored(createdWithValue.value.uuid))["rules:code"]).toBe("C");
});

it("an empty string in a typed property means no value, while strings keep it", async () => {
	const typed: AspectProperty[] = [
		{ name: "amount", title: "Amount", type: "number" },
		{ name: "flag", title: "Flag", type: "boolean" },
		{ name: "day", title: "Day", type: "date" },
		{ name: "ref", title: "Ref", type: "uuid" },
		{ name: "list", title: "List", type: "array", arrayType: "string" },
		{ name: "data", title: "Data", type: "object" },
	];
	const { create, update, stored } = await aspectFixture([
		...typed,
		{ name: "count", title: "Count", type: "number", defaultValue: 7 },
		{ name: "text", title: "Text", type: "string" },
	]);
	const empty = Object.fromEntries(
		[...typed.map((p) => p.name), "count", "text"].map((name) => [`rules:${name}`, ""]),
	);

	const node = await create(empty);
	if (node.isLeft()) throw node.value;
	expect(await stored(node.value.uuid)).toEqual({ "rules:count": 7, "rules:text": "" });

	const filled = await update(node.value.uuid, { "rules:amount": 3, "rules:count": 9 });
	if (filled.isLeft()) throw filled.value;
	expect((await update(node.value.uuid, { "rules:amount": "", "rules:count": "" })).isRight())
		.toBe(true);
	expect(await stored(node.value.uuid)).toEqual({ "rules:count": 7, "rules:text": "" });
});

it("an empty string does not satisfy a required typed property", async () => {
	const { create } = await aspectFixture([
		{ name: "amount", title: "Amount", type: "number", required: true },
	]);

	const result = await create({ "rules:amount": "" });

	expect(result.isLeft()).toBe(true);
	expect((result.value as ValidationError).has(PropertyRequiredError.ERROR_CODE)).toBe(true);
});

it("stored empty strings in typed properties are cleaned on the next update", async () => {
	const { repository, parent, update, stored } = await aspectFixture([
		{ name: "amount", title: "Amount", type: "number" },
		{ name: "count", title: "Count", type: "number", defaultValue: 7 },
		{ name: "frozen", title: "Frozen", type: "number", readonly: true },
		{ name: "note", title: "Note", type: "string" },
	]);
	const legacy = MetaNode.create({
		title: "Legacy",
		owner: admin.principal.email,
		parent,
		aspects: ["rules"],
		properties: { "rules:amount": "", "rules:count": "", "rules:frozen": "", "rules:note": "" },
	}).right;
	expect((await repository.add(legacy)).isRight()).toBe(true);

	const result = await update(legacy.uuid, { "rules:note": "edited" });
	expect(result.isRight(), result.isLeft() ? result.value.message : undefined).toBe(true);
	expect(await stored(legacy.uuid)).toEqual({ "rules:count": 7, "rules:note": "edited" });

	expect((await update(legacy.uuid, { "rules:frozen": 5 })).isRight()).toBe(true);
	expect((await stored(legacy.uuid))["rules:frozen"]).toBe(5);
});
