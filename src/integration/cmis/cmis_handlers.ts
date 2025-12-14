import type { AntboxTenant } from "api/antbox_tenant.ts";
import { getAuthenticationContext } from "api/get_authentication_context.ts";
import { getParams } from "api/get_params.ts";
import { type HttpHandler } from "api/handler.ts";
import { cmisMiddlewareChain } from "./cmis_middleware.ts";
import type { AuthenticationContext } from "application/authentication_context.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import type { NodeLike } from "domain/node_like.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { processError } from "api/process_error.ts";

type JsonBody = Record<string, unknown> | unknown[];

function jsonResponse(body: JsonBody, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function getTenantByRepoId(
	repoId: string | undefined,
	tenants: AntboxTenant[],
): AntboxTenant | undefined {
	if (!repoId) return;
	return tenants.find((t) => t.name === repoId);
}

function repoInfo(repoId: string, tenant: AntboxTenant) {
	return {
		repositoryId: repoId,
		repositoryName: `${tenant.name} Repository`,
		repositoryDescription: "Antbox ECM Repository",
		vendorName: "Antbox",
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
	};
}

export function repositoriesHandler(tenants: AntboxTenant[]): HttpHandler {
	return cmisMiddlewareChain(tenants, async (_req: Request) => {
		const repositories = tenants.map((tenant) => ({
			repositoryId: tenant.name,
			repositoryName: `${tenant.name} Repository`,
			repositoryDescription: "Antbox ECM Repository",
		}));

		return jsonResponse(repositories);
	});
}

export function repositoryHandler(tenants: AntboxTenant[]): HttpHandler {
	return cmisMiddlewareChain(tenants, async (req: Request) => {
		const params = getParams(req);
		const repoId = params.repoId;
		const tenant = getTenantByRepoId(repoId, tenants);

		if (!tenant) {
			return jsonResponse({ error: "Repository not found" }, 404);
		}

		const authContext = getAuthenticationContext(req);
		const url = new URL(req.url);
		const action = url.searchParams.get("cmisaction");

		switch (action) {
			case "getRepositoryInfo":
				return jsonResponse(repoInfo(repoId, tenant));
			case "getFolderParent":
				return handleGetFolderParent(req, tenant, authContext);
			case "getDescendants":
				return handleGetDescendants(req, tenant, authContext);
			case "getFolderTree":
				return handleGetFolderTree(req, tenant, authContext);
			case "getChildren":
				return handleGetChildren(req, tenant, authContext);
			case "getObject":
				return handleGetObject(req, tenant, authContext);
			case "getContentStream":
				return handleGetContentStream(req, tenant, authContext);
			case "query":
				return handleQuery(req, tenant, authContext);
			case "createDocument":
				return handleCreateDocument(req, tenant, authContext);
			case "createFolder":
				return handleCreateFolder(req, tenant, authContext);
			case "deleteObject":
				return handleDeleteObject(req, tenant, authContext);
			case "deleteTree":
				return handleDeleteTree(req, tenant, authContext);
			case "moveObject":
				return handleMoveObject(req, tenant, authContext);
			case "copyObject":
				return handleCopyObject(req, tenant, authContext);
			case "updateProperties":
				return handleUpdateProperties(req, tenant, authContext);
			case "checkOut":
				return handleCheckOut(req, tenant, authContext);
			case "checkIn":
				return handleCheckIn(req, tenant, authContext);
			case "getACL":
				return handleGetACL(req, tenant, authContext);
			case "applyACL":
				return handleApplyACL(req, tenant, authContext);
			case "getRepositories":
				// Some clients call getRepositories against the repo endpoint
				return repositoriesHandler(tenants)(req);
			default:
				return jsonResponse({ error: "Unsupported cmisaction" }, 400);
		}
	});
}

async function handleGetChildren(
	req: Request,
	tenant: AntboxTenant,
	authContext: AuthenticationContext,
) {
	const url = new URL(req.url);
	const objectId = url.searchParams.get("objectId") || Folders.ROOT_FOLDER_UUID;
	const succinct = url.searchParams.get("succinct") === "true";

	const childrenOrErr = await tenant.nodeService.list(authContext, objectId);
	if (childrenOrErr.isLeft()) {
		return processError(childrenOrErr.value);
	}

	const children = childrenOrErr.value.map((node) =>
		toCmisObject(node as unknown as NodeLike, succinct)
	);
	return jsonResponse({ objects: children });
}

async function handleGetDescendants(
	req: Request,
	tenant: AntboxTenant,
	authContext: AuthenticationContext,
) {
	const url = new URL(req.url);
	const objectId = url.searchParams.get("objectId") || Folders.ROOT_FOLDER_UUID;
	const depthParam = url.searchParams.get("depth");
	const depth = depthParam ? Number(depthParam) : -1; // -1 for all
	const succinct = url.searchParams.get("succinct") === "true";

	const collected: NodeMetadata[] = [];
	const walk = async (parentId: string, currentDepth: number) => {
		if (depth !== -1 && currentDepth > depth) return;
		const childrenOrErr = await tenant.nodeService.list(authContext, parentId);
		if (childrenOrErr.isLeft()) {
			throw childrenOrErr.value;
		}
		for (const child of childrenOrErr.value) {
			collected.push(child);
			if (Nodes.isFolder(child as unknown as NodeLike)) {
				await walk(child.uuid!, currentDepth + 1);
			}
		}
	};

	try {
		await walk(objectId, 1);
		const objects = collected.map((node) => toCmisObject(node as unknown as NodeLike, succinct));
		return jsonResponse({ objects });
	} catch (err) {
		return processError(err);
	}
}

async function handleGetFolderTree(
	req: Request,
	tenant: AntboxTenant,
	authContext: AuthenticationContext,
) {
	const url = new URL(req.url);
	const objectId = url.searchParams.get("objectId") || Folders.ROOT_FOLDER_UUID;
	const depthParam = url.searchParams.get("depth");
	const depth = depthParam ? Number(depthParam) : -1;
	const succinct = url.searchParams.get("succinct") === "true";

	const buildTree = async (
		folderId: string,
		currentDepth: number,
	): Promise<Record<string, unknown>> => {
		const nodeOrErr = await tenant.nodeService.get(authContext, folderId);
		if (nodeOrErr.isLeft()) {
			throw nodeOrErr.value;
		}
		const node = nodeOrErr.value;
		const entry: Record<string, unknown> = {
			object: toCmisObject(node as unknown as NodeLike, succinct),
		};

		if (depth !== -1 && currentDepth >= depth) {
			return entry;
		}

		const childrenOrErr = await tenant.nodeService.list(authContext, folderId);
		if (childrenOrErr.isLeft()) {
			throw childrenOrErr.value;
		}
		const folderChildren = childrenOrErr.value.filter((n) => Nodes.isFolder(n));
		if (folderChildren.length) {
			entry.children = await Promise.all(
				folderChildren.map((child) => buildTree(child.uuid, currentDepth + 1)),
			);
		}
		return entry;
	};

	try {
		const tree = await buildTree(objectId, 1);
		return jsonResponse({ objects: [tree] });
	} catch (err) {
		return processError(err);
	}
}

async function handleGetFolderParent(
	req: Request,
	tenant: AntboxTenant,
	authContext: AuthenticationContext,
) {
	const url = new URL(req.url);
	const objectId = url.searchParams.get("objectId");
	const succinct = url.searchParams.get("succinct") === "true";

	if (!objectId) {
		return jsonResponse({ error: "objectId is required" }, 400);
	}

	const nodeOrErr = await tenant.nodeService.get(authContext, objectId);
	if (nodeOrErr.isLeft()) {
		return processError(nodeOrErr.value);
	}

	const parentId = nodeOrErr.value.parent;
	if (!parentId) {
		return jsonResponse({ object: null });
	}

	const parentOrErr = await tenant.nodeService.get(authContext, parentId);
	if (parentOrErr.isLeft()) {
		return processError(parentOrErr.value);
	}

	return jsonResponse({
		object: toCmisObject(parentOrErr.value as unknown as NodeLike, succinct),
	});
}

async function handleGetObject(
	req: Request,
	tenant: AntboxTenant,
	authContext: AuthenticationContext,
) {
	const url = new URL(req.url);
	const objectId = url.searchParams.get("objectId");
	const succinct = url.searchParams.get("succinct") === "true";

	if (!objectId) {
		return jsonResponse({ error: "objectId is required" }, 400);
	}

	const nodeOrErr = await tenant.nodeService.get(authContext, objectId);
	if (nodeOrErr.isLeft()) {
		return processError(nodeOrErr.value);
	}

	return jsonResponse(toCmisObject(nodeOrErr.value as unknown as NodeLike, succinct));
}

async function handleQuery(
	req: Request,
	tenant: AntboxTenant,
	authContext: AuthenticationContext,
) {
	const url = new URL(req.url);
	const q = url.searchParams.get("statement") ?? url.searchParams.get("q");
	const pageSize = Number(url.searchParams.get("maxItems") ?? "50");
	const page = Number(url.searchParams.get("skipCount") ?? "0") + 1;

	if (!q) {
		return jsonResponse({ error: "statement is required" }, 400);
	}

	const resultOrErr = await tenant.nodeService.find(authContext, q, pageSize, page);
	if (resultOrErr.isLeft()) {
		return processError(resultOrErr.value);
	}

	const nodes = resultOrErr.value.nodes.map((node) =>
		toCmisObject(node as unknown as NodeLike, false)
	);
	return jsonResponse({
		numItems: resultOrErr.value.total,
		hasMoreItems: resultOrErr.value.hasMore,
		objects: nodes,
	});
}

async function handleGetContentStream(
	req: Request,
	tenant: AntboxTenant,
	authContext: AuthenticationContext,
) {
	const url = new URL(req.url);
	const objectId = url.searchParams.get("objectId");
	if (!objectId) {
		return jsonResponse({ error: "objectId is required" }, 400);
	}

	const fileOrErr = await tenant.nodeService.export(authContext, objectId);
	if (fileOrErr.isLeft()) {
		return processError(fileOrErr.value);
	}

	const file = fileOrErr.value;

	return new Response(await file.arrayBuffer(), {
		status: 200,
		headers: {
			"Content-Type": file.type,
			"Content-Disposition": `attachment; filename="${file.name}"`,
		},
	});
}

async function handleCreateDocument(
	req: Request,
	tenant: AntboxTenant,
	authContext: AuthenticationContext,
) {
	const formData = await readFormData(req);
	const propertiesRaw = formData.get("properties");
	const content = formData.get("content") as File | null;

	if (!propertiesRaw || !content) {
		return jsonResponse({ error: "properties and content are required" }, 400);
	}

	const properties = JSON.parse(propertiesRaw as string) as Record<string, unknown>;

	const parentId = (properties["cmis:parentId"] as string) ?? Folders.ROOT_FOLDER_UUID;
	const title = (properties["cmis:name"] as string) ?? content.name;
	const mimetype = (properties["cmis:contentStreamMimeType"] as string) ?? content.type;

	const metadata: NodeMetadata = {
		title,
		mimetype,
		parent: parentId,
		owner: authContext.principal.email,
	};

	const nodeOrErr = await tenant.nodeService.createFile(authContext, content, metadata);
	if (nodeOrErr.isLeft()) {
		return processError(nodeOrErr.value);
	}

	return jsonResponse(toCmisObject(nodeOrErr.value as unknown as NodeLike, false), 201);
}

async function handleUpdateProperties(
	req: Request,
	tenant: AntboxTenant,
	authContext: AuthenticationContext,
) {
	const formData = await readFormData(req);
	const propertiesRaw = formData.get("properties");

	if (!propertiesRaw) {
		return jsonResponse({ error: "properties are required" }, 400);
	}

	const properties = JSON.parse(propertiesRaw as string) as Record<string, unknown>;
	const objectId = properties["cmis:objectId"] as string;
	if (!objectId) {
		return jsonResponse({ error: "cmis:objectId is required" }, 400);
	}

	const metadata: Partial<NodeMetadata> = {};
	if (properties["cmis:name"]) metadata.title = properties["cmis:name"] as string;

	const updateOrErr = await tenant.nodeService.update(authContext, objectId, metadata);
	if (updateOrErr.isLeft()) {
		return processError(updateOrErr.value);
	}

	const nodeOrErr = await tenant.nodeService.get(authContext, objectId);
	if (nodeOrErr.isLeft()) {
		return processError(nodeOrErr.value);
	}

	return jsonResponse(toCmisObject(nodeOrErr.value as unknown as NodeLike, false));
}

async function handleCreateFolder(
	req: Request,
	tenant: AntboxTenant,
	authContext: AuthenticationContext,
) {
	const formData = await readFormData(req);
	const propertiesRaw = formData.get("properties");

	if (!propertiesRaw) {
		return jsonResponse({ error: "properties are required" }, 400);
	}

	const properties = JSON.parse(propertiesRaw as string) as Record<string, unknown>;

	const parentId = (properties["cmis:parentId"] as string) ?? Folders.ROOT_FOLDER_UUID;
	const title = properties["cmis:name"] as string;

	if (!title) {
		return jsonResponse({ error: "cmis:name property is required" }, 400);
	}

	const metadata: NodeMetadata = {
		title,
		mimetype: Nodes.FOLDER_MIMETYPE,
		parent: parentId,
		owner: authContext.principal.email,
	};

	const nodeOrErr = await tenant.nodeService.create(authContext, metadata);
	if (nodeOrErr.isLeft()) {
		return processError(nodeOrErr.value);
	}

	return jsonResponse(toCmisObject(nodeOrErr.value as unknown as NodeLike, false), 201);
}

async function handleMoveObject(
	req: Request,
	tenant: AntboxTenant,
	authContext: AuthenticationContext,
) {
	const formData = await readFormData(req);
	const objectId = (formData.get("objectId") as string) ?? undefined;
	const targetFolderId = (formData.get("targetFolderId") as string) ?? undefined;
	const newName = (formData.get("cmis:name") as string) ?? undefined;

	if (!objectId || !targetFolderId) {
		return jsonResponse({ error: "objectId and targetFolderId are required" }, 400);
	}

	const update: NodeMetadata = { parent: targetFolderId };
	if (newName) update.title = newName;

	const moveOrErr = await tenant.nodeService.update(authContext, objectId, update);
	if (moveOrErr.isLeft()) {
		return processError(moveOrErr.value);
	}

	const nodeOrErr = await tenant.nodeService.get(authContext, objectId);
	if (nodeOrErr.isLeft()) {
		return processError(nodeOrErr.value);
	}

	return jsonResponse(toCmisObject(nodeOrErr.value as unknown as NodeLike, false));
}

async function handleCopyObject(
	req: Request,
	tenant: AntboxTenant,
	authContext: AuthenticationContext,
) {
	const formData = await readFormData(req);
	const objectId = (formData.get("objectId") as string) ?? undefined;
	const targetFolderId = (formData.get("targetFolderId") as string) ?? undefined;
	const newName = (formData.get("cmis:name") as string) ?? undefined;

	if (!objectId || !targetFolderId) {
		return jsonResponse({ error: "objectId and targetFolderId are required" }, 400);
	}

	const copyOrErr = await tenant.nodeService.copy(authContext, objectId, targetFolderId);
	if (copyOrErr.isLeft()) {
		return processError(copyOrErr.value);
	}

	if (newName) {
		const updateOrErr = await tenant.nodeService.update(authContext, copyOrErr.value.uuid, {
			title: newName,
		});
		if (updateOrErr.isLeft()) {
			return processError(updateOrErr.value);
		}
	}

	return jsonResponse(toCmisObject(copyOrErr.value as unknown as NodeLike, false), 201);
}

async function handleDeleteObject(
	req: Request,
	tenant: AntboxTenant,
	authContext: AuthenticationContext,
) {
	const url = new URL(req.url);
	const objectId = url.searchParams.get("objectId");

	if (!objectId) {
		return jsonResponse({ error: "objectId is required" }, 400);
	}

	const deleteOrErr = await tenant.nodeService.delete(authContext, objectId);
	if (deleteOrErr.isLeft()) {
		return processError(deleteOrErr.value);
	}

	return new Response(null, { status: 204 });
}

async function handleDeleteTree(
	req: Request,
	tenant: AntboxTenant,
	authContext: AuthenticationContext,
) {
	const url = new URL(req.url);
	const objectId = url.searchParams.get("objectId");

	if (!objectId) {
		return jsonResponse({ error: "objectId is required" }, 400);
	}

	const deleteRec = async (uuid: string): Promise<void> => {
		const childrenOrErr = await tenant.nodeService.list(authContext, uuid);
		if (childrenOrErr.isRight()) {
			for (const child of childrenOrErr.value) {
				await deleteRec(child.uuid);
			}
		}
		await tenant.nodeService.delete(authContext, uuid);
	};

	try {
		await deleteRec(objectId);
		return new Response(null, { status: 204 });
	} catch (err) {
		return processError(err);
	}
}

async function handleCheckOut(
	req: Request,
	tenant: AntboxTenant,
	authContext: AuthenticationContext,
) {
	const url = new URL(req.url);
	const objectId = url.searchParams.get("objectId");
	if (!objectId) {
		return jsonResponse({ error: "objectId is required" }, 400);
	}

	const lockOrErr = await tenant.nodeService.lock(authContext, objectId);
	if (lockOrErr.isLeft()) {
		return processError(lockOrErr.value);
	}

	const nodeOrErr = await tenant.nodeService.get(authContext, objectId);
	if (nodeOrErr.isLeft()) {
		return processError(nodeOrErr.value);
	}

	return jsonResponse({
		objectId,
		object: toCmisObject(nodeOrErr.value as unknown as NodeLike, false),
	});
}

async function handleCheckIn(
	req: Request,
	tenant: AntboxTenant,
	authContext: AuthenticationContext,
) {
	const formData = await readFormData(req);
	const objectId = (formData.get("objectId") as string) ?? undefined;
	const propertiesRaw = formData.get("properties");

	if (!objectId) {
		return jsonResponse({ error: "objectId is required" }, 400);
	}

	// Optional property update on check-in
	if (propertiesRaw) {
		const properties = JSON.parse(propertiesRaw as string) as Record<string, unknown>;
		const metadata: Partial<NodeMetadata> = {};
		if (properties["cmis:name"]) metadata.title = properties["cmis:name"] as string;
		if (Object.keys(metadata).length) {
			const updateOrErr = await tenant.nodeService.update(authContext, objectId, metadata);
			if (updateOrErr.isLeft()) {
				return processError(updateOrErr.value);
			}
		}
	}

	const unlockOrErr = await tenant.nodeService.unlock(authContext, objectId);
	if (unlockOrErr.isLeft()) {
		return processError(unlockOrErr.value);
	}

	const nodeOrErr = await tenant.nodeService.get(authContext, objectId);
	if (nodeOrErr.isLeft()) {
		return processError(nodeOrErr.value);
	}

	return jsonResponse(toCmisObject(nodeOrErr.value as unknown as NodeLike, false));
}

type CmisPermission = "cmis:read" | "cmis:write" | "cmis:all";
type Permission = "Read" | "Write" | "Export";

type CmisAce = {
	principalId: string;
	permissions: CmisPermission[];
	isDirect: boolean;
};

function permissionToCmis(p: Permission): CmisPermission {
	switch (p) {
		case "Read":
			return "cmis:read";
		case "Write":
			return "cmis:write";
		case "Export":
			return "cmis:read"; // map Export to read-level in CMIS
	}
}

function cmisToPermission(p: CmisPermission): Permission[] {
	if (p === "cmis:all") return ["Read", "Write", "Export"];
	if (p === "cmis:write") return ["Write"];
	return ["Read"];
}

async function handleGetACL(
	req: Request,
	tenant: AntboxTenant,
	authContext: AuthenticationContext,
) {
	const url = new URL(req.url);
	const objectId = url.searchParams.get("objectId");
	if (!objectId) {
		return jsonResponse({ error: "objectId is required" }, 400);
	}

	const nodeOrErr = await tenant.nodeService.get(authContext, objectId);
	if (nodeOrErr.isLeft()) {
		return processError(nodeOrErr.value);
	}

	const node = nodeOrErr.value as NodeLike & {
		permissions?: {
			group?: Permission[];
			authenticated?: Permission[];
			anonymous?: Permission[];
			advanced?: Record<string, Permission[]>;
		};
		group?: string;
	};

	const aces: CmisAce[] = [];

	// Owner as full access
	aces.push({
		principalId: node.owner,
		permissions: ["cmis:all"],
		isDirect: true,
	});

	const perms = node.permissions ?? {};
	const groupId = (node as any).group as string | undefined;

	if (groupId && perms.group?.length) {
		aces.push({
			principalId: groupId,
			permissions: perms.group.map(permissionToCmis),
			isDirect: true,
		});
	}

	if (perms.authenticated?.length) {
		aces.push({
			principalId: "authenticated",
			permissions: perms.authenticated.map(permissionToCmis),
			isDirect: true,
		});
	}

	if (perms.anonymous?.length) {
		aces.push({
			principalId: "anonymous",
			permissions: perms.anonymous.map(permissionToCmis),
			isDirect: true,
		});
	}

	if (perms.advanced) {
		for (const [principalId, p] of Object.entries(perms.advanced)) {
			aces.push({
				principalId,
				permissions: p.map(permissionToCmis),
				isDirect: true,
			});
		}
	}

	return jsonResponse({
		ACL: {
			aces,
			isExact: true,
		},
	});
}

async function handleApplyACL(
	req: Request,
	tenant: AntboxTenant,
	authContext: AuthenticationContext,
) {
	const formData = await readFormData(req);
	const aclRaw = formData.get("ACL") ?? formData.get("acl");

	if (!aclRaw) {
		return jsonResponse({ error: "ACL is required" }, 400);
	}

	let acl: { aces?: CmisAce[] };
	try {
		acl = JSON.parse(aclRaw as string);
	} catch (_e) {
		return jsonResponse({ error: "ACL must be JSON" }, 400);
	}

	const objectId = formData.get("objectId") as string;
	if (!objectId) {
		return jsonResponse({ error: "objectId is required" }, 400);
	}

	const nodeOrErr = await tenant.nodeService.get(authContext, objectId);
	if (nodeOrErr.isLeft()) {
		return processError(nodeOrErr.value);
	}

	const perms = {
		group: [] as Permission[],
		authenticated: [] as Permission[],
		anonymous: [] as Permission[],
		advanced: {} as Record<string, Permission[]>,
	};

	const node = nodeOrErr.value as NodeLike & { group?: string };
	const groupId = (node as any).group as string | undefined;

	for (const ace of acl.aces ?? []) {
		const permsMapped = ace.permissions.flatMap(cmisToPermission);
		if (ace.principalId === "anonymous") {
			perms.anonymous = Array.from(new Set([...perms.anonymous, ...permsMapped]));
		} else if (ace.principalId === "authenticated") {
			perms.authenticated = Array.from(new Set([...perms.authenticated, ...permsMapped]));
		} else if (groupId && ace.principalId === groupId) {
			perms.group = Array.from(new Set([...perms.group, ...permsMapped]));
		} else {
			perms.advanced[ace.principalId] = Array.from(
				new Set([...(perms.advanced[ace.principalId] ?? []), ...permsMapped]),
			);
		}
	}

	const updateOrErr = await tenant.nodeService.update(authContext, objectId, {
		permissions: perms,
	});
	if (updateOrErr.isLeft()) {
		return processError(updateOrErr.value);
	}

	return jsonResponse({ ACL: { aces: acl.aces ?? [], isExact: true } });
}

function toCmisObject(node: NodeLike, succinct: boolean) {
	const baseProperties = {
		"cmis:objectId": node.uuid,
		"cmis:baseTypeId": node.mimetype === Nodes.FOLDER_MIMETYPE ? "cmis:folder" : "cmis:document",
		"cmis:objectTypeId": node.mimetype === Nodes.FOLDER_MIMETYPE
			? "cmis:folder"
			: "cmis:document",
		"cmis:name": node.title,
		"cmis:createdBy": node.owner,
		"cmis:creationDate": node.createdTime,
		"cmis:lastModifiedBy": node.owner,
		"cmis:lastModificationDate": node.modifiedTime,
		"cmis:changeToken": null,
		"cmis:parentId": node.parent === Folders.ROOT_FOLDER_UUID ? null : node.parent,
		"cmis:path": `/${node.title}`, // simplified path
	};

	const specificProperties = node.mimetype === Nodes.FOLDER_MIMETYPE
		? { "cmis:allowedChildObjectTypeId": "cmis:document,cmis:folder" }
		: {
			"cmis:isLatestMajorVersion": true,
			"cmis:isLatestVersion": true,
			"cmis:isMajorVersion": true,
			"cmis:isImmutable": false,
			"cmis:versionLabel": "1.0",
			"cmis:contentStreamLength": (node as unknown as { size?: number }).size ?? 0,
			"cmis:contentStreamMimeType": node.mimetype,
			"cmis:contentStreamFileName": node.title,
			"cmis:contentStreamId": node.uuid,
		};

	const properties = { ...baseProperties, ...specificProperties };

	if (succinct) {
		return {
			objectId: node.uuid,
			baseTypeId: node.mimetype === Nodes.FOLDER_MIMETYPE ? "cmis:folder" : "cmis:document",
			name: node.title,
		};
	}

	return {
		object: {
			properties: Object.entries(properties).map(([id, value]) => ({
				id,
				value,
			})),
		},
	};
}

async function readFormData(req: Request): Promise<FormData> {
	try {
		return await req.formData();
	} catch (error) {
		console.error("Error reading form data:", error);
		return new FormData();
	}
}
