import { expect } from "expect";
import { createETagHeader, generateETag } from "./webdav_etag.ts";
import { FileNode } from "domain/nodes/file_node.ts";

Deno.test("generateETag - should generate ETag in uuid-yyyymmddHHmmss format", () => {
	const fileNodeResult = FileNode.create({
		uuid: "550e8400-e29b-41d4-a716-446655440000",
		modifiedTime: "2023-12-15T14:30:25.123Z",
		title: "test.txt",
		mimetype: "text/plain",
		parent: "root",
		owner: "test@example.com",
		createdTime: "2023-12-15T14:30:25.123Z",
	});

	if (fileNodeResult.isLeft()) {
		throw new Error("Failed to create FileNode");
	}

	const fileNode = fileNodeResult.value;
	const etag = generateETag(fileNode);

	// Expected format: uuid-20231215143025
	expect(etag).toBe("550e8400-e29b-41d4-a716-446655440000-20231215143025");
});

Deno.test("generateETag - should handle different date formats correctly", () => {
	const fileNodeResult = FileNode.create({
		uuid: "123e4567-e89b-12d3-a456-426614174000",
		modifiedTime: "2024-01-01T00:00:00.000Z",
		title: "test.txt",
		mimetype: "text/plain",
		parent: "root",
		owner: "test@example.com",
		createdTime: "2024-01-01T00:00:00.000Z",
	});

	if (fileNodeResult.isLeft()) {
		throw new Error("Failed to create FileNode");
	}

	const fileNode = fileNodeResult.value;
	const etag = generateETag(fileNode);

	expect(etag).toBe("123e4567-e89b-12d3-a456-426614174000-20240101000000");
});

Deno.test("generateETag - should pad single digit values correctly", () => {
	const fileNodeResult = FileNode.create({
		uuid: "abcd1234-5678-90ef-1234-567890abcdef",
		modifiedTime: "2024-02-05T09:07:03.000Z",
		title: "test.txt",
		mimetype: "text/plain",
		parent: "root",
		owner: "test@example.com",
		createdTime: "2024-02-05T09:07:03.000Z",
	});

	if (fileNodeResult.isLeft()) {
		throw new Error("Failed to create FileNode");
	}

	const fileNode = fileNodeResult.value;
	const etag = generateETag(fileNode);

	// Should pad month, day, hour, minute, second to 2 digits
	expect(etag).toBe("abcd1234-5678-90ef-1234-567890abcdef-20240205090703");
});

Deno.test("createETagHeader - should wrap ETag in quotes", () => {
	const fileNodeResult = FileNode.create({
		uuid: "550e8400-e29b-41d4-a716-446655440000",
		modifiedTime: "2023-12-15T14:30:25.123Z",
		title: "test.txt",
		mimetype: "text/plain",
		parent: "root",
		owner: "test@example.com",
		createdTime: "2023-12-15T14:30:25.123Z",
	});

	if (fileNodeResult.isLeft()) {
		throw new Error("Failed to create FileNode");
	}

	const fileNode = fileNodeResult.value;
	const etagHeader = createETagHeader(fileNode);

	expect(etagHeader).toBe('"550e8400-e29b-41d4-a716-446655440000-20231215143025"');
});

Deno.test("generateETag - should handle leap year correctly", () => {
	const fileNodeResult = FileNode.create({
		uuid: "test-uuid-1234",
		modifiedTime: "2024-02-29T23:59:59.999Z", // Leap year Feb 29
		title: "test.txt",
		mimetype: "text/plain",
		parent: "root",
		owner: "test@example.com",
		createdTime: "2024-02-29T23:59:59.999Z",
	});

	if (fileNodeResult.isLeft()) {
		throw new Error("Failed to create FileNode");
	}

	const fileNode = fileNodeResult.value;
	const etag = generateETag(fileNode);

	expect(etag).toBe("test-uuid-1234-20240229235959");
});

Deno.test("generateETag - should be consistent for same input", () => {
	const fileNodeResult = FileNode.create({
		uuid: "consistent-test-uuid",
		modifiedTime: "2023-06-15T12:34:56.789Z",
		title: "test.txt",
		mimetype: "text/plain",
		parent: "root",
		owner: "test@example.com",
		createdTime: "2023-06-15T12:34:56.789Z",
	});

	if (fileNodeResult.isLeft()) {
		throw new Error("Failed to create FileNode");
	}

	const fileNode = fileNodeResult.value;
	const etag1 = generateETag(fileNode);
	const etag2 = generateETag(fileNode);

	expect(etag1).toBe(etag2);
	expect(etag1).toBe("consistent-test-uuid-20230615123456");
});
