import { expect } from "expect";
import { JSDOM } from "jsdom";
import { createPropfindResponse } from "./webdav_xml.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Nodes } from "domain/nodes/nodes.ts";

Deno.test("WebDAV XML escapes owner metadata and URI ampersands", () => {
	const node = {
		uuid: "file",
		title: "file.txt",
		mimetype: "text/plain",
		size: 1,
		createdTime: "2026-01-01T00:00:00Z",
		modifiedTime: "2026-01-01T00:00:00Z",
		locked: true,
		lockedBy: "writer&name@example.com",
	} as NodeMetadata;
	const xml = createPropfindResponse(
		[node],
		new Request("http://localhost/webdav/first/A&B/file.txt"),
	);
	const dom = new JSDOM(xml, { contentType: "application/xml" });
	try {
		expect(dom.window.document.getElementsByTagNameNS("DAV:", "owner")[0].textContent)
			.toBe("writer&name@example.com");
		expect(dom.window.document.getElementsByTagNameNS("DAV:", "href")[0].textContent)
			.toBe("/webdav/first/A&B/file.txt");
	} finally {
		dom.window.close();
	}
});

Deno.test("WebDAV root response keeps the requested tenant href", () => {
	const node = {
		uuid: Nodes.ROOT_FOLDER_UUID,
		title: "Root",
		mimetype: Nodes.FOLDER_MIMETYPE,
		createdTime: "2026-01-01T00:00:00Z",
		modifiedTime: "2026-01-01T00:00:00Z",
	} as NodeMetadata;
	const xml = createPropfindResponse([node], new Request("http://localhost/webdav/first/"));
	const dom = new JSDOM(xml, { contentType: "application/xml" });
	try {
		expect(dom.window.document.getElementsByTagNameNS("DAV:", "href")[0].textContent)
			.toBe("/webdav/first/");
	} finally {
		dom.window.close();
	}
});
