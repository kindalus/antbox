import { beforeEach, describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { NodeService } from "application/nodes/node_service.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import type { Permission } from "domain/nodes/node.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import { BadRequestError } from "shared/antbox_error.ts";
import { webdavPathCache } from "./webdav_path_cache.ts";
import { resolvePath } from "./webdav_utils.ts";

const root: AuthenticationContext = {
	mode: "Direct",
	tenant: "webdav-test",
	principal: { email: Users.ROOT_USER_EMAIL, groups: [Groups.ADMINS_GROUP_UUID] },
};
const member = { ...root, principal: { email: "member@example.com", groups: ["members"] } };

function setup() {
	return new NodeService({
		repository: new InMemoryNodeRepository(),
		storage: new InMemoryStorageProvider(),
		configRepo: new InMemoryConfigurationRepository(),
		bus: { publish() {}, subscribe() {}, unsubscribe() {} },
	});
}

async function folder(
	service: NodeService,
	title: string,
	parent = Nodes.ROOT_FOLDER_UUID,
	permissions: Permission[] = ["Read", "Write", "Export"],
) {
	const result = await service.create(root, {
		title,
		parent,
		mimetype: Nodes.FOLDER_MIMETYPE,
		permissions: { group: [], authenticated: permissions, anonymous: [], advanced: {} },
	});
	expect(result.isRight()).toBe(true);
	return result.right.uuid;
}

async function file(service: NodeService, parent: string) {
	const result = await service.createFile(
		root,
		new File(["old"], "file.txt", {
			type: "text/plain",
		}),
		{ parent },
	);
	expect(result.isRight()).toBe(true);
	return result.right.uuid;
}

describe("WebDAV path resolution", () => {
	beforeEach(() => webdavPathCache.clear());

	it("finds a file even when more than twenty other folders contain its title", async () => {
		const service = setup();
		let expected = "";
		for (let index = 0; index < 21; index++) {
			expected = await file(service, await folder(service, `Folder-${index}`));
		}
		const result = await resolvePath(service, root, "/Folder-20/file.txt", root.tenant);
		expect(result.isRight()).toBe(true);
		expect(result.right.uuid).toBe(expected);
	});

	it("returns current metadata on a cache hit", async () => {
		const service = setup();
		const uuid = await file(service, await folder(service, "Folder"));
		await resolvePath(service, root, "/Folder/file.txt", root.tenant);
		await service.updateFile(
			root,
			uuid,
			new File(["replacement"], "file.txt", {
				type: "text/plain",
			}),
		);
		const result = await resolvePath(service, root, "/Folder/file.txt", root.tenant);
		expect(result.right.size).toBe(11);
	});

	it("rejects a cached old path after an ancestor is renamed", async () => {
		const service = setup();
		const parent = await folder(service, "Folder");
		const uuid = await file(service, parent);
		await resolvePath(service, root, "/Folder/file.txt", root.tenant);
		await service.update(root, parent, { title: "Renamed" });
		expect((await resolvePath(service, root, "/Folder/file.txt", root.tenant)).isLeft()).toBe(
			true,
		);
		expect((await resolvePath(service, root, "/Renamed/file.txt", root.tenant)).right.uuid).toBe(
			uuid,
		);
	});

	it("rechecks every ancestor permission when sharing a cached path across users", async () => {
		const service = setup();
		const ancestor = await folder(service, "Private", Nodes.ROOT_FOLDER_UUID, []);
		const parent = await folder(service, "Public", ancestor);
		await file(service, parent);
		const path = "/Private/Public/file.txt";
		expect((await resolvePath(service, root, path, root.tenant)).isRight()).toBe(true);
		expect((await resolvePath(service, member, path, root.tenant)).isLeft()).toBe(true);
	});

	it("returns a validation error for malformed percent escapes", async () => {
		const result = await resolvePath(setup(), root, "/Folder/%invalid", root.tenant);
		expect(result.value).toBeInstanceOf(BadRequestError);
	});
});
