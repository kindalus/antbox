import { S3 } from "npm:@aws-sdk/client-s3";

import { assert } from "../../../dev_deps.ts";
import { S3StorageProvider } from "./s3_storage_provider.ts";

import s3config from "./s3_storage_provider_key.transient.json" with { type: "json" };
import { DefaultUuidGenerator } from "../strategies/default_uuid_generator.ts";

test("S3StorageProvidser", async (t) => {
  const storage = new S3StorageProvider(new S3(s3config), s3config.bucket);

  const parent = new DefaultUuidGenerator().generate();

  const uuid_1 = new DefaultUuidGenerator().generate();
  const file_1_content =
    "<html><body><h1>Content exclusive for file 1</h1></body></html>";
  const file_1_type = "text/html";
  const file_1 = new File([file_1_content], "filename.txt", {
    type: file_1_type,
  });

  const uuid_2 = new DefaultUuidGenerator().generate();
  const file_2 = new File(["content"], "filename2.json");

  await t.step("write", async () => {
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

    assert(voidOrErr_1.isRight());
    assert(voidOrErr_2.isRight());
  });

  await t.step("read", async () => {
    const fileOrErr_1 = await storage.read(uuid_1);

    assert(fileOrErr_1.isRight());
    assert(fileOrErr_1.value.name === file_1.name);
    assert(fileOrErr_1.value.type === file_1.type);

    const content = await fileOrErr_1.value.text();
    assert(content === file_1_content);
  });

  await t.step("delete", async () => {
    const voidOrErr_1 = await storage.delete(uuid_1);
    const voidOrErr_2 = await storage.delete(uuid_2);

    assert(voidOrErr_1.isRight());
    assert(voidOrErr_2.isRight());
  });
});
