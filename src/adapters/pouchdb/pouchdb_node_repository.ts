import PouchDB from "pouchdb";
import PouchDbFind from "pouchdb-find";

import { mkdirSync, statSync } from "fs";

import { NodeFactory } from "domain/node_factory";
import {
  type FilterOperator,
  type AllNodeFilters,
  type NodeFilter,
  type AnyNodeFilters,
  isAnyNodeFilter as areOrNodeFilter,
  type NodeFilters,
} from "domain/nodes/node_filter";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error";
import type { NodeRepository, NodeFilterResult } from "domain/nodes/node_repository";
import { UnknownError, type AntboxError } from "shared/antbox_error";
import { type Either, right, left } from "shared/either";
import type { NodeLike } from "domain/nodes/node_like";
import type { NodeMetadata } from "domain/nodes/node_metadata";
import { Nodes } from "domain/nodes/nodes";
import type { AspectProperty } from "domain/aspects/aspect";
import type { NodeProperties } from "domain/nodes/node_properties";
import { DuplicatedNodeError } from "domain/nodes/duplicated_node_error";

type Provider = "CouchDb" | "PouchDb";
PouchDB.plugin(PouchDbFind);

export default async function buildPouchdbNodeRepository(
  dbpath: string,
): Promise<Either<AntboxError, NodeRepository>> {
  if (!dbpath) {
    return Promise.resolve(left(new UnknownError("No database path provided")));
  }

  if (dbpath.startsWith("http")) {
    return Promise.resolve(right(new PouchdbNodeRepository(new PouchDB(dbpath), "CouchDb")));
  }

  const path = dbpath + "/nodes";
  if (!directoryExists(path)) {
    mkdirSync(path, { recursive: true });
  }

  const db = new PouchDB<NodeDbModel>("nodes", {
    adapter: "leveldb",
    prefix: dbpath + "/",
  });

  await db
    .createIndex({ index: { fields: ["title", "fid", "parent", "aspects"] } })
    .catch((err) => {
      console.error(err);
      throw err;
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

interface NodeDbModel {
  _id: string;
  fid: string;
  title: string;
  description?: string;
  mimetype: string;
  size?: number;
  parent: string;
  createdTime: string;
  modifiedTime: string;
  owner: string;
  aspects?: string[];
  tags?: string[];
  related?: string[];
  properties?: NodeProperties | AspectProperty[];
  fulltext: string;

  xfilters: NodeFilters;

  group: string;
  groups?: string[];
  email?: string;
  secret?: string;

  onCreate?: string[];
  onUpdate?: string[];
  permissions?: Permissions;

  runManually?: boolean;
  runAs?: string;
  params?: string[];
  groupsAllowed?: string[];

  runOnCreates?: boolean;
  runOnUpdates?: boolean;
}

class PouchdbNodeRepository implements NodeRepository {
  readonly #provider: Provider;

  constructor(
    private readonly db: PouchDB.Database<NodeDbModel>,
    provider: Provider = "PouchDb",
  ) {
    this.#provider = provider;
  }

  async delete(uuid: string): Promise<Either<NodeNotFoundError, void>> {
    const doc = await this.#readFromDb(uuid);

    if (doc.isLeft()) {
      return left(doc.value);
    }

    this.db.remove({ _id: doc.value._id, _rev: doc.value._rev });

    return right(undefined);
  }

  async update(node: NodeLike): Promise<Either<NodeNotFoundError, void>> {
    const doc = await this.#readFromDb(node.uuid);

    if (doc.isLeft()) {
      return left(doc.value);
    }

    const data = this.#toPutDocument(node);

    return this.db
      .put({
        _rev: doc.value._rev,
        ...data,
      })
      .then(() => right<NodeNotFoundError, void>(undefined))
      .catch((err) => {
        console.error(err);
        return left(new NodeNotFoundError(err));
      });
  }

  #toPutDocument(node: NodeLike): PouchDB.Core.PutDocument<NodeDbModel> {
    const { uuid, filters, ...rest } = node.metadata;
    return {
      _id: uuid,
      xfilters: filters,
      ...rest,
    } as unknown as PouchDB.Core.PutDocument<NodeDbModel>;
  }

  #toNodeLike(doc: PouchDB.Core.PutDocument<NodeDbModel>): NodeLike {
    const { _id, _rev, xfilters: xfilters, filters, ...rest } = doc;
    const metadata = {
      uuid: _id,
      filters: xfilters,
      ...rest,
    } as Partial<NodeMetadata>;

    const node = NodeFactory.from(metadata);

    if (node.isLeft()) {
      throw new Error(`Node could not be created:\n ${JSON.stringify(metadata, null, 3)}`);
    }

    return node.right;
  }

  async add(node: NodeLike): Promise<Either<DuplicatedNodeError, void>> {
    const doc = this.#toPutDocument(node);

    return this.db
      .put(doc)
      .then(() => right<DuplicatedNodeError, void>(undefined))
      .catch((err) => {
        console.error(err);
        return left(new DuplicatedNodeError(node.uuid));
      });
  }

  async getByFid(fid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
    const r = await this.db
      .createIndex({ index: { fields: ["fid"] } })
      .then(() => this.db.find({ selector: { fid: fid } }));

    const nodes = r.docs.map((n) => this.#toNodeLike(n));

    if (nodes.length === 0) {
      return left(new NodeNotFoundError(Nodes.fidToUuid(fid)));
    }

    return right(nodes[0]);
  }

  async getById(uuid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
    const doc = await this.#readFromDb(uuid);

    if (doc.isLeft()) {
      return left(doc.value);
    }

    return right(this.#toNodeLike(doc.value));
  }

  async #readFromDb(
    _id: string,
  ): Promise<Either<NodeNotFoundError, PouchDB.Core.ExistingDocument<NodeDbModel>>> {
    return this.db
      .get(_id)
      .then(right)
      .catch((err) => {
        if ((err as Record<string, unknown>).status === 404) {
          return left(new NodeNotFoundError(_id));
        }

        throw err;
      }) as Promise<Either<NodeNotFoundError, PouchDB.Core.ExistingDocument<NodeDbModel>>>;
  }

  async filter(filters: NodeFilters, pageSize = 20, pageToken = 1): Promise<NodeFilterResult> {
    const limit = pageSize;
    const skip = pageSize * (pageToken - 1);

    if (filters.length === 0) {
      return this.#findAll(limit, skip);
    }

    const f = areOrNodeFilter(filters) ? filters : [filters];
    const selectors = f.map((ifs) => {
      const mfs = ifs.map((s) => filterToMango(this.#provider, s));

      return composeMangoQuery(mfs);
    });

    const selector = areOrNodeFilter(filters) ? { $or: selectors } : selectors[0];

    try {
      const result = await this.db.find({
        selector,
        limit: pageSize * pageToken,
      });

      const nodes = result.docs.map((d) => this.#toNodeLike(d));

      return {
        nodes: nodes.slice(pageSize * (pageToken - 1), pageSize * pageToken),
        pageSize,
        pageToken,
      };
    } catch (err) {
      console.log(err);
    }

    return {
      nodes: [],
      pageSize,
      pageToken,
    };
  }

  async #findAll(limit: number, skip: number) {
    const result = await this.db.find({
      selector: {},
      limit,
      skip,
    });

    return {
      nodes: result.docs.map((doc) => this.#toNodeLike(doc)),
      pageSize: limit,
      pageToken: skip / limit + 1,
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
        $regex: dbprovider === "CouchDb" ? `(?i)${value}` : new RegExp(value, "i"),
      },
    };
  }

  const o = operators[operator] as string;
  return { [field]: { [o]: value } };
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
