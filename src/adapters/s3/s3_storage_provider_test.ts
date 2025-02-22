import { test, expect, describe } from "bun:test";
import buildS3StorageProvider from "./s3_storage_provider.ts";

import { UuidGenerator } from "shared/uuid_generator.ts";

describe("S3StorageProvider", async () => {
  const path = "./s3_storage_provider_key.transient.json";
  const storageOrErr = await buildS3StorageProvider(path);
  const storage = storageOrErr.right;

  const parent = UuidGenerator.generate();
  const uuid_1 = UuidGenerator.generate();
  const file_1_content =
    "<html><body><h1>Content exclusive for file 1</h1></body></html>";
  const file_1_type = "text/html";
  const file_1 = new File([file_1_content], "filename.txt", {
    type: file_1_type,
  });

  const uuid_2 = UuidGenerator.generate();
  const file_2 = new File(["content"], "filename2.json");

  test("write", async () => {
    const voidOrErr_1 = await storage.write(uuid_1, file_1, {
      parent,
      title: file_1.name,
      mimetype: file_1.type,
    });
    const voidOrErr_2 = await storage.write(uuid_2, file_2, {
      parent,
      title: file_2.name,
      mimetype: file_2.type,
    });

    expect(voidOrErr_1.isRight()).toBeTruthy();
    expect(voidOrErr_2.isRight()).toBeTruthy();
  });

  test("read", async () => {
    const fileOrErr_1 = await storage.read(uuid_1);

    expect(fileOrErr_1.isRight()).toBeTruthy();
    expect(fileOrErr_1.right.name === file_1.name).toBeTruthy();
    expect(fileOrErr_1.right.type === file_1.type).toBeTruthy();

    const content = await fileOrErr_1.right.text();
    expect(content === file_1_content).toBeTruthy();
  });

  test("delete", async () => {
    const voidOrErr_1 = await storage.delete(uuid_1);
    const voidOrErr_2 = await storage.delete(uuid_2);

    expect(voidOrErr_1.isRight()).toBeTruthy();
    expect(voidOrErr_2.isRight()).toBeTruthy();
  });
});
