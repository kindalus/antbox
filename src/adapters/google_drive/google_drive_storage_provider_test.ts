import { describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { NodeService } from "application/nodes/node_service.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { NodeCreatedEvent } from "domain/nodes/node_created_event.ts";
import { NodeUpdatedEvent } from "domain/nodes/node_updated_event.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import { GoogleDriveStorageProvider } from "./google_drive_storage_provider.ts";

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

function captureNodeUpdatedHandler(provider: GoogleDriveStorageProvider) {
	let handle: ((event: NodeUpdatedEvent) => Promise<void>) | undefined;
	provider.startListeners((_eventId, handler) => {
		handle = (event) => Promise.resolve(handler.handle(event));
	});
	return (event: NodeUpdatedEvent) => handle!(event);
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

	it("reads a newly created file before files.list reflects it", async () => {
		const { drive, calls } = makeDrive();
		const provider = new GoogleDriveStorageProvider(drive, "shared-drive-123");

		const writeResult = await provider.write(
			"node-001",
			new File(["hello"], "hello.txt", { type: "text/plain" }),
			{ title: "Hello", parent: Nodes.ROOT_FOLDER_UUID, mimetype: "text/plain" },
		);
		const readResult = await provider.read("node-001");

		expect(writeResult.isRight()).toBe(true);
		expect(readResult.isRight()).toBe(true);
		expect(calls.list).toHaveLength(1);
		expect(calls.get[0]).toMatchObject({
			fileId: "drive-file-1",
			alt: "media",
			supportsAllDrives: true,
		});
	});

	it("exports real content from NodeCreatedEvent immediately after createFile", async () => {
		const uploaded = new Map<string, Uint8Array>();
		const { drive, calls } = makeDrive({
			files: {
				list: async (params: Record<string, unknown>) => {
					calls.list.push(params);
					return { data: { files: [] } };
				},
				create: async (params: Record<string, unknown>) => {
					calls.create.push(params);
					const uuid = (params.requestBody as { appProperties: { uuid: string } })
						.appProperties.uuid;
					const id = `${uuid}-drive-id`;
					const body = (params.media as { body?: AsyncIterable<Uint8Array> } | undefined)
						?.body;
					if (body) {
						const chunks: Uint8Array[] = [];
						for await (const chunk of body) {
							chunks.push(chunk);
						}
						const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
						const bytes = new Uint8Array(size);
						let offset = 0;
						for (const chunk of chunks) {
							bytes.set(chunk, offset);
							offset += chunk.byteLength;
						}
						uploaded.set(id, bytes);
					}
					return { status: 200, data: { id } };
				},
				get: async (params: Record<string, unknown>) => {
					calls.get.push(params);
					return { status: 200, data: uploaded.get(params.fileId as string)! };
				},
			},
		});
		const storage = new GoogleDriveStorageProvider(drive, "shared-drive-123");
		const bus = new InMemoryEventBus();
		const service = new NodeService({
			storage,
			repository: new InMemoryNodeRepository(),
			bus,
			configRepo: new InMemoryConfigurationRepository(),
		});
		const authCtx: AuthenticationContext = {
			mode: "Direct",
			tenant: "test",
			principal: {
				email: Users.ROOT_USER_EMAIL,
				groups: [Groups.ADMINS_GROUP_UUID],
			},
		};
		const parentOrErr = await service.create(authCtx, {
			uuid: "parent-folder",
			title: "Parent",
			parent: Nodes.ROOT_FOLDER_UUID,
			mimetype: Nodes.FOLDER_MIMETYPE,
		});
		expect(parentOrErr.isRight()).toBe(true);

		const exportedText = new Promise<string>((resolve, reject) => {
			bus.subscribe(NodeCreatedEvent.EVENT_ID, {
				handle: async (event: NodeCreatedEvent) => {
					if (event.payload.uuid !== "pdf-file") {
						return;
					}
					const exportedOrErr = await service.export(authCtx, event.payload.uuid);
					if (exportedOrErr.isLeft()) {
						reject(exportedOrErr.value);
						return;
					}
					resolve(await exportedOrErr.value.text());
				},
			});
		});

		const createOrErr = await service.createFile(
			authCtx,
			new File(["%PDF-real-content"], "document.pdf", { type: "application/pdf" }),
			{ uuid: "pdf-file", parent: "parent-folder" },
		);

		expect(createOrErr.isRight()).toBe(true);
		expect(await exportedText).toBe("%PDF-real-content");
		expect(calls.list).toHaveLength(2);
	});

	it("returns Google Drive creation failures to NodeService", async () => {
		const { drive, calls } = makeDrive({
			files: {
				list: async (params: Record<string, unknown>) => {
					calls.list.push(params);
					return { data: { files: [] } };
				},
				create: async (params: Record<string, unknown>) => {
					calls.create.push(params);
					const uuid = (params.requestBody as { appProperties: { uuid: string } })
						.appProperties.uuid;
					if (uuid === "failed-file") {
						throw new Error("remote create failed");
					}
					return { status: 200, data: { id: `${uuid}-drive-id` } };
				},
			},
		});
		const storage = new GoogleDriveStorageProvider(drive, "shared-drive-123");
		const service = new NodeService({
			storage,
			repository: new InMemoryNodeRepository(),
			bus: new InMemoryEventBus(),
			configRepo: new InMemoryConfigurationRepository(),
		});
		const authCtx: AuthenticationContext = {
			mode: "Direct",
			tenant: "test",
			principal: {
				email: Users.ROOT_USER_EMAIL,
				groups: [Groups.ADMINS_GROUP_UUID],
			},
		};
		await service.create(authCtx, {
			uuid: "parent-folder",
			title: "Parent",
			parent: Nodes.ROOT_FOLDER_UUID,
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		const createOrErr = await service.createFile(
			authCtx,
			new File(["content"], "failed.txt", { type: "text/plain" }),
			{ uuid: "failed-file", parent: "parent-folder" },
		);

		expect(createOrErr.isLeft()).toBe(true);
		if (createOrErr.isLeft()) {
			expect(createOrErr.value.message).toContain("remote create failed");
		}
		expect((await service.get(authCtx, "failed-file")).isLeft()).toBe(true);
	});

	it("creates child files directly under the resolved parent folder", async () => {
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
		expect(calls.create[0].requestBody).toMatchObject({
			parents: ["parent-folder-drive-id"],
			appProperties: { uuid: "child-001" },
		});
		expect(calls.update).toHaveLength(0);
	});

	it("awaits moving a file between cached folders", async () => {
		let finishMove: (() => void) | undefined;
		const movePending = new Promise<void>((resolve) => {
			finishMove = resolve;
		});
		const { drive, calls } = makeDrive({
			files: {
				list: async (params: Record<string, unknown>) => {
					calls.list.push(params);
					return { data: { files: [] } };
				},
				create: async (params: Record<string, unknown>) => {
					calls.create.push(params);
					const uuid = (params.requestBody as { appProperties: { uuid: string } })
						.appProperties.uuid;
					return { status: 200, data: { id: `${uuid}-drive-id` } };
				},
				update: async (params: Record<string, unknown>) => {
					calls.update.push(params);
					await movePending;
					return { status: 200, data: { id: params.fileId } };
				},
			},
		});
		const provider = new GoogleDriveStorageProvider(drive, "shared-drive-123");
		await provider.mkdir("parent-a", { title: "A", parent: Nodes.ROOT_FOLDER_UUID });
		await provider.mkdir("parent-b", { title: "B", parent: Nodes.ROOT_FOLDER_UUID });
		await provider.write(
			"file-001",
			new File(["content"], "file.txt", { type: "text/plain" }),
			{ title: "File", parent: "parent-a", mimetype: "text/plain" },
		);
		const handleUpdate = captureNodeUpdatedHandler(provider);

		let settled = false;
		const handling = handleUpdate(
			new NodeUpdatedEvent("user@example.com", "tenant", {
				uuid: "file-001",
				oldValues: { parent: "parent-a" },
				newValues: { parent: "parent-b" },
			}),
		).then(() => settled = true);
		await Promise.resolve();

		expect(settled).toBe(false);
		finishMove!();
		await handling;
		expect(calls.update).toHaveLength(1);
		expect(calls.update[0]).toEqual({
			fileId: "file-001-drive-id",
			supportsAllDrives: true,
			addParents: "parent-b-drive-id",
			removeParents: "parent-a-drive-id",
		});
	});

	it("updates parent and title in one correctly shaped request", async () => {
		const { drive, calls } = makeDrive({
			files: {
				list: async (params: Record<string, unknown>) => {
					calls.list.push(params);
					return { data: { files: [] } };
				},
				create: async (params: Record<string, unknown>) => {
					calls.create.push(params);
					const uuid = (params.requestBody as { appProperties: { uuid: string } })
						.appProperties.uuid;
					return { status: 200, data: { id: `${uuid}-drive-id` } };
				},
				update: async (params: Record<string, unknown>) => {
					calls.update.push(params);
					return { status: 200, data: { id: params.fileId } };
				},
				get: async (params: Record<string, unknown>) => {
					calls.get.push(params);
					return { status: 200, data: new Uint8Array([1]) };
				},
			},
		});
		const provider = new GoogleDriveStorageProvider(drive, "shared-drive-123");
		await provider.mkdir("parent-a", { title: "A", parent: Nodes.ROOT_FOLDER_UUID });
		await provider.mkdir("parent-b", { title: "B", parent: Nodes.ROOT_FOLDER_UUID });
		await provider.write(
			"file-001",
			new File(["content"], "file.txt", { type: "text/plain" }),
			{ title: "File", parent: "parent-a", mimetype: "text/plain" },
		);
		const handleUpdate = captureNodeUpdatedHandler(provider);

		await handleUpdate(
			new NodeUpdatedEvent("user@example.com", "tenant", {
				uuid: "file-001",
				oldValues: { parent: "parent-a", title: "File" },
				newValues: { parent: "parent-b", title: "Renamed" },
			}),
		);

		expect(calls.update[0]).toEqual({
			fileId: "file-001-drive-id",
			supportsAllDrives: true,
			addParents: "parent-b-drive-id",
			removeParents: "parent-a-drive-id",
			requestBody: { name: "Renamed" },
		});

		await handleUpdate(
			new NodeUpdatedEvent("user@example.com", "tenant", {
				uuid: "file-001",
				oldValues: { parent: "parent-b" },
				newValues: { parent: Nodes.ROOT_FOLDER_UUID },
			}),
		);
		const readResult = await provider.read("file-001");

		expect(calls.update[1]).toEqual({
			fileId: "file-001-drive-id",
			supportsAllDrives: true,
			addParents: "shared-drive-123",
			removeParents: "parent-b-drive-id",
		});
		expect(readResult.isRight()).toBe(true);
		if (readResult.isRight()) {
			expect(readResult.value.name).toBe("Renamed");
		}
	});

	it("keeps cached parent metadata unchanged when a move fails", async () => {
		let updateCalls = 0;
		const { drive, calls } = makeDrive({
			files: {
				list: async (params: Record<string, unknown>) => {
					calls.list.push(params);
					return { data: { files: [] } };
				},
				create: async (params: Record<string, unknown>) => {
					calls.create.push(params);
					const uuid = (params.requestBody as { appProperties: { uuid: string } })
						.appProperties.uuid;
					return { status: 200, data: { id: `${uuid}-drive-id` } };
				},
				update: async (params: Record<string, unknown>) => {
					calls.update.push(params);
					updateCalls++;
					if (updateCalls === 1) {
						throw new Error("move failed");
					}
					return { status: 200, data: { id: params.fileId } };
				},
			},
		});
		const provider = new GoogleDriveStorageProvider(drive, "shared-drive-123");
		await provider.mkdir("parent-a", { title: "A", parent: Nodes.ROOT_FOLDER_UUID });
		await provider.mkdir("parent-b", { title: "B", parent: Nodes.ROOT_FOLDER_UUID });
		await provider.write(
			"file-001",
			new File(["content"], "file.txt", { type: "text/plain" }),
			{ title: "File", parent: "parent-a", mimetype: "text/plain" },
		);
		const handleUpdate = captureNodeUpdatedHandler(provider);

		await handleUpdate(
			new NodeUpdatedEvent("user@example.com", "tenant", {
				uuid: "file-001",
				oldValues: { parent: "parent-a" },
				newValues: { parent: "parent-b" },
			}),
		);
		await handleUpdate(
			new NodeUpdatedEvent("user@example.com", "tenant", {
				uuid: "file-001",
				oldValues: { parent: "parent-a" },
				newValues: { parent: Nodes.ROOT_FOLDER_UUID },
			}),
		);

		expect(calls.update).toHaveLength(2);
		expect(calls.update[1]).toMatchObject({
			addParents: "shared-drive-123",
			removeParents: "parent-a-drive-id",
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

		const result = await provider.mkdir("folder-001", {
			title: "Folder",
			parent: Nodes.ROOT_FOLDER_UUID,
		});

		expect(result.isRight()).toBe(true);
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

	it("creates a child folder before files.list reflects its parent", async () => {
		const { drive, calls } = makeDrive({
			files: {
				list: async (params: Record<string, unknown>) => {
					calls.list.push(params);
					return { data: { files: [] } };
				},
				create: async (params: Record<string, unknown>) => {
					calls.create.push(params);
					const uuid = (params.requestBody as { appProperties: { uuid: string } })
						.appProperties.uuid;
					return { status: 200, data: { id: `${uuid}-drive-id` } };
				},
			},
		});
		const provider = new GoogleDriveStorageProvider(drive, "shared-drive-123");

		const parentResult = await provider.mkdir("parent-folder", {
			title: "Parent",
			parent: Nodes.ROOT_FOLDER_UUID,
		});
		const childResult = await provider.mkdir("child-folder", {
			title: "Child",
			parent: "parent-folder",
		});

		expect(parentResult.isRight()).toBe(true);
		expect(childResult.isRight()).toBe(true);
		expect(calls.create[1].requestBody).toMatchObject({
			parents: ["parent-folder-drive-id"],
			appProperties: { uuid: "child-folder" },
		});
	});

	it("rejects mkdir when a Drive folder already exists for the uuid", async () => {
		const { drive, calls } = makeDrive({
			files: {
				list: async (params: Record<string, unknown>) => {
					calls.list.push(params);
					return {
						data: {
							files: [{
								id: "existing-drive-folder",
								name: "Existing Folder",
								mimeType: "application/vnd.google-apps.folder",
								parents: ["shared-drive-123"],
								trashed: false,
							}],
						},
					};
				},
				create: async (params: Record<string, unknown>) => {
					calls.create.push(params);
					return { status: 200, data: { id: "ignored" } };
				},
			},
		});
		const provider = new GoogleDriveStorageProvider(drive, "shared-drive-123");

		const result = await provider.mkdir("folder-001", {
			title: "Folder",
			parent: Nodes.ROOT_FOLDER_UUID,
		});

		expect(result.isLeft()).toBe(true);
		if (result.isLeft()) {
			expect(result.value.errorCode).toBe("DuplicatedNodeError");
		}
		expect(calls.create).toHaveLength(0);
	});

	it("rejects rmdir when more than one Drive folder matches the uuid", async () => {
		const { drive, calls } = makeDrive({
			files: {
				list: async (params: Record<string, unknown>) => {
					calls.list.push(params);
					return {
						data: {
							files: [
								{
									id: "first-drive-folder",
									name: "First Folder",
									mimeType: "application/vnd.google-apps.folder",
									parents: ["shared-drive-123"],
									trashed: false,
								},
								{
									id: "second-drive-folder",
									name: "Second Folder",
									mimeType: "application/vnd.google-apps.folder",
									parents: ["shared-drive-123"],
									trashed: false,
								},
							],
						},
					};
				},
				update: async (params: Record<string, unknown>) => {
					calls.update.push(params);
					return { status: 200, data: { id: params.fileId } };
				},
			},
		});
		const provider = new GoogleDriveStorageProvider(drive, "shared-drive-123");

		const result = await provider.rmdir("folder-001");

		expect(result.isLeft()).toBe(true);
		if (result.isLeft()) {
			expect(result.value.errorCode).toBe("DuplicatedNodeError");
		}
		expect(calls.update).toHaveLength(0);
	});

	it("recursively trashes Drive descendants when rmdir is called", async () => {
		const { drive, calls } = makeDrive({
			files: {
				list: async (params: Record<string, unknown>) => {
					calls.list.push(params);
					const q = params.q as string;

					if (q.includes("appProperties") && q.includes("folder-001")) {
						return {
							data: {
								files: [{
									id: "root-drive-folder",
									name: "Folder",
									mimeType: "application/vnd.google-apps.folder",
									parents: ["shared-drive-123"],
									trashed: false,
								}],
							},
						};
					}

					if (q.includes("'root-drive-folder' in parents")) {
						return {
							data: {
								files: [
									{
										id: "child-drive-folder",
										name: "Child Folder",
										mimeType: "application/vnd.google-apps.folder",
										parents: ["root-drive-folder"],
										trashed: false,
									},
									{
										id: "child-drive-file",
										name: "Child File",
										mimeType: "text/plain",
										parents: ["root-drive-folder"],
										trashed: false,
									},
								],
							},
						};
					}

					if (q.includes("'child-drive-folder' in parents")) {
						return {
							data: {
								files: [{
									id: "grandchild-drive-file",
									name: "Grandchild File",
									mimeType: "text/plain",
									parents: ["child-drive-folder"],
									trashed: false,
								}],
							},
						};
					}

					return { data: { files: [] } };
				},
				update: async (params: Record<string, unknown>) => {
					calls.update.push(params);
					return { status: 200, data: { id: params.fileId } };
				},
			},
		});
		const provider = new GoogleDriveStorageProvider(drive, "shared-drive-123");

		const result = await provider.rmdir("folder-001");

		expect(result.isRight()).toBe(true);
		expect(calls.update.map((call) => call.fileId)).toEqual([
			"grandchild-drive-file",
			"child-drive-folder",
			"child-drive-file",
			"root-drive-folder",
		]);
		expect(calls.update.every((call) => {
			return (call.requestBody as Record<string, unknown>)?.trashed === true;
		})).toBe(true);
	});

	it("invalidates cached descendants after removing a folder tree", async () => {
		const { drive, calls } = makeDrive({
			files: {
				list: async (params: Record<string, unknown>) => {
					calls.list.push(params);
					const q = params.q as string;
					if (q.includes("'parent-folder-drive-id' in parents")) {
						return {
							data: {
								files: [{
									id: "child-folder-drive-id",
									name: "Child",
									mimeType: "application/vnd.google-apps.folder",
									parents: ["parent-folder-drive-id"],
									trashed: false,
								}],
							},
						};
					}
					return { data: { files: [] } };
				},
				create: async (params: Record<string, unknown>) => {
					calls.create.push(params);
					const uuid = (params.requestBody as { appProperties: { uuid: string } })
						.appProperties.uuid;
					return { status: 200, data: { id: `${uuid}-drive-id` } };
				},
				update: async (params: Record<string, unknown>) => {
					calls.update.push(params);
					return { status: 200, data: { id: params.fileId } };
				},
				get: async (params: Record<string, unknown>) => {
					calls.get.push(params);
					return { status: 200, data: new Uint8Array([1]) };
				},
			},
		});
		const provider = new GoogleDriveStorageProvider(drive, "shared-drive-123");
		await provider.mkdir("parent-folder", {
			title: "Parent",
			parent: Nodes.ROOT_FOLDER_UUID,
		});
		await provider.mkdir("child-folder", {
			title: "Child",
			parent: "parent-folder",
		});

		const removeResult = await provider.rmdir("parent-folder");
		const childReadResult = await provider.read("child-folder");

		expect(removeResult.isRight()).toBe(true);
		expect(childReadResult.isLeft()).toBe(true);
		expect(calls.get).toHaveLength(0);
	});

	it("recursively trashes folder trees from rmdir", async () => {
		const { drive, calls } = makeDrive({
			files: {
				list: async (params: Record<string, unknown>) => {
					calls.list.push(params);
					const q = params.q as string;

					if (q.includes("appProperties") && q.includes("folder-001")) {
						return {
							data: {
								files: [{
									id: "root-drive-folder",
									name: "Folder",
									mimeType: "application/vnd.google-apps.folder",
									parents: ["shared-drive-123"],
									trashed: false,
								}],
							},
						};
					}

					if (q.includes("'root-drive-folder' in parents")) {
						return {
							data: {
								files: [{
									id: "child-drive-file",
									name: "Child File",
									mimeType: "text/plain",
									parents: ["root-drive-folder"],
									trashed: false,
								}],
							},
						};
					}

					return { data: { files: [] } };
				},
				update: async (params: Record<string, unknown>) => {
					calls.update.push(params);
					return { status: 200, data: { id: params.fileId } };
				},
			},
		});
		const provider = new GoogleDriveStorageProvider(drive, "shared-drive-123");

		const result = await provider.rmdir("folder-001");

		expect(result.isRight()).toBe(true);
		expect(calls.update.map((call) => call.fileId)).toEqual([
			"child-drive-file",
			"root-drive-folder",
		]);
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

	it("invalidates cached metadata after deleting a file", async () => {
		const { drive, calls } = makeDrive();
		const provider = new GoogleDriveStorageProvider(drive, "shared-drive-123");
		await provider.write(
			"node-001",
			new File(["hello"], "hello.txt", { type: "text/plain" }),
			{ title: "Hello", parent: Nodes.ROOT_FOLDER_UUID, mimetype: "text/plain" },
		);

		const deleteResult = await provider.delete("node-001");
		const readResult = await provider.read("node-001");

		expect(deleteResult.isRight()).toBe(true);
		expect(readResult.isLeft()).toBe(true);
		expect(calls.list).toHaveLength(2);
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

	it("returns metadata lookup failures as Antbox errors", async () => {
		const { drive } = makeDrive({
			files: {
				list: async () => {
					throw new Error("Drive list unavailable");
				},
				get: async () => ({ status: 200, data: new Uint8Array([1]) }),
			},
		});
		const provider = new GoogleDriveStorageProvider(drive, "shared-drive-123");

		const result = await provider.read("node-001");

		expect(result.isLeft()).toBe(true);
		if (result.isLeft()) {
			expect(result.value.errorCode).toBe("UnknownError");
			expect(result.value.message).toContain("Drive list unavailable");
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

	it("invalidates cached metadata when Drive reports an external deletion", async () => {
		const { drive, calls } = makeDrive({
			files: {
				list: async (params: Record<string, unknown>) => {
					calls.list.push(params);
					return { data: { files: [] } };
				},
				create: async (params: Record<string, unknown>) => {
					calls.create.push(params);
					return { status: 200, data: { id: "drive-file-1" } };
				},
				get: async (params: Record<string, unknown>) => {
					calls.get.push(params);
					const error = new Error("not found");
					Object.assign(error, { code: 404 });
					throw error;
				},
			},
		});
		const provider = new GoogleDriveStorageProvider(drive, "shared-drive-123");
		await provider.write(
			"node-001",
			new File(["hello"], "hello.txt", { type: "text/plain" }),
			{ title: "Hello", parent: Nodes.ROOT_FOLDER_UUID, mimetype: "text/plain" },
		);

		const firstRead = await provider.read("node-001");
		const secondRead = await provider.read("node-001");

		expect(firstRead.isLeft()).toBe(true);
		expect(secondRead.isLeft()).toBe(true);
		expect(calls.get).toHaveLength(1);
		expect(calls.list).toHaveLength(2);
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
