import { describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import type { AspectProperty } from "domain/configuration/aspect_data.ts";
import type { NodeFilters } from "domain/nodes/node_filter.ts";
import { SELF_REFERENCE_FILTER_ERROR } from "domain/nodes/node_filter.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import { NodeService } from "./node_service.ts";

const admin: AuthenticationContext = {
	tenant: "test",
	mode: "Direct",
	principal: { email: Users.ROOT_USER_EMAIL, groups: [Groups.ADMINS_GROUP_UUID] },
};

const META = Nodes.META_NODE_MIMETYPE;
const FOLDER = Nodes.FOLDER_MIMETYPE;

async function fixture() {
	const configRepo = new InMemoryConfigurationRepository();
	const now = new Date().toISOString();
	const saveAspect = (uuid: string, properties: AspectProperty[]) =>
		configRepo.save("aspects", {
			uuid,
			title: uuid,
			filters: [],
			properties,
			createdTime: now,
			modifiedTime: now,
		});
	const service = new NodeService({
		configRepo,
		repository: new InMemoryNodeRepository(),
		storage: new InMemoryStorageProvider(),
		bus: { publish() {}, subscribe() {}, unsubscribe() {} },
	});
	const folder = async (filters: NodeFilters = []) => {
		const created = await service.create(admin, {
			title: "Folder",
			parent: Nodes.ROOT_FOLDER_UUID,
			mimetype: FOLDER,
			filters,
		});
		if (created.isLeft()) throw created.value;
		return created.value.uuid;
	};
	return { service, saveAspect, folder };
}

describe("${field} filter values", () => {
	it("validationFilters compare each referenced node with the node being written", async () => {
		const { service, saveAspect, folder } = await fixture();
		await saveAspect("process", [{ name: "date", title: "Date", type: "date" }]);
		await saveAspect("invoice", [
			{
				name: "process",
				title: "Process",
				type: "uuid",
				validationFilters: [["process:date", "<=", "${invoice:date}"]],
			},
			{ name: "date", title: "Date", type: "date" },
		]);
		const parent = await folder();
		const process = await service.create(admin, {
			title: "Process",
			parent,
			mimetype: META,
			aspects: ["process"],
			properties: { "process:date": "2026-08-12" },
		});
		if (process.isLeft()) throw process.value;

		const invoice = (date?: string) =>
			service.create(admin, {
				title: "Invoice",
				parent,
				mimetype: META,
				aspects: ["invoice"],
				properties: {
					"invoice:process": process.value.uuid,
					...(date ? { "invoice:date": date } : {}),
				},
			});
		expect((await invoice("2026-08-12")).isRight()).toBe(true);
		expect((await invoice("2026-09-01")).isRight()).toBe(true);
		expect((await invoice("2026-08-11")).isLeft()).toBe(true);
		// A reference to a field without a value fails the condition.
		expect((await invoice()).isLeft()).toBe(true);

		const created = await invoice("2026-09-01");
		if (created.isLeft()) throw created.value;
		const update = (date: string) =>
			service.update(admin, created.value.uuid, { properties: { "invoice:date": date } });
		expect((await update("2026-07-01")).isLeft()).toBe(true);
		expect((await update("2026-08-20")).isRight()).toBe(true);
	});

	it("validationFilters read properties of any aspect of the node and lists for in", async () => {
		const { service, saveAspect, folder } = await fixture();
		// The reference reads an aspect listed after the one that holds the uuid property.
		await saveAspect("order", [{
			name: "items",
			title: "Items",
			type: "array",
			arrayType: "uuid",
			validationFilters: [["uuid", "in", "${approval:allowed}"]],
		}]);
		await saveAspect("approval", [{
			name: "allowed",
			title: "Allowed",
			type: "array",
			arrayType: "string",
		}]);
		const parent = await folder();
		const item = async () => {
			const created = await service.create(admin, { title: "Item", parent, mimetype: META });
			if (created.isLeft()) throw created.value;
			return created.value.uuid;
		};
		const [a, b] = [await item(), await item()];

		const order = (items: string[], allowed?: string[]) =>
			service.create(admin, {
				title: "Order",
				parent,
				mimetype: META,
				aspects: ["order", "approval"],
				properties: {
					"order:items": items,
					...(allowed ? { "approval:allowed": allowed } : {}),
				},
			});
		expect((await order([a], [a])).isRight()).toBe(true);
		expect((await order([a, b], [a])).isLeft()).toBe(true);
		expect((await order([a])).isLeft()).toBe(true);
	});

	it("validationFilters read the node's accepted properties, with defaults and without undeclared ones", async () => {
		const { service, saveAspect, folder } = await fixture();
		await saveAspect("process", [{ name: "date", title: "Date", type: "date" }]);
		await saveAspect("invoice", [{
			name: "process",
			title: "Process",
			type: "uuid",
			validationFilters: [["process:date", "<=", "${limits:max-date}"]],
		}]);
		await saveAspect("limits", [{
			name: "max-date",
			title: "Max date",
			type: "date",
			defaultValue: "2026-08-31",
		}]);
		const parent = await folder();
		const process = await service.create(admin, {
			title: "Process",
			parent,
			mimetype: META,
			aspects: ["process"],
			properties: { "process:date": "2026-08-12" },
		});
		if (process.isLeft()) throw process.value;

		const invoice = (aspects: string[]) =>
			service.create(admin, {
				title: "Invoice",
				parent,
				mimetype: META,
				aspects,
				properties: { "invoice:process": process.value.uuid },
			});
		expect((await invoice(["invoice", "limits"])).isRight()).toBe(true);

		// Without the limits aspect, a value sent for its property is not kept, so it is not read.
		const undeclared = await service.create(admin, {
			title: "Invoice",
			parent,
			mimetype: META,
			aspects: ["invoice"],
			properties: { "invoice:process": process.value.uuid, "limits:max-date": "2026-12-31" },
		});
		expect(undeclared.isLeft()).toBe(true);
	});

	it("folder child filters compare fields of the child itself", async () => {
		const { service, saveAspect, folder } = await fixture();
		await saveAspect("contract", [
			{ name: "start", title: "Start", type: "date" },
			{ name: "end", title: "End", type: "date" },
		]);
		const parent = await folder([["contract:end", ">=", "${contract:start}"]]);
		const contract = (start: string, end: string) =>
			service.create(admin, {
				title: "Contract",
				parent,
				mimetype: META,
				aspects: ["contract"],
				properties: { "contract:start": start, "contract:end": end },
			});
		expect((await contract("2026-01-01", "2026-12-31")).isLeft()).toBe(false);
		expect((await contract("2026-12-31", "2026-01-01")).isLeft()).toBe(true);

		const created = await contract("2026-01-01", "2026-06-30");
		if (created.isLeft()) throw created.value;
		expect(
			(await service.update(admin, created.value.uuid, {
				properties: { "contract:end": "2025-12-31" },
			})).isLeft(),
		).toBe(true);

		// New filters on a folder are checked against each existing child, read from that child.
		expect(
			(await service.update(admin, parent, {
				filters: [["contract:start", "==", "${contract:end}"]],
			}))
				.isLeft(),
		).toBe(true);
		expect(
			(await service.update(admin, parent, {
				filters: [["contract:start", "<", "${contract:end}"]],
			}))
				.isRight(),
		).toBe(true);
	});

	it("an @ condition compares the parent folder with a value read from the node", async () => {
		const { service, saveAspect, folder } = await fixture();
		await saveAspect("project", [{ name: "folder-name", title: "Folder name", type: "string" }]);
		const parent = await folder([["@title", "==", "${project:folder-name}"]]);
		const child = (name: string) =>
			service.create(admin, {
				title: "Child",
				parent,
				mimetype: META,
				aspects: ["project"],
				properties: { "project:folder-name": name },
			});
		expect((await child("Folder")).isRight()).toBe(true);
		expect((await child("Other")).isLeft()).toBe(true);
	});

	it("folders reject ${@field}; searches and smart folders reject any ${field}", async () => {
		const { service, folder } = await fixture();
		expect(
			(await service.create(admin, {
				title: "Folder",
				parent: Nodes.ROOT_FOLDER_UUID,
				mimetype: FOLDER,
				filters: [["title", "==", "${@title}"]],
			})).isLeft(),
		).toBe(true);
		await folder([["title", "==", "${title}"]]);

		const search = await service.find(admin, [["title", "==", "${description}"]]);
		expect(search.isLeft()).toBe(true);
		expect(search.isLeft() && search.value.message).toBe(SELF_REFERENCE_FILTER_ERROR);
		expect((await service.find(admin, "title == ${description}")).isLeft()).toBe(true);

		expect(
			(await service.create(admin, {
				title: "Smart",
				parent: Nodes.ROOT_FOLDER_UUID,
				mimetype: Nodes.SMART_FOLDER_MIMETYPE,
				filters: [["title", "==", "${title}"]],
			})).isLeft(),
		).toBe(true);
	});
});
