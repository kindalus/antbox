import { type AntboxTenant } from "api/antbox_tenant.ts";
import { webdavMiddlewareChain } from "./webdav_middleware.ts";
import { getAuthenticationContext } from "api/get_authentication_context.ts";
import { getTenant } from "api/get_tenant.ts";
import { type HttpHandler, sendCreated, sendNoContent, sendOK } from "api/handler.ts";
import { processError } from "api/process_error.ts";
import { createPropfindResponse } from "./webdav_xml.ts";
import { getMimetype, resolvePath, unescapePath } from "./webdav_utils.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { createETagHeader } from "./webdav_etag.ts";

function getPath(req: Request | string, tenant: AntboxTenant): string {
	const path = new URL(typeof req === "string" ? req : req.url).pathname.replace(
		`/webdav/${tenant.name}`,
		"",
	) || "/";
	return path;
}

export function optionsHandler(tenants: AntboxTenant[]): HttpHandler {
	return webdavMiddlewareChain(tenants, (_req: Request) => {
		return Promise.resolve(
			new Response(null, {
				status: 200,
				headers: {
					Allow: "OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, MKCOL, COPY, MOVE, LOCK, UNLOCK",
					DAV: "1, 2",
				},
			}),
		);
	});
}

export function propfindHandler(tenants: AntboxTenant[]): HttpHandler {
	return webdavMiddlewareChain(tenants, async (req: Request) => {
		const tenant = getTenant(req, tenants);
		const authContext = getAuthenticationContext(req);
		const path = getPath(req, tenant);

		const nodeOrErr = await resolvePath(tenant.nodeService, authContext, path);
		if (nodeOrErr.isLeft()) {
			return processError(nodeOrErr.value);
		}

		const targetNode = nodeOrErr.value;
		const depth = req.headers.get("Depth") ?? "1";

		if ((Nodes.isFolder(targetNode) || Nodes.isSmartFolder(targetNode)) && depth === "1") {
			const childrenOrErr = await tenant.nodeService.list(
				authContext,
				targetNode.uuid,
			);
			if (childrenOrErr.isLeft()) {
				return processError(childrenOrErr.value);
			}
			const xml = createPropfindResponse([targetNode, ...childrenOrErr.value], req);

			return new Response(xml, {
				status: 207,
				headers: {
					"Content-Type": "application/xml; charset=utf-8",
					"Cache-Control": "no-cache, no-store, must-revalidate",
					"Pragma": "no-cache",
					"Expires": "0",
					"ETag": createETagHeader(targetNode),
					"Content-Length": xml.length.toString(),
				},
			});
		}

		const xml = createPropfindResponse([targetNode], req);

		return new Response(xml, {
			status: 207,
			headers: {
				"Content-Type": "application/xml; charset=utf-8",
				"Cache-Control": "no-cache, no-store, must-revalidate",
				"Pragma": "no-cache",
				"Expires": "0",
				"ETag": createETagHeader(targetNode),
				"Content-Length": xml.length.toString(),
			},
		});
	});
}

export function getHandler(tenants: AntboxTenant[]): HttpHandler {
	return webdavMiddlewareChain(tenants, async (req: Request) => {
		const tenant = getTenant(req, tenants);
		const authContext = getAuthenticationContext(req);
		const path = getPath(req, tenant);

		const nodeOrErr = await resolvePath(tenant.nodeService, authContext, path);

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
		);
		if (parentOrErr.isLeft()) {
			return processError(parentOrErr.value);
		}

		const parent = parentOrErr.value;
		if (!Nodes.isFolder(parent)) {
			return new Response("Parent is not a folder", { status: 400 });
		}

		const blob = await req.blob();
		const file = new File([blob], title, { type: mimetype });

		const existingNodeOrErr = await resolvePath(
			tenant.nodeService,
			authContext,
			path,
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

		const result = await tenant.nodeService.updateFile(
			authContext,
			existingNodeOrErr.value.uuid,
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

		const nodeOrErr = await resolvePath(tenant.nodeService, authContext, path);
		if (nodeOrErr.isLeft()) {
			return processError(nodeOrErr.value);
		}

		const result = await tenant.nodeService.delete(
			authContext,
			nodeOrErr.value.uuid,
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

		const destinationPath = new URL(destination).pathname.replace(/^\/webdav/, "");
		const sourceNodeOrErr = await resolvePath(
			tenant.nodeService,
			authContext,
			sourcePath,
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
		);
		if (sourceNodeOrErr.isLeft()) {
			return processError(sourceNodeOrErr.value);
		}

		const destParentPath = destinationPath.substring(0, destinationPath.lastIndexOf("/"));
		const destTitle = destinationPath.substring(destinationPath.lastIndexOf("/") + 1);

		const destParentOrErr = await resolvePath(
			tenant.nodeService,
			authContext,
			destParentPath,
		);
		if (destParentOrErr.isLeft()) {
			return processError(destParentOrErr.value);
		}

		const result = await tenant.nodeService.update(
			authContext,
			sourceNodeOrErr.value.uuid,
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

		// // Verificar se o recurso existe
		const nodeOrErr = await resolvePath(tenant.nodeService, authContext, path);
		if (nodeOrErr.isLeft()) {
			return processError(nodeOrErr.value);
		}

		// Gerar um token de lock dummy
		const lockToken = `opaquelocktoken:${crypto.randomUUID()}`;
		const timeout = req.headers.get("Timeout") || "Second-3600";

		// Resposta XML dummy para LOCK
		const lockResponse = `<?xml version="1.0" encoding="utf-8"?>
<D:prop xmlns:D="DAV:">
  <D:lockdiscovery>
    <D:activelock>
      <D:locktype><D:write/></D:locktype>
      <D:lockscope><D:exclusive/></D:lockscope>
      <D:depth>0</D:depth>
      <D:owner>
        <D:href>${authContext.principal.email || "anonymous"}</D:href>
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

		// // Verificar se o recurso existe
		const nodeOrErr = await resolvePath(tenant.nodeService, authContext, path);
		if (nodeOrErr.isLeft()) {
			return processError(nodeOrErr.value);
		}

		// Validação básica do token (dummy)
		if (!lockToken) {
			return new Response("Lock token required", { status: 400 });
		}

		// Por enquanto, sempre aceitar o unlock
		return sendNoContent();
	});
}
