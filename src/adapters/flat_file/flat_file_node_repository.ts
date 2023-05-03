import { join } from "../../../deps.ts";
import { Node } from "../../domain/nodes/node.ts";
import { NodeFilter } from "../../domain/nodes/node_filter.ts";
import { NodeNotFoundError } from "../../domain/nodes/node_not_found_error.ts";
import {
  NodeFilterResult,
  NodeRepository,
} from "../../domain/nodes/node_repository.ts";
import { AntboxError } from "../../shared/antbox_error.ts";
import { Either, right } from "../../shared/either.ts";
import { fileExistsSync } from "../../shared/file_exists_sync.ts";
import { InMemoryNodeRepository } from "../inmem/inmem_node_repository.ts";

export default function buildFlatFileStorageProvider(
  baseDir: string
): Promise<Either<AntboxError, NodeRepository>> {
  return Promise.resolve(right(new FlatFileNodeRepository(baseDir)));
}

export class FlatFileNodeRepository implements NodeRepository {
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
      Deno.mkdirSync(this.#dbFolderPath, { recursive: true });
    }

    this.#base = new InMemoryNodeRepository(this.#readDb());

    this.#writeDb(this.#dbBackupFilePath);
  }

  #readDb(): Record<string, Node> {
    if (!fileExistsSync(this.#dbFilePath)) {
      return {};
    }

    const rawData = Deno.readFileSync(this.#dbFilePath);
    const data = this.#decoder.decode(rawData);

    return JSON.parse(data);
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

    Deno.writeFileSync(path || this.#dbFilePath, rawData);
  }

  delete(uuid: string): Promise<Either<NodeNotFoundError, void>> {
    const o = this.#base.delete(uuid);

    o.then(this.#saveDb);

    return o;
  }

  update(node: Node): Promise<Either<NodeNotFoundError, void>> {
    const o = this.#base.update(node);

    o.then(this.#saveDb);

    return o;
  }

  add(node: Node): Promise<Either<AntboxError, void>> {
    const o = this.#base.add(node);

    o.then(this.#saveDb);

    return o;
  }

  getByFid(fid: string): Promise<Either<NodeNotFoundError, Node>> {
    return this.#base.getByFid(fid);
  }

  getById(uuid: string): Promise<Either<NodeNotFoundError, Node>> {
    return this.#base.getById(uuid);
  }

  filter(
    filters: NodeFilter[],
    pageSize: number,
    pageToken: number
  ): Promise<NodeFilterResult> {
    return this.#base.filter(filters, pageSize, pageToken);
  }
}
