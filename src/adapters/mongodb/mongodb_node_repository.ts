import { type Document, type Filter, MongoClient, ObjectId } from "mongodb";

import { type NodeLike } from "domain/node_like.ts";
import { NodeFactory } from "domain/node_factory.ts";
import type { FilterOperator, NodeFilters } from "domain/nodes/node_filter.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import type {
  NodeFilterResult,
  NodeRepository,
} from "domain/nodes/node_repository.ts";
import { AntboxError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { isNodeFilters2D, type NodeFilter } from "domain/nodes/node_filter.ts";

type NodeDbModel = Partial<NodeMetadata> & { _id: ObjectId };

export default function buildMongodbNodeRepository(
  url: string,
  dbname: string,
): Promise<Either<AntboxError, NodeRepository>> {
  return new MongoClient(url)
    .connect()
    .then((client) => new MongodbNodeRepository(client, dbname))
    .then((repo) => right(repo))
    .catch((err) => left(new UnknownError(err.message))) as Promise<
      Either<AntboxError, NodeRepository>
    >;
}

export class MongodbNodeRepository implements NodeRepository {
  static readonly COLLECTION_NAME = "nodes";

  readonly #db: string;
  readonly #client: MongoClient;

  constructor(client: MongoClient, dbname: string) {
    this.#client = client;
    this.#db = dbname;
  }

  get #collection() {
    return this.#client.db(this.#db).collection(
      MongodbNodeRepository.COLLECTION_NAME,
    );
  }

  add(node: NodeLike): Promise<Either<AntboxError, void>> {
    const doc = this.#fromNodeLike(node);

    return this.#collection
      .insertOne(doc)
      .then(() => right(undefined))
      .catch((err) => new MongodbError(err.message)) as Promise<
        Either<AntboxError, void>
      >;
  }

  async getById(uuid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
    try {
      const doc = await this.#collection.findOne({ _id: toObjectId(uuid) });

      if (!doc) {
        return left(new NodeNotFoundError(uuid));
      }

      return right(this.#toNodeLike(doc));
    } catch (err) {
      // deno-lint-ignore no-explicit-any
      return left(new MongodbError((err as any).message));
    }
  }

  async delete(uuid: string): Promise<Either<NodeNotFoundError, void>> {
    const doc = await this.getById(uuid);

    if (doc.isLeft()) {
      return left(doc.value);
    }

    try {
      await this.#collection.deleteOne({ _id: toObjectId(uuid) });
    } catch (err) {
      // deno-lint-ignore no-explicit-any
      return left(new MongodbError((err as any).message));
    }

    return right(undefined);
  }

  async filter(
    filters: NodeFilters,
    pageSize: number,
    pageToken: number,
  ): Promise<NodeFilterResult> {
    const query = buildMongoQuery(filters);

    const findCursor = await this.#collection.find(query, {
      limit: pageSize,
      skip: pageSize * (pageToken - 1),
    });

    const docs = await findCursor.toArray();

    const nodes = docs.map((d) =>
      NodeFactory.from(d as unknown as NodeMetadata).value as NodeLike
    );

    return {
      nodes,
      pageSize,
      pageToken,
    };
  }

  async getByFid(fid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
    const result = await this.filter([["fid", "==", fid]], 1, 1);

    if (result.nodes.length === 0) {
      return left(new NodeNotFoundError(fid));
    }

    return right(result.nodes[0]);
  }

  async update(node: NodeLike): Promise<Either<NodeNotFoundError, void>> {
    const doc = await this.getById(node.uuid);

    if (doc.isLeft()) {
      return left(doc.value);
    }

    try {
      const { _id, ...doc } = this.#fromNodeLike(node);
      await this.#collection.updateOne({ _id: toObjectId(node.uuid) }, {
        $set: doc,
      });
    } catch (err) {
      // deno-lint-ignore no-explicit-any
      return left(new MongodbError((err as any).message));
    }

    return right(undefined);
  }

  async clear(): Promise<void> {
    await this.#collection.deleteMany({});
  }

  async close(): Promise<void> {
    await this.#client.close();
  }

  #fromNodeLike(node: NodeLike): NodeDbModel {
    return {
      _id: toObjectId(node.uuid),
      ...node.metadata,
    };
  }

  #toNodeLike(doc: NodeDbModel): NodeLike {
    return NodeFactory.from(doc).right;
  }
}

export class MongodbError extends AntboxError {
  static ERROR_CODE = "MongodbError";
  constructor(message: string) {
    super(MongodbError.ERROR_CODE, message);
  }
}

export function toObjectId(uuid: string): ObjectId {
  let hex = 0;
  for (const i of uuid) {
    hex = (hex << 8) | i.charCodeAt(0);
  }

  return ObjectId.createFromTime(hex);
}

function buildMongoQuery(filters: NodeFilters): Filter<Document> {
  if (filters.length === 0) {
    return {};
  }

  const ofs = isNodeFilters2D(filters) ? filters : [filters];

  const ffs = ofs.map((ifs) => {
    const mfs = ifs.map(toMongoFilter);

    return mfs.length > 1 ? { $and: mfs } : mfs[0];
  });

  return ffs.length > 1 ? { $or: ffs } : ffs[0];
}

function toMongoFilter(filter: NodeFilter): Filter<Document> {
  const [field, operator, value] = filter;
  const filterOperator = operatorMap[operator];
  return filterOperator([field, operator, value]);
}

const operatorMap: Record<FilterOperator, (f: NodeFilter) => Filter<Document>> =
  {
    "==": ([f, _o, v]) => ({ [f]: v }),
    "!=": ([f, _o, v]) => ({ [f]: { $ne: v } }),
    ">": ([f, _o, v]) => ({ [f]: { $gt: v } }),
    ">=": ([f, _o, v]) => ({ [f]: { $gte: v } }),
    "<": ([f, _o, v]) => ({ [f]: { $lt: v } }),
    "<=": ([f, _o, v]) => ({ [f]: { $lte: v } }),
    in: ([f, _o, v]) => ({ [f]: { $in: v } }),
    "not-in": ([f, _o, v]) => ({ [f]: { $nin: v } }),
    contains: ([f, _o, v]) => ({ [f]: { $all: [v] } }),
    "not-contains": ([f, _o, v]) => ({ [f]: { $not: { $all: [v] } } }),
    "contains-all": ([f, _o, v]) => ({ [f]: { $all: v } }),
    "contains-none": ([f, _o, v]) => ({ [f]: { $not: { $all: v } } }),
    match: ([f, _o, v]) => ({ [f]: { $regex: v } }),
    "contains-any": ([f, _o, v]) => {
      const values = v as string[];
      const condition = values.map((v) => ({ [f]: v }));

      return { $or: condition };
    },
  };
