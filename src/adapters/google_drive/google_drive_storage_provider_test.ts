import { describe, it } from "bdd";
import { expect } from "expect";
import { GoogleDriveStorageProvider } from "./google_drive_storage_provider.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { NodeCreatedEvent } from "domain/nodes/node_created_event.ts";

function makeDrive(overrides: Record<string, unknown> = {}) {
	const calls = {
		list: [] as Array<Record<string, unknown>>,
		create: [] as Array<Record<string, unknown>>,
		update: [] as Array<Record<string, unknown>>,
		delete: [] as Array<Record<string, unknown>>,
		get: [] as Array<Record<string, unknown>>,
		export: [] as Array<Record<string, unknown>>,
	};

	const drive = {
		files: {
			list: async (params: Record<string, unknown>) => {
				calls.list.push(params);
				return { data: { files: [] } };
			},
			create: async (params: Record<string, unknown>) => {
				calls.create.push(params);
				return { status: 200, data: { id: "drive-file-1" } };
			},
			update: async (params: Record<string, unknown>) => {
				calls.update.push(params);
				return { status: 200, data: { id: params.fileId ?? "drive-file-1" } };
			},
			delete: async (params: Record<string, unknown>) => {
				calls.delete.push(params);
				return { status: 204 };
			},
			get: async (params: Record<string, unknown>) => {
				calls.get.push(params);
				return { status: 200, data: new Uint8Array([1, 2, 3]) };
			},
			export: async (params: Record<string, unknown>) => {
				calls.export.push(params);
				return { status: 200, data: new Uint8Array([4, 5, 6]) };
			},
		},
		...overrides,
	};

	return {
		drive: drive as never,
		calls,
	};
}

describe("GoogleDriveStorageProvider", () => {
	it("writes new files to the Shared Drive root with Shared Drive flags", async () => {
		const { drive, calls } = makeDrive();
		const provider = new GoogleDriveStorageProvider(drive, "shared-drive-123");

		const result = await provider.write(
			"node-001",
			new File(["hello"], "hello.txt", { type: "text/plain" }),
			{ title: "Hello", parent: Nodes.ROOT_FOLDER_UUID, mimetype: "text/plain" },
		);

		expect(result.isRight()).toBe(true);
		expect(calls.list).toEqual([
			{
				q: "trashed=false and appProperties has { key='uuid' and value='node-001' }",
				corpora: "drive",
				driveId: "shared-drive-123",
				includeItemsFromAllDrives: true,
				supportsAllDrives: true,
				fields: "files(id,mimeType,name,parents,trashed)",
			},
		]);
		expect(calls.create).toHaveLength(1);
		expect(calls.create[0].supportsAllDrives).toBe(true);
		expect(calls.create[0].requestBody).toMatchObject({
			name: "Hello",
			parents: ["shared-drive-123"],
			appProperties: { uuid: "node-001" },
			mimeType: "text/plain",
		});
	});

	it("moves child files under the resolved parent folder after creation", async () => {
		const { drive, calls } = makeDrive({
			files: {
				list: async (params: Record<string, unknown>) => {
					calls.list.push(params);
					if ((params.q as string).includes("child-001")) {
						return { data: { files: [] } };
					}

					return {
						data: {
							files: [{
								id: "parent-folder-drive-id",
								name: "Parent",
								mimeType: Nodes.FOLDER_MIMETYPE,
								parents: ["shared-drive-123"],
								trashed: false,
							}],
						},
					};
				},
				create: async (params: Record<string, unknown>) => {
					calls.create.push(params);
					return { status: 200, data: { id: "child-drive-file" } };
				},
				update: async (params: Record<string, unknown>) => {
					calls.update.push(params);
					return { status: 200, data: { id: params.fileId ?? "child-drive-file" } };
				},
			},
		});
		const provider = new GoogleDriveStorageProvider(drive, "shared-drive-123");

		const result = await provider.write(
			"child-001",
			new File(["hello"], "hello.txt", { type: "text/plain" }),
			{ title: "Hello", parent: "parent-uuid", mimetype: "text/plain" },
		);

		expect(result.isRight()).toBe(true);
		expect(calls.update).toHaveLength(1);
		expect(calls.update[0]).toMatchObject({
			fileId: "child-drive-file",
			removeParents: "shared-drive-123",
			addParents: "parent-folder-drive-id",
			supportsAllDrives: true,
		});
	});

	it("rejects duplicate uuid matches inside the Shared Drive", async () => {
		const { drive } = makeDrive({
			files: {
				list: async () => ({
					data: {
						files: [
							{
								id: "a",
								name: "A",
								mimeType: "text/plain",
								parents: ["shared-drive-123"],
								trashed: false,
							},
							{
								id: "b",
								name: "B",
								mimeType: "text/plain",
								parents: ["shared-drive-123"],
								trashed: false,
							},
						],
					},
				}),
				create: async () => ({ status: 200, data: { id: "ignored" } }),
				update: async () => ({ status: 200, data: { id: "ignored" } }),
			},
		});
		const provider = new GoogleDriveStorageProvider(drive, "shared-drive-123");

		const result = await provider.write(
			"node-dup",
			new File(["hello"], "hello.txt", { type: "text/plain" }),
			{ title: "Hello", parent: Nodes.ROOT_FOLDER_UUID, mimetype: "text/plain" },
		);

		expect(result.isLeft()).toBe(true);
		if (result.isLeft()) {
			expect(result.value.errorCode).toBe("DuplicatedNodeError");
		}
	});

	it("creates folder nodes directly under the Shared Drive root", async () => {
		const { drive, calls } = makeDrive();
		const provider = new GoogleDriveStorageProvider(drive, "shared-drive-123");
		const subscriptions = new Map<string, { handle: (evt: unknown) => Promise<unknown> }>();

		provider.startListeners((eventId, handler) => {
			subscriptions.set(eventId, handler as never);
		});

		await subscriptions.get(NodeCreatedEvent.EVENT_ID)?.handle(
			new NodeCreatedEvent("user@example.com", "default", {
				uuid: "folder-001",
				fid: "folder-001",
				title: "Folder",
				mimetype: Nodes.FOLDER_MIMETYPE,
				parent: Nodes.ROOT_FOLDER_UUID,
				createdTime: new Date().toISOString(),
				modifiedTime: new Date().toISOString(),
				owner: "user@example.com",
			}),
		);

		expect(calls.create).toHaveLength(1);
		expect(calls.create[0]).toMatchObject({
			supportsAllDrives: true,
			requestBody: {
				name: "Folder",
				parents: ["shared-drive-123"],
				appProperties: { uuid: "folder-001" },
				mimeType: "application/vnd.google-apps.folder",
			},
		});
	});

	it("trashes files instead of permanently deleting them", async () => {
		const { drive, calls } = makeDrive({
			files: {
				list: async (params: Record<string, unknown>) => {
					calls.list.push(params);
					return {
						data: {
							files: [{
								id: "drive-file-1",
								name: "hello.txt",
								mimeType: "text/plain",
								parents: ["shared-drive-123"],
								trashed: false,
							}],
						},
					};
				},
				update: async (params: Record<string, unknown>) => {
					calls.update.push(params);
					return { status: 200, data: { id: params.fileId ?? "drive-file-1" } };
				},
				delete: async (params: Record<string, unknown>) => {
					calls.delete.push(params);
					return { status: 204 };
				},
			},
		});
		const provider = new GoogleDriveStorageProvider(drive, "shared-drive-123");

		const result = await provider.delete("node-001");

		expect(result.isRight()).toBe(true);
		expect(calls.update).toContainEqual({
			fileId: "drive-file-1",
			requestBody: { trashed: true },
			supportsAllDrives: true,
		});
		expect(calls.delete).toHaveLength(0);
	});

	it("preserves non-not-found delete errors for troubleshooting", async () => {
		const { drive } = makeDrive({
			files: {
				list: async () => ({
					data: {
						files: [{
							id: "drive-file-1",
							name: "hello.txt",
							mimeType: "text/plain",
							parents: ["shared-drive-123"],
							trashed: false,
						}],
					},
				}),
				update: async () => {
					const error = new Error("File not found: drive-file-1.");
					Object.assign(error, { code: 403 });
					throw error;
				},
				delete: async () => ({ status: 204 }),
			},
		});
		const provider = new GoogleDriveStorageProvider(drive, "shared-drive-123");

		const result = await provider.delete("node-001");

		expect(result.isLeft()).toBe(true);
		if (result.isLeft()) {
			expect(result.value.errorCode).toBe("UnknownError");
			expect(result.value.message).toContain("Google Drive trash failed");
		}
	});

	it("reads regular file blobs with Shared Drive flags", async () => {
		const { drive, calls } = makeDrive({
			files: {
				list: async (params: Record<string, unknown>) => {
					calls.list.push(params);
					return {
						data: {
							files: [{
								id: "drive-file-1",
								name: "hello.txt",
								mimeType: "text/plain",
								parents: ["shared-drive-123"],
								trashed: false,
							}],
						},
					};
				},
				get: async (params: Record<string, unknown>, options?: Record<string, unknown>) => {
					calls.get.push({ ...params, __options: options });
					return { status: 200, data: new Uint8Array([1, 2, 3]) };
				},
				export: async (params: Record<string, unknown>) => {
					calls.export.push(params);
					return { status: 200, data: new Uint8Array([9, 9, 9]) };
				},
			},
		});
		const provider = new GoogleDriveStorageProvider(drive, "shared-drive-123");

		const result = await provider.read("node-001");

		expect(result.isRight()).toBe(true);
		if (result.isRight()) {
			expect(await result.value.arrayBuffer()).toEqual(new Uint8Array([1, 2, 3]).buffer);
		}
		expect(calls.get).toHaveLength(1);
		expect(calls.get[0]).toMatchObject({
			fileId: "drive-file-1",
			alt: "media",
			supportsAllDrives: true,
			__options: { responseType: "arraybuffer" },
		});
		expect(calls.export).toHaveLength(0);
	});

	it("exports native Google document types through files.export", async () => {
		const { drive, calls } = makeDrive({
			files: {
				list: async (params: Record<string, unknown>) => {
					calls.list.push(params);
					return {
						data: {
							files: [{
								id: "drive-doc-1",
								name: "Proposal",
								mimeType: "application/vnd.google-apps.document",
								parents: ["shared-drive-123"],
								trashed: false,
							}],
						},
					};
				},
				get: async (params: Record<string, unknown>) => {
					calls.get.push(params);
					return { status: 200, data: new Uint8Array([1, 2, 3]) };
				},
				export: async (params: Record<string, unknown>, options?: Record<string, unknown>) => {
					calls.export.push({ ...params, __options: options });
					return { status: 200, data: new Uint8Array([4, 5, 6]) };
				},
			},
		});
		const provider = new GoogleDriveStorageProvider(drive, "shared-drive-123");

		const result = await provider.read("node-doc-001");

		expect(result.isRight()).toBe(true);
		if (result.isRight()) {
			expect(result.value.name).toBe("Proposal.pdf");
			expect(result.value.type).toBe("application/pdf");
			expect(await result.value.arrayBuffer()).toEqual(new Uint8Array([4, 5, 6]).buffer);
		}
		expect(calls.export).toHaveLength(1);
		expect(calls.export[0]).toMatchObject({
			fileId: "drive-doc-1",
			mimeType: "application/pdf",
			__options: { responseType: "arraybuffer" },
		});
		expect(calls.get).toHaveLength(0);
	});

	it("preserves non-not-found export errors for troubleshooting", async () => {
		const { drive } = makeDrive({
			files: {
				list: async () => ({
					data: {
						files: [{
							id: "drive-file-1",
							name: "hello.txt",
							mimeType: "text/plain",
							parents: ["shared-drive-123"],
							trashed: false,
						}],
					},
				}),
				get: async () => {
					const error = new Error("The caller does not have permission");
					Object.assign(error, { code: 403 });
					throw error;
				},
				export: async () => ({ status: 200, data: new Uint8Array([1]) }),
			},
		});
		const provider = new GoogleDriveStorageProvider(drive, "shared-drive-123");

		const result = await provider.read("node-001");

		expect(result.isLeft()).toBe(true);
		if (result.isLeft()) {
			expect(result.value.errorCode).toBe("UnknownError");
			expect(result.value.message).toContain("Google Drive export failed");
		}
	});
});
