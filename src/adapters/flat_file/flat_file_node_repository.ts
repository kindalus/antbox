import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository";
import type { NodeLike } from "domain/nodes/node_like";
import type { AndNodeFilters, OrNodeFilters } from "domain/nodes/node_filter";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error";
import type {
  NodeRepository,
  NodeFilterResult,
} from "domain/nodes/node_repository";
import { AntboxError, UnknownError } from "shared/antbox_error";
import { type Either, left, right } from "shared/either";
import { fileExistsSync } from "shared/file_exists_sync";

import { join } from "path";
import { mkdirSync, writeFileSync } from "fs";
import type { NodeMetadata } from "domain/nodes/node_metadata";
import { NodeFactory } from "domain/node_factory";
import { copyFile } from "shared/os_helpers";

export default async function buildFlatFileStorageProvider(
  baseDir: string,
): Promise<Either<AntboxError, NodeRepository>> {
  const dbFilePath = join(baseDir, "nodes_repo.json");
  const dbBackupFilePath = join(baseDir, "nodes_repo.json.backup");

  try {
    if (!fileExistsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true });
    }

    let metadata = [];
    if (fileExistsSync(dbFilePath)) {
      const file = Bun.file(dbFilePath);
      metadata = await file.json();
      copyFile(dbFilePath, dbBackupFilePath);
    }

    return Promise.resolve(
      right(new FlatFileNodeRepository(dbFilePath, metadata)),
    );
  } catch (err) {
    return Promise.resolve(left(new UnknownError(err as string)));
  }
}

class FlatFileNodeRepository implements NodeRepository {
  private static readonly CHARSET = "utf-8";

  readonly #dbFilePath: string;
  readonly #encoder: TextEncoder;

  #base: InMemoryNodeRepository;

  constructor(dbPath: string, data: NodeMetadata[] = []) {
    this.#dbFilePath = dbPath;
    this.#encoder = new TextEncoder();

    this.#base = new InMemoryNodeRepository(
      data.reduce(
        (acc, m) => {
          acc[m.uuid] = NodeFactory.from(m).right;
          return acc;
        },
        {} as Record<string, NodeLike>,
      ),
    );
  }

  #dataAsArray(): Partial<NodeMetadata>[] {
    return Object.values(this.#base.data).map((m) => m.metadata);
  }

  #saveDb(path?: string) {
    const rows = this.#dataAsArray();
    const rawData = this.#encoder.encode(JSON.stringify(rows));
    writeFileSync(path || this.#dbFilePath, rawData);
  }

  delete(uuid: string): Promise<Either<NodeNotFoundError, void>> {
    return this.#base
      .delete(uuid)
      .then((result) => {
        if (result.isRight()) {
          this.#saveDb();
        }

        return result;
      })
      .catch((err) => {
        console.error(err);
        return left(new NodeNotFoundError(uuid));
      });
  }

  update(node: NodeLike): Promise<Either<NodeNotFoundError, void>> {
    return this.#base
      .update(node)
      .then((result) => {
        if (result.isRight()) {
          this.#saveDb();
        }

        return result;
      })
      .catch((err) => {
        console.error(err);
        return left(new NodeNotFoundError(node.uuid));
      });
  }

  add(node: NodeLike): Promise<Either<AntboxError, void>> {
    return this.#base
      .add(node)
      .then((result) => {
        if (result.isRight()) {
          this.#saveDb();
        }

        return result;
      })
      .catch((err) => {
        console.error(err);
        return left(new UnknownError(err));
      });
  }

  getByFid(fid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
    return this.#base.getByFid(fid);
  }

  getById(uuid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
    return this.#base.getById(uuid);
  }

  filter(
    filters: AndNodeFilters | OrNodeFilters,
    pageSize = 20,
    pageToken = 1,
  ): Promise<NodeFilterResult> {
    return this.#base.filter(filters, pageSize, pageToken);
  }
}
