import { NodeLike } from "domain/node_like.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { generateETag } from "./webdav_etag.ts";

function escapeXml(unsafe: string): string {
	return unsafe.replace(/[<>&'"]/g, (c) => {
		switch (c) {
			case "<":
				return "&lt;";
			case ">":
				return "&gt;";
			case "&":
				return "&amp;";
			case "'":
				return "&apos;";
			case '"':
				return "&quot;";
			default:
				return c;
		}
	});
}

function nodeToHref(node: NodeLike, basePath: string): string {
	const isFolder = node.mimetype === Nodes.FOLDER_MIMETYPE;
	const encodedTitle = encodeURIComponent(node.title);

	// Ensure base path ends with a slash if it's not the root
	const normalizedBasePath = basePath.endsWith("/") || basePath === "" ? basePath : `${basePath}/`;

	let href = `${normalizedBasePath}${encodedTitle}`;

	if (isFolder && !href.endsWith("/")) {
		href += "/";
	}

	return href;
}

function nodeToPropfindXml(node: NodeLike, basePath: string, first = false): string {
	const isFolder = node.mimetype === Nodes.FOLDER_MIMETYPE;
	const creationDate = new Date(node.createdTime).toISOString();
	const modifiedDate = new Date(node.modifiedTime).toUTCString();
	const etag = generateETag(node);
	const contentLength = isFolder
		? ""
		: `<D:getcontentlength>${(node as any).size || 0}</D:getcontentlength>`;

	const resourceType = isFolder ? "<D:collection/>" : "";

	if (first) {
		basePath = basePath.split("/").filter((v) => v?.length > 0).slice(0, -1).join("/");
		basePath = "/".concat(basePath);
	}

	return `
    <D:response>
      <D:href>${escapeXml(nodeToHref(node, basePath))}</D:href>
      <D:propstat>
        <D:prop>
          <D:creationdate>${creationDate}</D:creationdate>
          <D:getlastmodified>${modifiedDate}</D:getlastmodified>
          <D:getetag>"${etag}"</D:getetag>
          ${contentLength}
          <D:resourcetype>${resourceType}</D:resourcetype>
          <D:displayname>${escapeXml(node.title)}</D:displayname>
        </D:prop>
        <D:status>HTTP/1.1 200 OK</D:status>
      </D:propstat>
    </D:response>
  `;
}

export function createPropfindResponse(nodes: NodeLike[], req: Request): string {
	const basePath = new URL(req.url).pathname.replace(`/webdav`, "") || "/";
	const responses = nodes.map((node, index) => {
		return nodeToPropfindXml(node, basePath, index === 0);
	}).join("\n");

	return `<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:D="DAV:">
  ${responses}
</D:multistatus>`;
}
