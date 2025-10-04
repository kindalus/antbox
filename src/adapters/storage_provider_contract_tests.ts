import { beforeAll, describe, test } from "bdd";
import { expect } from "expect";
import { AntboxError } from "shared/antbox_error.ts";
import { type StorageProvider } from "application/storage_provider.ts";
import { UuidGenerator } from "shared/uuid_generator.ts";
import { providerFrom } from "./module_configuration_parser.ts";

let storage: StorageProvider;

beforeAll(async () => {
	const args = Deno.env.get("TEST_PARAMS")?.split(";");

	if (!args) {
		throw new Error("No test arguments provided.");
	}

	const [modulePath, ...params] = args;

	storage = (await providerFrom<StorageProvider>([modulePath, ...params]))!;
	if (!storage) {
		throw new Error("Could not load storage provider");
	}
});

describe("write", () => {
	test("should write", async () => {
		const uuid = UuidGenerator.generate();
		const file = new File(["Something Writed"], "Something Writed.docx", {
			type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		});
		const writeResult = await storage.write(uuid, file, {
			mimetype: file.type,
			parent: "--parent--",
			title: "Something Writed",
		});
		expect(writeResult.isRight()).toBeTruthy();

		const readResult = await storage.read(uuid);
		expect(readResult.isRight()).toBeTruthy();
		expect(readResult.value).toBeInstanceOf(File);

		if (readResult.isRight()) {
			const readFile = readResult.value;
			expect(readFile.size).toBe(file.size);
		}
	});
});

describe("delete", () => {
	test("should delete", async () => {
		const uuid = UuidGenerator.generate();
		const file = new File(
			["Something That will be deleted"],
			"Something that will be deleted.txt",
			{
				type: "text/plain",
			},
		);
		const writeResult = await storage.write(uuid, file, {
			mimetype: file.type,
			parent: "--parent--",
			title: "Something Will be Deleted",
		});
		expect(writeResult.isRight()).toBeTruthy();

		const readForWrite = await storage.read(uuid);
		expect(readForWrite.isRight()).toBeTruthy();
		expect(readForWrite.value).toBeInstanceOf(File);

		const deleteResult = await storage.delete(uuid);
		expect(deleteResult.isRight()).toBeTruthy();

		const readForDelete = await storage.read(uuid);
		expect(readForDelete.isLeft()).toBeTruthy();
		expect(readForDelete.value).toBeInstanceOf(AntboxError);
	});

	test("should not delete", async () => {
		const deleteResult = await storage.delete("unkwown");
		expect(deleteResult.isLeft()).toBeTruthy();
		expect(deleteResult.value).toBeInstanceOf(AntboxError);
	});
});
