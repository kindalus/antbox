import { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { generateETag } from "./webdav_etag.ts";

function nodeToLockToken(node: NodeMetadata): string {
	const lockedBy = node.lockedBy ?? "";
	const ownerHash = lockedBy.length ? btoa(lockedBy).substring(0, 16) : "";
	return `opaquelocktoken:${node.uuid}-${ownerHash}`;
}

function safeEncode(unsafe: string): string {
	return encodeURIComponent(unsafe)
		.replace(/'/g, "%27") // Force encode single quote
		.replace(/\(/g, "%28") // Optional: encode parens
		.replace(/\)/g, "%29");
}

function safeEncodeHref(node: NodeMetadata, basePath: string): string {
	const encodedTitle = safeEncode(node.title);

	// Ensure base path ends with a slash if it's not the root
	const normalizedBasePath = basePath.endsWith("/") || basePath === "" ? basePath : `${basePath}/`;

	let href = `${normalizedBasePath}${encodedTitle}`;

	if (Nodes.isFolderLike(node) && !href.endsWith("/")) {
		href += "/";
	}

	return href;
}

function nodeToPropfindXml(node: NodeMetadata, basePath: string, first = false): string {
	const isFolder = Nodes.isFolderLike(node);
	const creationDate = new Date(node.createdTime!).toISOString();
	const modifiedDate = new Date(node.modifiedTime!).toUTCString();
	const etag = generateETag(node);
	const lockDiscovery = node.locked
		? `
          <D:lockdiscovery>
            <D:activelock>
              <D:locktype><D:write/></D:locktype>
              <D:lockscope><D:exclusive/></D:lockscope>
              <D:depth>0</D:depth>
              <D:owner>${node.lockedBy ?? ""}</D:owner>
              <D:timeout>Second-3600</D:timeout>
              <D:locktoken><D:href>${nodeToLockToken(node)}</D:href></D:locktoken>
            </D:activelock>
          </D:lockdiscovery>`
		: "<D:lockdiscovery/>";

	const supportedLock = `
          <D:supportedlock>
            <D:lockentry>
              <D:lockscope><D:exclusive/></D:lockscope>
              <D:locktype><D:write/></D:locktype>
            </D:lockentry>
          </D:supportedlock>`;

	const contentLength = isFolder
		? ""
		: `<D:getcontentlength>${node.size ?? 0}</D:getcontentlength>`;

	const resourceType = isFolder ? "<D:collection/>" : "";

	if (first) {
		basePath = basePath.split("/").filter((v) => v?.length > 0).slice(0, -1).join("/");
		basePath = "/".concat(basePath);
	}

	return `
    <D:response>
      <D:href>${safeEncodeHref(node, basePath)}</D:href>
      <D:propstat>
        <D:prop>
          <D:creationdate>${creationDate}</D:creationdate>
          <D:getlastmodified>${modifiedDate}</D:getlastmodified>
          <D:getetag>"${etag}"</D:getetag>
          ${contentLength}
          <D:resourcetype>${resourceType}</D:resourcetype>
          ${supportedLock}
          ${lockDiscovery}
        </D:prop>
        <D:status>HTTP/1.1 200 OK</D:status>
      </D:propstat>
    </D:response>
  `;
}

export function createPropfindResponse(nodes: NodeMetadata[], req: Request): string {
	const basePath = new URL(req.url).pathname || "/";
	const responses = nodes.map((node, index) => {
		return nodeToPropfindXml(node, basePath, index === 0);
	}).join("\n");

	return `<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:D="DAV:">
  ${responses}
</D:multistatus>`;
}
