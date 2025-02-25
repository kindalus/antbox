import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { providerFrom } from "./parse_module_configuration";
import { type NodeRepository } from "domain/nodes/node_repository";
import { FolderNode } from "domain/nodes/folder_node";
import { FileNode } from "domain/nodes/file_node";
import { UuidGenerator } from "shared/uuid_generator";
import { AspectNode } from "domain/aspects/aspect_node";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error";
import type { Either } from "shared/either";
import { Nodes } from "domain/nodes/nodes";
import { appendCorsPreflightHeaders } from "h3";

/*
 * Run unit tests for the NodeRepository implementation.
 * Must be run with command line arguments, in the form [path/to/implementation] ...params
 * Example:
 * bun run run-node-repository-tests mongodb/mongodb_node_repository_test.ts dburi
 * bun run run-node-repository-tests s3/s3_storage_provider_test.ts path/to/key.transient.json
 *
 * The arguments are compatible with the implementation's file default function.
 */

if (!process.env.NODE_ENV && process.argv.length < 3) {
  console.error("This script must be run with command line arguments.");
  process.exit(1);
}

if (!process.env.NODE_ENV) {
  await Bun.spawn({
    cmd: [
      process.argv0,
      "test",
      "--inspect-wait",
      "./src/adapters/run_node_repository_tests.ts",
    ],
    env: { TEST_PARAMS: process.argv.slice(2).join(";") },
  }).exited;

  process.exit(0);
}

let repo: NodeRepository;
const uuids = Array.from({ length: 5 }, () => UuidGenerator.generate());

beforeAll(async () => {
  const args = process.env.TEST_PARAMS?.split(";");
  if (!args) {
    throw new Error("No test arguments provided.");
  }

  const [modulePath, ...params] = args;

  repo = (await providerFrom<NodeRepository>([modulePath, ...params]))!;
  if (!repo) {
    throw new Error("Could not load repository");
  }

  await cleanDb();
  await populateDb();
  await new Promise((resolve) => setTimeout(resolve, 50));
});

describe("filter", () => {
  test("get all nodes", async () => {
    const nodes = await repo.filter([]);
    expect(nodes.nodes.length).toBe(5);
  });

  test("get folders only", async () => {
    const nodes = await repo.filter([
      ["mimetype", "==", Nodes.FOLDER_MIMETYPE],
    ]);
    expect(nodes.nodes).toBeArrayOfSize(2);
    expect(nodes.nodes[0]).toBeInstanceOf(FolderNode);
  });

  test("get images or with name 'Folder 1'", async () => {
    const nodes = await repo.filter([
      [["mimetype", "==", "image/jpeg"]],
      [["title", "==", "Folder 1"]],
    ]);
    expect(nodes.nodes.length).toBe(2);
  });

  test("get all nodes, second page", async () => {
    let result = await repo.filter([]);
    expect(result.nodes.length).toBe(5);

    result = await repo.filter([], 4, 2);
    expect(result.nodes.length).toBe(1);
  });
});

describe("getById", () => {
  test("should find", async () => {
    const testCases = [
      [uuids[0], Nodes.FOLDER_MIMETYPE, "Folder 1"],
      [uuids[3], "image/jpeg", "Image.jpg"],
      [uuids[4], Nodes.ASPECT_MIMETYPE, "Aspect 1"],
    ];

    for (const [uuid, mimetype, title] of testCases) {
      const n = await repo.getById(uuid);
      expect(n.isRight()).toBeTruthy();
      expect(n.right.uuid).toBe(uuid);
      expect(n.right.title).toBe(title);
      expect(n.right.mimetype).toBe(mimetype);
    }
  });

  test("should not find", async () => {
    const n = await repo.getById("unknown");

    expect(n.isRight()).toBeFalsy();
    expect(n.value).toBeInstanceOf(NodeNotFoundError);
  });
});

describe("getByFid", () => {
  test("should find", async () => {
    const n = (await repo.getByFid("image-jpg")).right;

    expect(n.uuid).toBe(uuids[3]);
    expect(n.title).toBe("Image.jpg");
  });

  test("should not find", async () => {
    const n = await repo.getByFid("unknown");

    expect(n.isRight()).toBeFalsy();
    expect(n.value).toBeInstanceOf(NodeNotFoundError);
  });
});

describe("update", () => {
  test("should update", async () => {
    const n = (await repo.getById(uuids[0])).right;

    const uuid = UuidGenerator.generate();
    const original = FileNode.create({
      uuid,
      title: "Original",
      mimetype: "text/plain",
      owner: "tester@domain.com",
      group: "testers",
    }).right;

    let result: Either<unknown, unknown> = await repo.add(original);
    expect(result.isRight()).toBeTruthy();

    const updated = FileNode.create({
      uuid,
      title: "Updated",
      owner: "tester@domain.com",
      group: "testers",
      mimetype: "text/css",
    }).right;

    result = await repo.update(updated);
    expect(result.isRight()).toBeTruthy();

    const retrieved = (await repo.getById(uuid)).right;
    expect(retrieved.title).toBe("Updated");
    expect(retrieved.mimetype).toBe("text/css");
  });
});

describe("delete", () => {
  test("should delete", async () => {
    const uuid = UuidGenerator.generate();
    const original = FileNode.create({
      uuid,
      title: "Original",
      mimetype: "text/plain",
      owner: "tester@domain.io",
      group: "testers",
    }).right;

    let result: Either<unknown, unknown> = await repo.add(original);
    expect(result.isRight()).toBeTruthy();

    result = await repo.delete(uuid);
    expect(result.isRight()).toBeTruthy();

    const n = await repo.getById(uuid);
    expect(n.isRight()).toBeFalsy();
    expect(n.value).toBeInstanceOf(NodeNotFoundError);
  });

  test("should not delete", async () => {
    const result = await repo.delete("unknown");
    expect(result.isRight()).toBeFalsy();
    expect(result.value).toBeInstanceOf(NodeNotFoundError);
  });
});

async function cleanDb() {
  const nodes = await repo.filter([], 1_000_000);
  await Promise.allSettled(nodes.nodes.map((n) => repo.delete(n.uuid)));
}

async function populateDb() {
  const owner = "tester@antbox.io";
  const group = "testers";

  const nodes = [];

  nodes.push(
    FolderNode.create({ uuid: uuids[0], title: "Folder 1", owner, group }),
    FolderNode.create({ uuid: uuids[1], title: "Folder 2", owner, group }),

    FileNode.create({
      uuid: uuids[2],
      title: "Essay.pdf",
      mimetype: "application/pdf",
      owner,
      group,
    }),

    FileNode.create({
      uuid: uuids[3],
      fid: "image-jpg",
      title: "Image.jpg",
      mimetype: "image/jpeg",
      owner,
      group,
    }),

    AspectNode.create({
      uuid: uuids[4],
      title: "Aspect 1",
      owner,
      group,
    })
  );

  await Promise.allSettled(nodes.map((n) => repo.add(n.right)));
}

afterAll(async () => {
  await cleanDb();
});
