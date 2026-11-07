import { describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { SqliteNodeRepository } from "adapters/sqlite/sqlite_node_repository.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import type { AspectProperty } from "domain/configuration/aspect_data.ts";
import type { NodeLike } from "domain/node_like.ts";
import { FolderNode } from "domain/nodes/folder_node.ts";
import type { NodeFilters } from "domain/nodes/node_filter.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import type { NodeRepository } from "domain/nodes/node_repository.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import { type Either, left, right } from "shared/either.ts";
import { NodeService } from "./node_service.ts";
import { filtersSatisfiedBy } from "./parent_filters.ts";

const admin: AuthenticationContext = {
	tenant: "test",
	mode: "Direct",
	principal: { email: Users.ROOT_USER_EMAIL, groups: [Groups.ADMINS_GROUP_UUID] },
};

const META = Nodes.META_NODE_MIMETYPE;
const FOLDER = Nodes.FOLDER_MIMETYPE;

const repositories: Array<[string, () => NodeRepository]> = [
	["inmem", () => new InMemoryNodeRepository()],
	["sqlite", () => new SqliteNodeRepository()],
];

async function fixture(repository: NodeRepository) {
	const configRepo = new InMemoryConfigurationRepository();
	const now = new Date().toISOString();
	const saveAspect = (uuid: string, filters: NodeFilters, properties: AspectProperty[] = []) =>
		configRepo.save("aspects", {
			uuid,
			title: uuid,
			filters,
			properties,
			createdTime: now,
			modifiedTime: now,
		});
	await saveAspect("reseller", []);
	// The production case: metanodes whose parent folder has the "reseller" aspect.
	await saveAspect("establishment", [
		["mimetype", "==", META],
		["@aspects", "contains", "reseller"],
	]);
	const service = new NodeService({
		configRepo,
		repository,
		storage: new InMemoryStorageProvider(),
		bus: { publish() {}, subscribe() {}, unsubscribe() {} },
	});
	const folder = async (title: string, metadata: Record<string, unknown> = {}) => {
		const created = await service.create(admin, {
			title,
			parent: Nodes.ROOT_FOLDER_UUID,
			mimetype: FOLDER,
			...metadata,
		});
		if (created.isLeft()) throw created.value;
		return created.value.uuid;
	};
	return { service, saveAspect, folder };
}

describe("parent folder (@) filters on single nodes", () => {
	for (const [name, makeRepository] of repositories) {
		describe(name, () => {
			it("an aspect with an @ filter applies only under a matching parent folder", async () => {
				const { service, folder } = await fixture(makeRepository());
				const reseller = await folder("Reseller", { aspects: ["reseller"] });
				const plain = await folder("Plain");

				const allowed = await service.create(admin, {
					title: "Shop",
					parent: reseller,
					mimetype: META,
					aspects: ["establishment"],
				});
				expect(allowed.isRight(), allowed.isLeft() ? allowed.value.message : undefined)
					.toBe(true);

				const rejected = await service.create(admin, {
					title: "Shop",
					parent: plain,
					mimetype: META,
					aspects: ["establishment"],
				});
				expect(rejected.isLeft()).toBe(true);

				const later = await service.create(admin, {
					title: "Shop",
					parent: plain,
					mimetype: META,
				});
				if (later.isLeft()) throw later.value;
				expect(
					(await service.update(admin, later.value.uuid, { aspects: ["establishment"] }))
						.isLeft(),
				).toBe(true);
				const moved = await service.update(admin, later.value.uuid, {
					parent: reseller,
					aspects: ["establishment"],
				});
				expect(moved.isRight(), moved.isLeft() ? moved.value.message : undefined).toBe(true);

				if (allowed.isLeft()) return;
				expect((await service.update(admin, allowed.value.uuid, { parent: plain })).isLeft())
					.toBe(true);
			});

			it("folder child filters evaluate @ conditions against that folder", async () => {
				const { service, folder } = await fixture(makeRepository());
				const filters: NodeFilters = [["@title", "==", "Inbox"]];
				const inbox = await folder("Inbox", { filters });
				const other = await folder("Other", { filters });

				expect((await service.create(admin, { title: "Item", parent: inbox, mimetype: META }))
					.isRight()).toBe(true);
				expect((await service.create(admin, { title: "Item", parent: other, mimetype: META }))
					.isLeft()).toBe(true);

				const outside = await folder("Outside");
				const item = await service.create(admin, {
					title: "Item",
					parent: outside,
					mimetype: META,
				});
				if (item.isLeft()) throw item.value;
				expect((await service.update(admin, item.value.uuid, { parent: inbox })).isRight())
					.toBe(true);

				expect(
					(await service.update(admin, inbox, { filters: [["@title", "==", "Inbox"]] }))
						.isRight(),
				).toBe(true);
				expect(
					(await service.update(admin, inbox, { filters: [["@title", "==", "Other"]] }))
						.isLeft(),
				).toBe(true);
			});

			it("@ conditions in an aspect see the root folder as the parent of top-level nodes", async () => {
				const { service, saveAspect, folder } = await fixture(makeRepository());
				await saveAspect("top-level", [["@uuid", "==", Nodes.ROOT_FOLDER_UUID]]);

				expect((await service.create(admin, {
					title: "Top",
					parent: Nodes.ROOT_FOLDER_UUID,
					mimetype: FOLDER,
					aspects: ["top-level"],
				})).isRight()).toBe(true);

				const nested = await folder("Nested");
				expect((await service.create(admin, {
					title: "Below",
					parent: nested,
					mimetype: FOLDER,
					aspects: ["top-level"],
				})).isLeft()).toBe(true);
			});

			it("validationFilters evaluate @ conditions against the referenced node's parent", async () => {
				const { service, saveAspect, folder } = await fixture(makeRepository());
				await saveAspect("contract", [], [{
					name: "customer",
					title: "Customer",
					type: "uuid",
					validationFilters: [["@aspects", "contains", "reseller"]],
				}]);
				const reseller = await folder("Reseller", { aspects: ["reseller"] });
				const plain = await folder("Plain");
				const good = await service.create(admin, {
					title: "Good",
					parent: reseller,
					mimetype: META,
				});
				const bad = await service.create(admin, {
					title: "Bad",
					parent: plain,
					mimetype: META,
				});
				if (good.isLeft() || bad.isLeft()) throw new Error("fixture failed");

				const create = (customer: string) =>
					service.create(admin, {
						title: "Contract",
						parent: plain,
						mimetype: META,
						aspects: ["contract"],
						properties: { "contract:customer": customer },
					});
				expect((await create(good.value.uuid)).isRight()).toBe(true);
				expect((await create(bad.value.uuid)).isLeft()).toBe(true);
			});
		});
	}
});

describe("filtersSatisfiedBy", () => {
	const owner = Users.ROOT_USER_EMAIL;
	const group = Groups.ADMINS_GROUP_UUID;
	const folder = (uuid: string, title: string) =>
		FolderNode.create({ uuid, title, owner, group, parent: Nodes.ROOT_FOLDER_UUID })
			.right;
	const child = (parent: string) =>
		FolderNode.create({ title: "Child", owner, group, parent }).right;

	const counting = (nodes: NodeLike[]) => {
		const calls: string[] = [];
		const getNode = (uuid: string): Promise<Either<NodeNotFoundError, NodeLike>> => {
			calls.push(uuid);
			const node = nodes.find((n) => n.uuid === uuid);
			return Promise.resolve(node ? right(node) : left(new NodeNotFoundError(uuid)));
		};
		return { calls, getNode };
	};

	it("evaluates @ conditions on the parent and the rest on the node, per AND group", async () => {
		const parent = folder("parent-1", "Invoices");
		const { calls, getNode } = counting([parent]);
		const node = child("parent-1");

		const check = async (filters: NodeFilters) =>
			(await filtersSatisfiedBy(filters, node, getNode)).isRight();

		expect(await check([["@title", "==", "Invoices"], ["title", "==", "Child"]])).toBe(true);
		expect(await check([["@title", "==", "Invoices"], ["title", "==", "Other"]])).toBe(false);
		expect(await check([["@title", "==", "Other"], ["title", "==", "Child"]])).toBe(false);
		expect(
			await check([[["@title", "==", "Other"]], [["title", "==", "Child"]]]),
		).toBe(true);
		expect(await check([[["@title", "==", "Other"]], [["@uuid", "==", "parent-1"]]])).toBe(true);
		expect(calls).toEqual(["parent-1", "parent-1", "parent-1", "parent-1", "parent-1"]);
	});

	it("loads nothing without @ conditions and fails @ conditions when the parent is missing", async () => {
		const { calls, getNode } = counting([]);
		const node = child("missing-parent");

		expect((await filtersSatisfiedBy([["title", "==", "Child"]], node, getNode)).isRight())
			.toBe(true);
		expect(calls).toEqual([]);

		expect((await filtersSatisfiedBy([["@title", "==", "x"]], node, getNode)).isLeft()).toBe(
			true,
		);
		expect(
			(await filtersSatisfiedBy([["@title", "not-in", ["x"]]], node, getNode)).isLeft(),
		).toBe(true);
		expect(
			(await filtersSatisfiedBy(
				[[["@title", "==", "x"]], [["title", "==", "Child"]]],
				node,
				getNode,
			))
				.isRight(),
		).toBe(true);
	});

	it("uses the root folder, which is not stored, as the parent of top-level nodes", async () => {
		const { calls, getNode } = counting([]);
		const node = child(Nodes.ROOT_FOLDER_UUID);

		expect(
			(await filtersSatisfiedBy([["@uuid", "==", Nodes.ROOT_FOLDER_UUID]], node, getNode))
				.isRight(),
		).toBe(true);
		expect(calls).toEqual([]);
	});
});
