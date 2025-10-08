import { NodeService } from "application/node_service.ts";
import { AuthenticationContext } from "application/authentication_context.ts";
import { NodeLike } from "domain/node_like.ts";
import { Either, left, right } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { Folders } from "domain/nodes/folders.ts";

function pathsMatch(pathA: string[], pathB: string[]): boolean {
	return (
		pathA.length === pathB.length && pathA.every((val, index) => val === pathB[index])
	);
}

export function unescapePath(path: string): string {
	return decodeURIComponent(path);
}

export async function resolvePath(
	service: NodeService,
	authContext: AuthenticationContext,
	path: string,
): Promise<Either<AntboxError, NodeLike>> {
	if (path === "/" || path === "") {
		return service.get(authContext, Folders.ROOT_FOLDER_UUID);
	}

	const segments = path.split("/")
		.filter((s) => s.length > 0)
		.map(unescapePath);

	const targetTitle = segments[segments.length - 1];
	const parentPathSegments = segments.slice(0, -1);

	const findResultOrErr = await service.find(authContext, [[
		"title",
		"==",
		targetTitle,
	]]);
	if (findResultOrErr.isLeft()) {
		return left(findResultOrErr.value);
	}

	const nodes = findResultOrErr.value.nodes;

	if (nodes.length === 0) {
		return left(new NodeNotFoundError(`Node not found for path: ${path}`));
	}

	const paths = await Promise.all(
		nodes.map((n) => service.breadcrumbs(authContext, n.uuid)),
	);

	for (let i = 0; i < paths.length; i++) {
		const path = paths[i];
		if (path.isLeft()) continue;

		const pathB = path.value.map((b) => b.title).slice(1, -1);

		if (pathsMatch(parentPathSegments, pathB)) return right(nodes[i]);
	}

	return left(new NodeNotFoundError(`Node not found for path: ${path}`));
}

export function getMimetype(filename: string): string {
	const ext = filename.split(".").pop();
	return MIME_TYPES[`.${ext}`] || "application/octet-stream";
}

const MIME_TYPES: Record<string, string> = {
	".aac": "audio/aac",
	".abw": "application/x-abiword",
	".apng": "image/apng",
	".arc": "application/x-freearc",
	".avif": "image/avif",
	".avi": "video/x-msvideo",
	".azw": "application/vnd.amazon.ebook",
	".bin": "application/octet-stream",
	".bmp": "OS/2",
	".bz": "application/x-bzip",
	".bz2": "application/x-bzip2",
	".cda": "application/x-cdf",
	".csh": "application/x-csh",
	".css": "text/css",
	".csv": "text/csv",
	".doc": "application/msword",
	".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".eot": "application/vnd.ms-fontobject",
	".epub": "application/epub+zip",
	".gz": "application/gzip.",
	".gif": "image/gif",
	".htm": "text/html",
	".ico": "image/vnd.microsoft.icon",
	".ics": "text/calendar",
	".jar": "application/java-archive",
	".jpeg": "image/jpeg",
	".js": "text/javascript",
	".json": "application/json",
	".jsonld": "application/ld+json",
	".md": "text/markdown",
	".mid": "audio/midi,",
	".mjs": "text/javascript",
	".mp3": "audio/mpeg",
	".mp4": "video/mp4",
	".mpeg": "video/mpeg",
	".mpkg": "application/vnd.apple.installer+xml",
	".odp": "application/vnd.oasis.opendocument.presentation",
	".ods": "application/vnd.oasis.opendocument.spreadsheet",
	".odt": "application/vnd.oasis.opendocument.text",
	".oga": "audio/ogg",
	".ogv": "video/ogg",
	".ogx": "application/ogg",
	".opus": "audio/ogg",
	".otf": "font/otf",
	".png": "image/png",
	".pdf": "application/pdf",
	".php": "application/x-httpd-php",
	".ppt": "application/vnd.ms-powerpoint",
	".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	".rar": "application/vnd.rar",
	".rtf": "application/rtf",
	".sh": "application/x-sh",
	".svg": "image/svg+xml",
	".tar": "application/x-tar",
	".tif": "image/tiff",
	".ts": "video/mp2t",
	".ttf": "font/ttf",
	".txt": "text/plain",
	".vsd": "application/vnd.visio",
	".wav": "audio/wav",
	".weba": "audio/webm",
	".webm": "video/webm",
	".webmanifest": "application/manifest+json",
	".webp": "image/webp",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".xhtml": "application/xhtml+xml",
	".xls": "application/vnd.ms-excel",
	".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	".xml": "application/xml",
	".xul": "application/vnd.mozilla.xul+xml",
	".zip": "application/zip.",
	".3gp": "audio/video",
	".3g2": "audio/video",
	".7z": "application/x-7z-compressed",
};
