import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider";
import { describe, expect, test } from "bun:test";
import { Groups } from "domain/users_groups/groups";
import { ApiKeyService } from "./api_key_service";
import type { AuthenticationContext } from "./authentication_context";
import { NodeService } from "./node_service";
import { GroupNode } from "domain/users_groups/group_node";
import { Nodes } from "domain/nodes/nodes";
import { ApiKeyNode } from "domain/api_keys/api_key_node";

export const errToMsg = (err: any): string => {
    if (err instanceof Error) {
       return err.message;
    }

    return JSON.stringify(err);
}

const createService = () => {
    const groupNode: GroupNode = GroupNode.create({
        uuid: "api-group",
        title: "API Group",
        owner: "owner@example.com",
        mimetype: Nodes.API_KEY_MIMETYPE
    }).right;

    const repository = new InMemoryNodeRepository();
    repository.add(groupNode);

    const storage = new InMemoryStorageProvider();
    const eventbus = new InMemoryEventBus();
    const nodeService = new NodeService({ repository, storage, bus: eventbus });

    return new ApiKeyService(repository, nodeService);
}

const authContext: AuthenticationContext = {
    mode: "Direct",
    tenant: "default",
    principal: {
        email: "owner@example.com",
        groups: [Groups.ADMINS_GROUP_UUID],
    }
}

describe("ApiKeyService", () => {
    test("create should create an API key", async () => {
        const service = createService();

        const apiKeyOrErr = await service.create(authContext, {
            group: "api-group",
            description: "Test API Key",
            secret: "my-secret"
        });

        expect(apiKeyOrErr.isRight(), errToMsg(apiKeyOrErr.value)).toBeTruthy();
        expect(apiKeyOrErr.right.group).toBe("api-group");
        expect(apiKeyOrErr.right.description).toBe("Test API Key");
        expect(apiKeyOrErr.right.owner).toBe(authContext.principal.email);
    });

    test("create should generate a unique secret", async () => {
        const service = createService();

        const apiKeyOrErr = await service.create(authContext, {
            group: "api-group",
            description: "Test API Key",
            secret: "the-secret"
        });

        expect(apiKeyOrErr.isRight(), errToMsg(apiKeyOrErr.value)).toBeTruthy();
        expect(ApiKeyNode.isSecureKey("my-secret")).toBeTruthy();
    });

    test("create should return error if group does not exist", async () => {
        const service = createService();

        const apiKeyOrErr = await service.create(authContext, {
            group: "non-existing-group",
            description: "Test API Key",
            secret: "my-secret"
        });

        expect(apiKeyOrErr.isLeft()).toBeTruthy();
        expect(errToMsg(apiKeyOrErr.value)).toContain("Could not find node");
    });
});