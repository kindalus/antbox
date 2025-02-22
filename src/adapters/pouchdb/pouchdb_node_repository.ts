import PouchDB from "pouchdb";
import PouchDbFind from "pouchdb-find";

import { mkdirSync, lstatSync, statSync } from "fs";

import { NodeFactory } from "domain/node_factory";
import type {
  FilterOperator,
  NodeFilters,
  NodeFilter,
  OrNodeFilter,
} from "domain/nodes/node_filter";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error";
import type {
  NodeRepository,
  NodeFilterResult,
} from "domain/nodes/node_repository";
import type { AntboxError } from "shared/antbox_error";
import { type Either, right, left } from "shared/either";
import type { NodeLike } from "domain/nodes/node_like";
import type { NodeMetadata } from "domain/nodes/node_metadata";
import { Nodes } from "domain/nodes/nodes";

type Provider = "CouchDb" | "PouchDb";

export default async function buildPouchdbNodeRepository(
  dbpath: string,
): Promise<Either<AntboxError, NodeRepository>> {
  if (dbpath.startsWith("http")) {
    return Promise.resolve(
      right(new PouchdbNodeRepository(new PouchDB(dbpath), "CouchDb")),
    );
  }

  const path = dbpath + "/nodes";
  if (!directoryExists(path)) {
    mkdirSync(path, { recursive: true });
  }

  const db = new PouchDB<NodeMetadata>("nodes", {
    adapter: "leveldb",
    prefix: dbpath + "/",
  });

  return Promise.resolve(right(new PouchdbNodeRepository(db)));
}

function directoryExists(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch (error) {
    return false;
  }
}

class PouchdbNodeRepository implements NodeRepository {
  readonly #provider: Provider;

  constructor(
    private readonly db: PouchDB.Database<Partial<NodeMetadata>>,
    provider: Provider = "PouchDb",
  ) {
    this.#provider = provider;
    PouchDB.plugin(PouchDbFind);

    this.db
      .createIndex({
        index: { fields: ["title", "fid", "parent", "aspects"] },
      })
      .catch(console.error);
  }

  async delete(uuid: string): Promise<Either<NodeNotFoundError, void>> {
    const doc = await this.db.get(uuid);

    if (!doc) {
      return left(new NodeNotFoundError(uuid));
    }

    this.db.remove(doc);

    return right(undefined);
  }

  async update(node: NodeLike): Promise<Either<NodeNotFoundError, void>> {
    const doc = await this.readFromDb(node.uuid);

    if (doc.isLeft()) {
      return left(doc.value);
    }

    await this.db.put({
      _id: doc.value._id,
      _rev: doc.value._rev,
      ...node.metadata,
    } as any);

    return right(undefined);
  }

  async add(node: NodeLike): Promise<Either<AntboxError, void>> {
    await this.db.put({ _id: node.uuid, ...node } as unknown as Node);
    return right(undefined);
  }

  async getByFid(fid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
    const r = await this.db.find({ selector: { fid } });
    const docs = r.docs;

    const nodes = docs.map(docToNode);
    if (nodes.length === 0) {
      return left(new NodeNotFoundError(Nodes.fidToUuid(fid)));
    }

    return right(nodes[0]);
  }

  async getById(uuid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
    const doc = await this.readFromDb(uuid);

    if (doc.isLeft()) {
      return left(doc.value);
    }

    return right(docToNode(doc.value));
  }

  private async readFromDb(
    _id: string,
  ): Promise<
    Either<
      NodeNotFoundError,
      PouchDB.Core.ExistingDocument<Partial<NodeMetadata>>
    >
  > {
    try {
      return right(await this.db.get(_id));
    } catch (err) {
      if ((err as Record<string, unknown>).status === 404) {
        return left(new NodeNotFoundError(_id));
      }

      throw err;
    }
  }

  async filter(
    filters: NodeFilters | OrNodeFilter,
    pageSize: number,
    pageToken: number,
  ): Promise<NodeFilterResult> {
    const selectors = filters.map((s) =>
      filterToMango(this.#provider, s as NodeFilter),
    );

    const selector = composeMangoQuery(selectors);

    try {
      const result = await this.db.find({
        selector,
        limit: pageSize * pageToken,
      });

      const nodes = result.docs.map(docToNode);
      const pageCount = Math.ceil(nodes.length / pageSize);

      return {
        nodes: nodes.slice(pageSize * (pageToken - 1), pageSize * pageToken),
        pageCount,
        pageSize,
        pageToken,
      };
    } catch (err) {
      console.log(err);
    }

    return {
      nodes: [],
      pageCount: 0,
      pageSize,
      pageToken,
    };
  }
}

function composeMangoQuery(filters: MangoFilter[]): Record<string, unknown> {
  if (filters.length === 0) {
    return {};
  }

  if (filters.length === 1) {
    return filters[0];
  }

  return {
    $and: filters,
  };
}

function filterToMango(dbprovider: Provider, filter: NodeFilter): MangoFilter {
  const [field, operator, value] = filter;

  if (operator === "contains") {
    return { [field]: { $all: [value] } };
  }

  if (operator === "match" && typeof value === "string") {
    return {
      [field]: {
        $regex:
          dbprovider === "CouchDb" ? `(?i)${value}` : new RegExp(value, "i"),
      },
    };
  }

  const o = operators[operator] as string;
  return { [field]: { [o]: value } };
}

function docToNode(
  doc: PouchDB.Core.ExistingDocument<Partial<NodeMetadata>>,
): NodeLike {
  const { _id, _rev, ...node } = doc;
  return NodeFactory.from(doc).right;
}

const operators: Partial<Record<FilterOperator, string>> = {
  "==": "$eq",
  "!=": "$ne",
  ">": "$gt",
  ">=": "$gte",
  "<": "$lt",
  "<=": "$lte",
  in: "$in",
  "not-in": "$nin",
  "contains-all": "$all",
};

type MangoFilter = { [key: string]: { [key: string]: unknown } };

type MangoDocument = Node & { _id: string; _rev: string };

interface MangoResult {
  docs: MangoDocument[];
}
