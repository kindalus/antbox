import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository";
import type { NodeLike } from "domain/nodes/node_like";
import type { NodeFilter } from "domain/nodes/node_filter";
import type { NodeNotFoundError } from "domain/nodes/node_not_found_error";
import type {
  NodeRepository,
  NodeFilterResult,
} from "domain/nodes/node_repository";
import type { AntboxError } from "shared/antbox_error";
import { type Either, right } from "shared/either";
import { fileExistsSync } from "shared/file_exists_sync";

import { join } from "path";
import { mkdirSync, writeFileSync } from "fs";

export default function buildFlatFileStorageProvider(
  baseDir: string,
): Promise<Either<AntboxError, NodeRepository>> {
  return Promise.resolve(right(new FlatFileNodeRepository(baseDir)));
}

class FlatFileNodeRepository implements NodeRepository {
  private static readonly CHARSET = "utf-8";

  readonly #dbFilePath: string;
  readonly #dbFolderPath: string;
  readonly #dbBackupFilePath: string;
  readonly #encoder: TextEncoder;
  readonly #decoder: TextDecoder;

  #base: InMemoryNodeRepository;

  constructor(path: string) {
    this.#dbFolderPath = path;
    this.#dbFilePath = join(path, "nodes_repo.json");
    this.#dbBackupFilePath = join(path, "nodes_repo.json.backup");

    this.#encoder = new TextEncoder();
    this.#decoder = new TextDecoder(FlatFileNodeRepository.CHARSET);

    if (!fileExistsSync(this.#dbFolderPath)) {
      mkdirSync(this.#dbFolderPath, { recursive: true });
    }

    this.#base = new InMemoryNodeRepository();
    this.#readDb().then((data) => {
      this.#base = new InMemoryNodeRepository(data);
    });

    this.#writeDb(this.#dbBackupFilePath);
  }

  #readDb(): Promise<Record<string, NodeLike>> {
    if (!fileExistsSync(this.#dbFilePath)) {
      return Promise.resolve({});
    }

    const file = Bun.file(this.#dbFilePath);
    return file.json();
  }

  get #saveDb(): <E, T>(v: Either<E, T>) => void {
    return <E, T>(v: Either<E, T>) => {
      if (v.isRight()) {
        this.#writeDb();
      }
    };
  }

  #writeDb(path?: string) {
    const rawData = this.#encoder.encode(JSON.stringify(this.#base.data));
    writeFileSync(path || this.#dbFilePath, rawData);
  }

  delete(uuid: string): Promise<Either<NodeNotFoundError, void>> {
    const o = this.#base.delete(uuid);

    o.then(this.#saveDb);

    return o;
  }

  update(node: NodeLike): Promise<Either<NodeNotFoundError, void>> {
    const o = this.#base.update(node);

    o.then(this.#saveDb);

    return o;
  }

  add(node: NodeLike): Promise<Either<AntboxError, void>> {
    const o = this.#base.add(node);

    o.then(this.#saveDb);

    return o;
  }

  getByFid(fid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
    return this.#base.getByFid(fid);
  }

  getById(uuid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
    return this.#base.getById(uuid);
  }

  filter(
    filters: NodeFilter[],
    pageSize: number,
    pageToken: number,
  ): Promise<NodeFilterResult> {
    return this.#base.filter(filters, pageSize, pageToken);
  }
}
