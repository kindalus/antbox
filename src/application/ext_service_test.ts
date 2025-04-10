import { describe, expect, test } from 'bun:test';
import { NodeService } from './node_service';
import { InMemoryNodeRepository } from 'adapters/inmem/inmem_node_repository';
import { InMemoryStorageProvider } from 'adapters/inmem/inmem_storage_provider';
import { InMemoryEventBus } from 'adapters/inmem/inmem_event_bus';
import { ExtService } from './ext_service';
import type { AuthenticationContext } from './authentication_context';
import { Nodes } from 'domain/nodes/nodes';
import { Groups } from 'domain/users_groups/groups';
import { ExtNotFoundError } from './ext_not_found_error';
import { GroupNode } from 'domain/users_groups/group_node';
import { NodeNotFoundError } from 'domain/nodes/node_not_found_error';

const createService = () => {
    const groupNode: GroupNode = GroupNode.create({
        uuid: "--group-uuid--",
        title: "Group",
        description: "Group description",
        owner: "root@example.com"
    }).right;

    const repository = new InMemoryNodeRepository();
    repository.add(groupNode);

    const storage = new InMemoryStorageProvider();
    const eventBus = new InMemoryEventBus();
    const nodeService = new NodeService({ repository, storage, bus: eventBus });
    return new ExtService(nodeService);
}

const adminAuthContext: AuthenticationContext = {
    mode: "Direct",
    tenant: "default",
    principal: {
        email: "admin@example.com",
        groups: [Groups.ADMINS_GROUP_UUID],
    }
}

const errMsg = (err: any) => {
    if (err instanceof Error) {
        return err.message;
    }
    return JSON.stringify(err);
}

describe("ExtService", () => {
    test("createOrReplace should create a new ext node", async () => {
        const service = createService();
        const file = new File(["content"], "test.ext", { type: Nodes.EXT_MIMETYPE });

        const extOrErr = await service.createOrReplace(adminAuthContext, file, {
            uuid: "--ext-uuid--",
            title: "Title",
            description: "Description",
            mimetype: Nodes.EXT_MIMETYPE,
        });

        expect(extOrErr.isRight(), errMsg(extOrErr.value)).toBeTruthy();
        expect(extOrErr.right.uuid).toBe("--ext-uuid--");
        expect(extOrErr.right.title).toBe("Title");
        expect(extOrErr.right.description).toBe("Description");
    });

    test("createOrReplace should replace an existing ext node", async () => {
        const service = createService();
        const file = new File(["content"], "test.ext", { type: Nodes.EXT_MIMETYPE });

        const extOrErr = await service.createOrReplace(adminAuthContext, file, {
            uuid: "--ext-uuid--",
            title: "Title",
            description: "Description",
            mimetype: Nodes.EXT_MIMETYPE,
        });

        expect(extOrErr.isRight(), errMsg(extOrErr.value)).toBeTruthy();

        const updatedExtOrErr = await service.createOrReplace(adminAuthContext, file, {
            uuid: "--ext-uuid--",
            title: "Updated Title",
            description: "Updated Description",
            mimetype: Nodes.EXT_MIMETYPE,
        });

        expect(updatedExtOrErr.isRight(), errMsg(updatedExtOrErr.value)).toBeTruthy();
        expect(updatedExtOrErr.right.title).toBe("Updated Title");
        expect(updatedExtOrErr.right.description).toBe("Updated Description");
    });

    test("get should return the ext node", async () => {
        const service = createService();
        const file = new File(["content"], "test.ext", { type: Nodes.EXT_MIMETYPE });

        await service.createOrReplace(adminAuthContext, file, {
            uuid: "--ext-uuid--",
            title: "Title",
            description: "Description",
            mimetype: Nodes.EXT_MIMETYPE,
        });

        const extOrErr = await service.get(adminAuthContext, "--ext-uuid--");

        expect(extOrErr.isRight(), errMsg(extOrErr.value)).toBeTruthy();
        expect(extOrErr.right.uuid).toBe("--ext-uuid--");
        expect(extOrErr.right.title).toBe("Title");
    });

    test("get should return an error if the ext node not found", async () => {
        const service = createService();

        const extOrErr = await service.get(adminAuthContext, "--any-ext-uuid--");

        expect(extOrErr.isLeft()).toBeTruthy();
        expect(extOrErr.value).toBeInstanceOf(NodeNotFoundError);
    });

    test("get should return error if found node is not an ext", async () => {
        const service = createService();
        const file = new File(["content"], "test.ext", { type: Nodes.EXT_MIMETYPE });
        await service.createOrReplace(adminAuthContext, file, {
            uuid: "--ext-uuid--",
            title: "Title",
            description: "Description",
            mimetype: Nodes.EXT_MIMETYPE,
        });

        const extOrErr = await service.get(adminAuthContext, "--group-uuid--");

        expect(extOrErr.isLeft(), errMsg(extOrErr.value)).toBeTruthy();
        expect(extOrErr.value).toBeInstanceOf(ExtNotFoundError);
    });

    test("update should update the ext node", async () => {
        const service = createService();
        const file = new File(["content"], "test.ext", { type: Nodes.EXT_MIMETYPE });

        await service.createOrReplace(adminAuthContext, file, {
            uuid: "--ext-uuid--",
            title: "Title",
            description: "Description",
            mimetype: Nodes.EXT_MIMETYPE,
        });

        const updatedExtOrErr = await service.update(adminAuthContext, "--ext-uuid--", {
            title: "Updated Title",
            description: "Updated Description",
        });
        expect(updatedExtOrErr.isRight(), errMsg(updatedExtOrErr.value)).toBeTruthy();

        const extOrErr = await service.get(adminAuthContext, "--ext-uuid--");
        expect(extOrErr.isRight(), errMsg(extOrErr.value)).toBeTruthy();
        expect(extOrErr.right.uuid).toBe("--ext-uuid--");
        expect(extOrErr.right.title).toBe("Updated Title");
        expect(extOrErr.right.description).toBe("Updated Description");
    });
});