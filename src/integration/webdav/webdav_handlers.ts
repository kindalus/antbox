import { type AntboxTenant } from "api/antbox_tenant.ts";
import { webdavMiddlewareChain } from "./webdav_middleware.ts";
import { getAuthenticationContext } from "api/get_authentication_context.ts";
import { getTenant } from "api/get_tenant.ts";
import { type HttpHandler, sendCreated, sendNoContent, sendOK } from "api/handler.ts";

import { createPropfindResponse } from "./webdav_xml.ts";
import { getMimetype, resolvePath, unescapePath } from "./webdav_utils.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { createETagHeader } from "./webdav_etag.ts";
import { processError } from "api/process_error.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";

function getPath(req: Request | string, tenant: AntboxTenant): string {
	const path = new URL(typeof req === "string" ? req : req.url).pathname.replace(
		`/webdav/${tenant.name}`,
		"",
	) || "/";
	return path;
}

export function optionsHandler(tenants: AntboxTenant[]): HttpHandler {
	return webdavMiddlewareChain(tenants, (req: Request) => {
		const origin = req.headers.get("origin");

		const headers: Record<string, string> = {
			// WebDAV Headers
			"MS-Author-Via": "DAV",
			Allow: "OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, MKCOL, COPY, MOVE, LOCK, UNLOCK",
			DAV: "1, 2",

			// CORS Headers
			"Access-Control-Allow-Methods":
				"OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, MKCOL, COPY, MOVE, LOCK, UNLOCK",
			"Access-Control-Allow-Headers":
				"Authorization, Content-Type, Depth, Destination, If, If-Modified-Since, If-None-Match, If-Match, Lock-Token, Overwrite, Timeout, User-Agent, X-File-Name, X-Requested-With",
			"Access-Control-Max-Age": "86400",
			"Access-Control-Allow-Credentials": "true",
		};

		if (origin) {
			// Cross-origin request - use specific origin and allow credentials
			headers["Access-Control-Allow-Origin"] = origin;
		}

		console.log(headers);

		return Promise.resolve(
			new Response(null, {
				status: 200,
				headers,
			}),
		);
	});
}

export function propfindHandler(tenants: AntboxTenant[]): HttpHandler {
	return webdavMiddlewareChain(tenants, async (req: Request) => {
		const tenant = getTenant(req, tenants);
		const authContext = getAuthenticationContext(req);
		const path = getPath(req, tenant);

		const nodeOrErr = await resolvePath(tenant.nodeService, authContext, path, tenant.name);
		if (nodeOrErr.isLeft()) {
			return processError(nodeOrErr.value);
		}

		const node = nodeOrErr.value;
		const depth = req.headers.get("Depth") ?? "1";

		const nodes: NodeMetadata[] = [node];

		if (Nodes.isFolderLike(node) && depth === "1") {
			const childrenOrErr = await tenant.nodeService.list(
				authContext,
				node.uuid,
			);

			if (childrenOrErr.isLeft()) {
				return processError(childrenOrErr.value);
			}

			nodes.splice(1, 0, ...childrenOrErr.value);
		}

		const xml = createPropfindResponse(nodes, req);
		const headers = {
			"Content-Type": "application/xml; charset=utf-8",
			"Cache-Control": "no-cache, no-store, must-revalidate",
			"Pragma": "no-cache",
			"Expires": "0",
			"ETag": createETagHeader(node),
			"Content-Length": xml.length.toString(),
		};

		return new Response(xml, { status: 207, headers });
	});
}

export function getHandler(tenants: AntboxTenant[]): HttpHandler {
	return webdavMiddlewareChain(tenants, async (req: Request) => {
		const tenant = getTenant(req, tenants);
		const authContext = getAuthenticationContext(req);
		const path = getPath(req, tenant);

		const nodeOrErr = await resolvePath(tenant.nodeService, authContext, path, tenant.name);

		if (nodeOrErr.isLeft()) {
			return processError(nodeOrErr.value);
		}

		const node = nodeOrErr.value;

		if (Nodes.isFolder(node) || Nodes.isSmartFolder(node)) {
			const childrenOrErr = await tenant.nodeService.list(authContext, node.uuid);
			if (childrenOrErr.isLeft()) {
				return processError(childrenOrErr.value);
			}
			const xml = createPropfindResponse(childrenOrErr.value, req);

			return new Response(xml, {
				status: 207,
				headers: {
					"Content-Type": "application/xml; charset=utf-8",
					"Cache-Control": "no-cache, no-store, must-revalidate",
					"Pragma": "no-cache",
					"Expires": "0",
					"ETag": createETagHeader(node),
					"Content-Length": xml.length.toString(),
				},
			});
		}

		if (!Nodes.isFileLike(node)) {
			return new Response("Not a file", { status: 400 });
		}

		const fileOrErr = await tenant.nodeService.export(authContext, node.uuid);
		if (fileOrErr.isLeft()) {
			return processError(fileOrErr.value);
		}

		const file = fileOrErr.value;
		return new Response(file.stream(), {
			headers: {
				"Content-Type": file.type,
				"Content-Length": file.size.toString(),
				"Cache-Control": "no-cache, no-store, must-revalidate",
				"Pragma": "no-cache",
				"Expires": "0",
				"ETag": createETagHeader(node),
			},
		});
	});
}

export function putHandler(tenants: AntboxTenant[]): HttpHandler {
	return webdavMiddlewareChain(tenants, async (req: Request) => {
		const tenant = getTenant(req, tenants);
		const authContext = getAuthenticationContext(req);
		const path = getPath(req, tenant);
		const parentPath = path.substring(0, path.lastIndexOf("/"));
		const title = path.substring(path.lastIndexOf("/") + 1);

		if (title.startsWith("._")) {
			return new Response("Invalid file name", { status: 400 });
		}

		const mimetype = getMimetype(title);

		if (!req.body) {
			return new Response("Missing file content", { status: 400 });
		}

		const parentOrErr = await resolvePath(
			tenant.nodeService,
			authContext,
			parentPath,
			tenant.name,
		);
		if (parentOrErr.isLeft()) {
			return processError(parentOrErr.value);
		}

		const parent = parentOrErr.value;
		if (parent.mimetype !== Nodes.FOLDER_MIMETYPE) {
			return new Response("Parent is not a folder", { status: 400 });
		}

		const blob = await req.blob();
		const file = new File([blob], title, { type: mimetype });

		const existingNodeOrErr = await resolvePath(
			tenant.nodeService,
			authContext,
			path,
			tenant.name,
		);

		if (existingNodeOrErr.isLeft()) {
			if (existingNodeOrErr.value.errorCode === NodeNotFoundError.ERROR_CODE) {
				const result = await tenant.nodeService.createFile(
					authContext,
					file,
					{
						parent: parent.uuid,
						mimetype,
						title: unescapePath(title),
					},
				);
				return result.isRight() ? sendCreated() : processError(result.value);
			}
			return processError(existingNodeOrErr.value);
		}

		// Check if node is locked before updating
		const existingNode = existingNodeOrErr.value;
		if (existingNode.locked && existingNode.lockedBy !== authContext.principal.email) {
			return new Response(
				`Resource is locked by ${existingNode.lockedBy}`,
				{ status: 423 }, // 423 Locked
			);
		}

		const result = await tenant.nodeService.updateFile(
			authContext,
			existingNode.uuid,
			file as File,
		);

		return result.isRight() ? sendOK() : processError(result.value);
	});
}

export function deleteHandler(tenants: AntboxTenant[]): HttpHandler {
	return webdavMiddlewareChain(tenants, async (req: Request) => {
		const tenant = getTenant(req, tenants);
		const authContext = getAuthenticationContext(req);
		const path = getPath(req, tenant);

		const nodeOrErr = await resolvePath(tenant.nodeService, authContext, path, tenant.name);
		if (nodeOrErr.isLeft()) {
			return processError(nodeOrErr.value);
		}

		const node = nodeOrErr.value;

		// Check if node is locked before deleting
		if (node.locked && node.lockedBy !== authContext.principal.email) {
			return new Response(
				`Resource is locked by ${node.lockedBy}`,
				{ status: 423 }, // 423 Locked
			);
		}

		const result = await tenant.nodeService.delete(
			authContext,
			node.uuid,
		);

		return result.isRight() ? sendNoContent() : processError(result.value);
	});
}

export function mkcolHandler(tenants: AntboxTenant[]): HttpHandler {
	return webdavMiddlewareChain(tenants, async (req: Request) => {
		const tenant = getTenant(req, tenants);
		const authContext = getAuthenticationContext(req);
		const path = getPath(req, tenant);
		const parentPath = path.substring(0, path.lastIndexOf("/"));
		const title = unescapePath(path.substring(path.lastIndexOf("/") + 1));

		const parentOrErr = await resolvePath(
			tenant.nodeService,
			authContext,
			parentPath,
			tenant.name,
		);
		if (parentOrErr.isLeft()) {
			return processError(parentOrErr.value);
		}

		const parent = parentOrErr.value;
		if (!Nodes.isFolder(parent)) {
			return new Response("Parent is not a folder", { status: 400 });
		}

		const result = await tenant.nodeService.create(authContext, {
			parent: parent.uuid,
			title,
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		return result.isRight() ? sendCreated() : processError(result.value);
	});
}

export function copyHandler(tenants: AntboxTenant[]): HttpHandler {
	return webdavMiddlewareChain(tenants, async (req: Request) => {
		const tenant = getTenant(req, tenants);
		const authContext = getAuthenticationContext(req);
		const sourcePath = getPath(req, tenant);
		const destination = req.headers.get("Destination");

		if (!destination) {
			return new Response("Destination header missing", { status: 400 });
		}

		const destinationPath = getPath(destination, tenant);
		const sourceNodeOrErr = await resolvePath(
			tenant.nodeService,
			authContext,
			sourcePath,
			tenant.name,
		);
		if (sourceNodeOrErr.isLeft()) {
			return processError(sourceNodeOrErr.value);
		}

		const destParentPath = destinationPath.substring(
			0,
			destinationPath.lastIndexOf("/"),
		);
		const destTitle = destinationPath.substring(
			destinationPath.lastIndexOf("/") + 1,
		);

		const destParentOrErr = await resolvePath(
			tenant.nodeService,
			authContext,
			destParentPath,
			tenant.name,
		);
		if (destParentOrErr.isLeft()) {
			return processError(destParentOrErr.value);
		}

		const result = await tenant.nodeService.copy(
			authContext,
			sourceNodeOrErr.value.uuid,
			destParentOrErr.value.uuid,
		);

		if (result.isLeft()) {
			return processError(result.value);
		}

		const updateResult = await tenant.nodeService.update(
			authContext,
			result.value.uuid,
			{ title: destTitle },
		);

		return updateResult.isRight() ? sendCreated() : processError(updateResult.value);
	});
}

export function moveHandler(tenants: AntboxTenant[]): HttpHandler {
	return webdavMiddlewareChain(tenants, async (req: Request) => {
		const tenant = getTenant(req, tenants);
		const authContext = getAuthenticationContext(req);
		const destination = req.headers.get("Destination");

		if (!destination) {
			return new Response("Destination header missing", { status: 400 });
		}

		const sourcePath = getPath(req, tenant);
		const destinationPath = getPath(destination as string, tenant);

		const sourceNodeOrErr = await resolvePath(
			tenant.nodeService,
			authContext,
			sourcePath,
			tenant.name,
		);
		if (sourceNodeOrErr.isLeft()) {
			return processError(sourceNodeOrErr.value);
		}

		const sourceNode = sourceNodeOrErr.value;

		// Check if source node is locked before moving
		if (sourceNode.locked && sourceNode.lockedBy !== authContext.principal.email) {
			return new Response(
				`Resource is locked by ${sourceNode.lockedBy}`,
				{ status: 423 }, // 423 Locked
			);
		}

		const destParentPath = destinationPath.substring(0, destinationPath.lastIndexOf("/"));
		const destTitle = destinationPath.substring(destinationPath.lastIndexOf("/") + 1);

		const destParentOrErr = await resolvePath(
			tenant.nodeService,
			authContext,
			destParentPath,
			tenant.name,
		);
		if (destParentOrErr.isLeft()) {
			return processError(destParentOrErr.value);
		}

		const result = await tenant.nodeService.update(
			authContext,
			sourceNode.uuid,
			{ parent: destParentOrErr.value.uuid, title: unescapePath(destTitle) },
		);

		return result.isRight() ? sendCreated() : processError(result.value);
	});
}

export function lockHandler(tenants: AntboxTenant[]): HttpHandler {
	return webdavMiddlewareChain(tenants, async (req: Request) => {
		const tenant = getTenant(req, tenants);
		const authContext = getAuthenticationContext(req);
		const path = getPath(req, tenant);

		const nodeOrErr = await resolvePath(tenant.nodeService, authContext, path, tenant.name);
		if (nodeOrErr.isLeft()) {
			return processError(nodeOrErr.value);
		}

		const node = nodeOrErr.value;

		// Actually lock the node using NodeService
		const lockResult = await tenant.nodeService.lock(
			authContext,
			node.uuid,
			[], // Empty array means only user's groups can unlock
		);

		if (lockResult.isLeft()) {
			return processError(lockResult.value);
		}

		// Generate lock token (WebDAV protocol requirement)
		// Format: opaquelocktoken:{nodeUuid}-{email-hash}
		const lockToken = `opaquelocktoken:${node.uuid}-${
			btoa(authContext.principal.email).substring(0, 16)
		}`;
		const timeout = req.headers.get("Timeout") || "Second-3600";

		const lockResponse = `<?xml version="1.0" encoding="utf-8"?>
<D:prop xmlns:D="DAV:">
  <D:lockdiscovery>
    <D:activelock>
      <D:locktype><D:write/></D:locktype>
      <D:lockscope><D:exclusive/></D:lockscope>
      <D:depth>0</D:depth>
      <D:owner>
        <D:href>${authContext.principal.email}</D:href>
      </D:owner>
      <D:timeout>${timeout}</D:timeout>
      <D:locktoken>
        <D:href>${lockToken}</D:href>
      </D:locktoken>
    </D:activelock>
  </D:lockdiscovery>
</D:prop>`;

		return new Response(lockResponse, {
			status: 200,
			headers: {
				"Content-Type": "application/xml; charset=utf-8",
				"Lock-Token": `<${lockToken}>`,
			},
		});
	});
}

export function unlockHandler(tenants: AntboxTenant[]): HttpHandler {
	return webdavMiddlewareChain(tenants, async (req: Request) => {
		const tenant = getTenant(req, tenants);
		const authContext = getAuthenticationContext(req);
		const path = getPath(req, tenant);
		const lockToken = req.headers.get("Lock-Token");

		const nodeOrErr = await resolvePath(tenant.nodeService, authContext, path, tenant.name);
		if (nodeOrErr.isLeft()) {
			return processError(nodeOrErr.value);
		}

		const node = nodeOrErr.value;

		// Basic lock token validation
		if (!lockToken) {
			return new Response("Lock-Token header required", { status: 400 });
		}

		// Validate token format (optional - for better error messages)
		const cleanToken = lockToken.replace(/^<|>$/g, ""); // Remove angle brackets
		if (!cleanToken.startsWith("opaquelocktoken:")) {
			return new Response("Invalid lock token format", { status: 400 });
		}

		// Actually unlock the node using NodeService
		// NodeService.unlock() will check if the user is authorized to unlock
		const unlockResult = await tenant.nodeService.unlock(
			authContext,
			node.uuid,
		);

		if (unlockResult.isLeft()) {
			return processError(unlockResult.value);
		}

		return sendNoContent();
	});
}
