import { expect } from "expect";
import { stub } from "mock";
import { S3Client } from "s3";
import { S3StorageProvider } from "./s3_storage_provider.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { UnknownError } from "shared/antbox_error.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { NodeService } from "application/nodes/node_service.ts";
import { FileNode } from "domain/nodes/file_node.ts";
import { Users } from "domain/users_groups/users.ts";

type Command = { constructor: { name: string }; input: Record<string, unknown> };

function fakeClient(send: (command: Command) => Promise<unknown>, deleteError?: Error): S3Client {
	return {
		realS3Client: () => ({ send }),
		file: () => ({
			name: "stored-file",
			type: () => Promise.resolve("text/plain"),
			arrayBuffer: () => Promise.resolve(new TextEncoder().encode("content").buffer),
		}),
		delete: () => deleteError ? Promise.reject(deleteError) : Promise.resolve(),
	} as unknown as S3Client;
}

function serviceError(name: string, httpStatusCode: number): Error {
	return Object.assign(new Error(name), { name, $metadata: { httpStatusCode } });
}

Deno.test("S3 deletes directly without fetching bytes and accepts idempotent success", async () => {
	const commands: Command[] = [];
	const client = fakeClient((command) => {
		commands.push(command);
		return Promise.resolve({ $metadata: { httpStatusCode: 204 } });
	});
	client.file = () => {
		throw new Error("DELETE must not download the object");
	};
	const storage = new S3StorageProvider(client, "test-bucket");
	for (let index = 0; index < 2; index++) {
		expect((await storage.delete("abcd-file")).isRight()).toBe(true);
	}
	expect(commands.map((command) => command.constructor.name)).toEqual([
		"DeleteObjectCommand",
		"DeleteObjectCommand",
	]);
	expect(commands[0].input).toEqual({ Bucket: "test-bucket", Key: "nodes/A/B/abcd-file" });
});

Deno.test("S3 reads use object bytes and content type and report body failures", async () => {
	const commands: Command[] = [];
	const storage = new S3StorageProvider(
		fakeClient((command) => {
			commands.push(command);
			return Promise.resolve({
				Body: {
					transformToByteArray: () => Promise.resolve(new TextEncoder().encode("download")),
				},
				ContentType: "text/markdown",
			});
		}),
		"test-bucket",
	);
	const file = (await storage.read("abcd-file")).right;
	expect(await file.text()).toBe("download");
	expect(file.type).toBe("text/markdown");
	expect(commands.map((command) => command.constructor.name)).toEqual(["GetObjectCommand"]);
	for (
		const body of [undefined, {
			transformToByteArray: () => Promise.reject(new Error("stream failed")),
		}]
	) {
		const failing = new S3StorageProvider(
			fakeClient(() => Promise.resolve({ Body: body })),
			"test-bucket",
		);
		expect((await failing.read("abcd-file")).value).toBeInstanceOf(UnknownError);
	}
});

Deno.test("S3 distinguishes missing objects from permissions, bucket and network failures", async () => {
	for (
		const error of [
			serviceError("NoSuchKey", 404),
			serviceError("NotFound", 404),
			serviceError("AccessDenied", 403),
			serviceError("NoSuchBucket", 404),
			serviceError("InternalError", 500),
			new TypeError("network failed"),
		]
	) {
		const client = fakeClient(() => Promise.reject(error), error);
		client.file = () =>
			({
				type: () => Promise.reject(error),
			}) as ReturnType<S3Client["file"]>;
		const storage = new S3StorageProvider(client, "test-bucket");
		const expected = ["NoSuchKey", "NotFound"].includes(error.name)
			? NodeNotFoundError
			: UnknownError;
		expect((await storage.read("abcd-file")).value).toBeInstanceOf(expected);
		expect((await storage.delete("abcd-file")).value).toBeInstanceOf(expected);
		expect((await storage.write("abcd-file", new File(["upload"], "test.txt"))).value)
			.toBeInstanceOf(UnknownError);
	}
});

Deno.test("S3 uploads send bytes and the requested MIME type through the configured client", async () => {
	const client = new S3Client({
		region: "us-east-1",
		accessKeyId: "test-key",
		secretAccessKey: "test-secret",
		bucket: "test-bucket",
	});
	const sdk = client.realS3Client();
	const commands: Command[] = [];
	const send = stub(
		sdk,
		"send",
		((command: Command) => {
			commands.push(command);
			return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
		}) as typeof sdk.send,
	);
	try {
		const storage = new S3StorageProvider(client, "test-bucket");
		const result = await storage.write(
			"abcd-file",
			new File(["upload"], "source.txt", { type: "text/plain" }),
			{
				mimetype: "text/markdown",
				title: "source.txt",
				parent: "parent-folder",
			},
		);
		expect(result.isRight()).toBe(true);
		expect(commands[0].constructor.name).toBe("PutObjectCommand");
		expect(commands[0].input.ContentType).toBe("text/markdown");
		expect(new TextDecoder().decode(commands[0].input.Body as Uint8Array)).toBe("upload");
	} finally {
		send.restore();
		sdk.destroy();
	}
});

Deno.test("NodeService keeps metadata when S3 deletion is denied", async () => {
	const denied = serviceError("AccessDenied", 403);
	const storage = new S3StorageProvider(
		fakeClient(() => Promise.reject(denied), denied),
		"test-bucket",
	);
	const repository = new InMemoryNodeRepository();
	const node = FileNode.create({
		uuid: "abcd-file",
		title: "S3 file",
		mimetype: "text/plain",
		owner: Users.ROOT_USER_EMAIL,
	}).right;
	await repository.add(node);
	const service = new NodeService({
		repository,
		storage,
		configRepo: new InMemoryConfigurationRepository(),
		bus: new InMemoryEventBus(),
	});
	const result = await service.delete({
		tenant: "test",
		mode: "Direct",
		principal: { email: Users.ROOT_USER_EMAIL, groups: [] },
	}, node.uuid);
	expect(result.value).toBeInstanceOf(UnknownError);
	expect((await repository.getById(node.uuid)).isRight()).toBe(true);
});
