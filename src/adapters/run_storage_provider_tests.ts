import { beforeAll, describe, expect, test } from "bun:test";
import process from "node:process";
import { type StorageProvider } from "../application/storage_provider.ts";
import { providerFrom } from "./parse_module_configuration.ts";
import { UuidGenerator } from "../shared/uuid_generator.ts";
import { NodeFileNotFoundError } from "../domain/nodes/node_file_not_found_error.ts";
import { AntboxError } from "shared/antbox_error.ts";

if (!process.env.NODE_ENV && process.argv.length < 3) {
  console.error("This script must be run with command line arguments.");
  process.exit(1);
}

if (!process.env.NODE_ENV) {
  await Bun.spawn({
    cmd: [
      process.argv0,
      "test",
      // "--inspect-wait",
      "./src/adapters/run_storage_provider_tests.ts",
    ],
    env: { TEST_PARAMS: process.argv.slice(2).join(";") },
  }).exited;

  process.exit(0);
}

let storage: StorageProvider;

beforeAll(async () => {
  const args = process.env.TEST_PARAMS?.split(";");
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
    const file = new File(["Something Writed"], "Something Writed.txt", {
      type: "text/plain",
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
      expect(readFile.type).toBe(file.type);
    }
  }, 15000);
});

describe("delete", () => {
  test("should delete", async () => {
    const uuid = UuidGenerator.generate();
    const file = new File(
      ["Something That will be deleted"],
      "Something that will be deleted.txt",
      {
        type: "text/plain",
      }
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
  }, 15000);

  test("should not delete", async () => {
    const deleteResult = await storage.delete("unkwown");
    expect(deleteResult.isLeft()).toBeTruthy();
    expect(deleteResult.value).toBeInstanceOf(AntboxError);
  });
});
