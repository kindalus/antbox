
import {
  createApp,
  createRouter,
  defineEventHandler,
  toNodeListener,
} from "h3";
import { serve } from "std/http/server.ts";
import { NodeService } from "../../application/node_service.ts";
import { InMemoryNodeRepository } from "../../adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "../../adapters/inmem/inmem_storage_provider.ts";
import { InMemoryEventBus } from "../../adapters/inmem/inmem_event_bus.ts";
import { Users } from "../../domain/users_groups/users.ts";
import { AuthenticationContext } from "../../application/authentication_context.ts";
import { Folders } from "../../domain/nodes/folders.ts";
import { NodeLike } from "../../domain/node_like.ts";
import { NodeNotFoundError } from "../../domain/nodes/node_not_found_error.ts";
import { AntboxError } from "../../shared/antbox_error.ts";
import { Either, left, right } from "../../shared/either.ts";
import { NodeMetadata } from "../../domain/nodes/node_metadata.ts";
import { Nodes } from "../../domain/nodes/nodes.ts";

const nodeService = new NodeService({
  repository: new InMemoryNodeRepository(),
  storage: new InMemoryStorageProvider(),
  bus: new InMemoryEventBus(),
});

const app = createApp();
const router = createRouter();

const REPOSITORY_ID = "antbox-repo";
const REPOSITORY_NAME = "Antbox Repository";

const cmisHandler = defineEventHandler(async (event) => {
  const { req, res } = event.node;
  const method = req.method;
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const path = url.pathname;
  const query = Object.fromEntries(url.searchParams.entries());

  const authContext: AuthenticationContext = {
    tenant: "default",
    principal: { email: Users.ANONYMOUS_USER_EMAIL, groups: [] },
    mode: "Direct",
  };

  console.log(`CMIS request: ${method} ${path} with query ${JSON.stringify(query)}`);

  res.setHeader("Content-Type", "application/json");

  // CMIS Browser Binding endpoints
  if (path === `/cmis/json/${REPOSITORY_ID}` || path === `/cmis/json`) {
    if (query.cmisaction === "getRepositoryInfo") {
      return getRepositoryInfo(res);
    } else if (query.cmisaction === "getRepositories") {
      return getRepositories(res);
    } else if (query.cmisaction === "getChildren") {
      return getChildren(query.objectId, query.succinct, res, authContext);
    } else if (query.cmisaction === "getObject") {
      return getObject(query.objectId, query.succinct, res, authContext);
    } else if (query.cmisaction === "getContentStream") {
      return getContentStream(query.objectId, res, authContext);
    } else if (query.cmisaction === "createDocument") {
      const formData = await readFormData(req);
      const properties = JSON.parse(formData.get("properties") as string);
      const content = formData.get("content") as File;
      return createDocument(properties, content, res, authContext);
    } else if (query.cmisaction === "createFolder") {
      const formData = await readFormData(req);
      const properties = JSON.parse(formData.get("properties") as string);
      return createFolder(properties, res, authContext);
    } else if (query.cmisaction === "deleteObject") {
      return deleteObject(query.objectId, res, authContext);
    }
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "Not Found" }));
});

function getRepositoryInfo(res: any) {
  const repoInfo = {
    repositoryId: REPOSITORY_ID,
    repositoryName: REPOSITORY_NAME,
    repositoryDescription: "Antbox ECM Repository",
    vendorName: "Kindalus",
    productName: "Antbox",
    productVersion: "1.0",
    rootFolderId: Folders.ROOT_FOLDER_UUID,
    capabilities: {
      capabilityACL: "none",
      capabilityChanges: "none",
      capabilityContentStreamUpdatability: "anytime",
      capabilityJoin: "none",
      capabilityMultiFiling: false,
      capabilityQuery: "none",
      capabilityRenditions: "none",
      capabilityUnFiling: false,
      capabilityVersionSpecificFiling: false,
    },
    // Add more CMIS capabilities as needed
  };
  res.statusCode = 200;
  res.end(JSON.stringify(repoInfo));
}

function getRepositories(res: any) {
  const repositories = [
    {
      repositoryId: REPOSITORY_ID,
      repositoryName: REPOSITORY_NAME,
      repositoryDescription: "Antbox ECM Repository",
    },
  ];
  res.statusCode = 200;
  res.end(JSON.stringify(repositories));
}

async function getChildren(
  objectId: string,
  succinct: string,
  res: any,
  authContext: AuthenticationContext,
) {
  const parentUuid = objectId || Folders.ROOT_FOLDER_UUID;
  const childrenOrErr = await nodeService.list(authContext, parentUuid);

  if (childrenOrErr.isLeft()) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: childrenOrErr.value.message }));
    return;
  }

  const children = childrenOrErr.value.map((node) => toCmisObject(node as unknown as NodeLike, succinct === "true"));

  res.statusCode = 200;
  res.end(JSON.stringify({ objects: children }));
}

async function getObject(
  objectId: string,
  succinct: string,
  res: any,
  authContext: AuthenticationContext,
) {
  const nodeOrErr = await nodeService.get(authContext, objectId);

  if (nodeOrErr.isLeft()) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: nodeOrErr.value.message }));
    return;
  }

  const cmisObject = toCmisObject(nodeOrErr.value as unknown as NodeLike, succinct === "true");

  res.statusCode = 200;
  res.end(JSON.stringify(cmisObject));
}

async function getContentStream(
  objectId: string,
  res: any,
  authContext: AuthenticationContext,
) {
  const fileOrErr = await nodeService.export(authContext, objectId);

  if (fileOrErr.isLeft()) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: fileOrErr.value.message }));
    return;
  }

  const file = fileOrErr.value;

  res.setHeader("Content-Type", file.type);
  res.setHeader("Content-Disposition", `attachment; filename="${file.name}"`);
  res.statusCode = 200;
  res.end(await file.arrayBuffer());
}

async function createDocument(
  properties: Record<string, unknown>,
  content: File,
  res: any,
  authContext: AuthenticationContext,
) {
  const parentId = properties["cmis:parentId"] as string || Folders.ROOT_FOLDER_UUID;
  const title = properties["cmis:name"] as string || content.name;
  const mimetype = properties["cmis:contentStreamMimeType"] as string || content.type;

  const metadata: Partial<NodeMetadata> = {
    title,
    mimetype,
    parent: parentId,
    owner: authContext.principal.email,
  };

  const nodeOrErr = await nodeService.createFile(authContext, content, metadata);

  if (nodeOrErr.isLeft()) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: nodeOrErr.value.message }));
    return;
  }

  res.statusCode = 201;
  res.end(JSON.stringify(toCmisObject(nodeOrErr.value as unknown as NodeLike, false)));
}

async function createFolder(
  properties: Record<string, unknown>,
  res: any,
  authContext: AuthenticationContext,
) {
  const parentId = properties["cmis:parentId"] as string || Folders.ROOT_FOLDER_UUID;
  const title = properties["cmis:name"] as string;

  if (!title) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "cmis:name property is required" }));
    return;
  }

  const metadata: Partial<NodeMetadata> = {
    title,
    mimetype: Nodes.FOLDER_MIMETYPE,
    parent: parentId,
    owner: authContext.principal.email,
  };

  const nodeOrErr = await nodeService.create(authContext, metadata);

  if (nodeOrErr.isLeft()) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: nodeOrErr.value.message }));
    return;
  }

  res.statusCode = 201;
  res.end(JSON.stringify(toCmisObject(nodeOrErr.value as unknown as NodeLike, false)));
}

async function deleteObject(
  objectId: string,
  res: any,
  authContext: AuthenticationContext,
) {
  const voidOrErr = await nodeService.delete(authContext, objectId);

  if (voidOrErr.isLeft()) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: voidOrErr.value.message }));
    return;
  }

  res.statusCode = 204;
  res.end();
}

function toCmisObject(node: NodeLike, succinct: boolean) {
  const baseProperties = {
    "cmis:objectId": node.uuid,
    "cmis:baseTypeId": node.mimetype === Nodes.FOLDER_MIMETYPE ? "cmis:folder" : "cmis:document",
    "cmis:objectTypeId": node.mimetype === Nodes.FOLDER_MIMETYPE ? "cmis:folder" : "cmis:document",
    "cmis:name": node.title,
    "cmis:createdBy": node.owner,
    "cmis:creationDate": node.createdTime,
    "cmis:lastModifiedBy": node.owner, // Assuming owner is last modifier for now
    "cmis:lastModificationDate": node.modifiedTime,
    "cmis:changeToken": null,
    "cmis:parentId": node.parent === Folders.ROOT_FOLDER_UUID ? null : node.parent,
    "cmis:path": "/" + node.title, // Simplified path for now
  };

  let specificProperties: Record<string, unknown> = {};

  if (node.mimetype === Nodes.FOLDER_MIMETYPE) {
    specificProperties = {
      "cmis:allowedChildObjectTypeId": "cmis:document,cmis:folder",
    };
  } else {
    specificProperties = {
      "cmis:isLatestMajorVersion": true,
      "cmis:isLatestVersion": true,
      "cmis:isMajorVersion": true,
      "cmis:isImmutable": false,
      "cmis:versionLabel": "1.0",
      "cmis:contentStreamLength": (node as any).size || 0,
      "cmis:contentStreamMimeType": node.mimetype,
      "cmis:contentStreamFileName": node.title,
      "cmis:contentStreamId": node.uuid,
    };
  }

  const properties = { ...baseProperties, ...specificProperties };

  if (succinct) {
    return {
      objectId: node.uuid,
      baseTypeId: node.mimetype === Nodes.FOLDER_MIMETYPE ? "cmis:folder" : "cmis:document",
      name: node.title,
      // Add other succinct properties as needed
    };
  } else {
    return {
      object: {
        properties: Object.entries(properties).map(([id, value]) => ({
          id,
          value,
        })),
      },
    };
  }
}

// Helper to read form data for POST requests
async function readFormData(req: Request): Promise<FormData> {
  try {
    return await req.formData();
  } catch (error) {
    console.error("Error reading form data:", error);
    return new FormData();
  }
}

router.add("/cmis/json/**", cmisHandler);
router.add("/cmis/json", cmisHandler);

app.use(router);

console.log("Starting CMIS server on port 2021");
serve(toNodeListener(app), { port: 2021 });
