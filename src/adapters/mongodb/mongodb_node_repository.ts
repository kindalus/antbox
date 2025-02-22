import {
  Collection,
  Db,
  Document,
  Filter,
  MongoClient,
  ObjectId,
  WithId,
} from "npm:mongodb@6.13.0";

import MurmurHash3 from "https://deno.land/x/murmurhash@v1.0.0/mod.ts";

import { Node } from "domain/nodes/node.ts";

import { FilterOperator, NodeFilter } from "domain/nodes/node_filter.ts";
import { NodeLike } from "domain/nodes/node_like.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import {
  NodeFilterResult,
  NodeRepository,
} from "domain/nodes/node_repository.ts";
import { AntboxError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { NodeFactory } from "domain/node_factory.ts";

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
  static readonly #COLLECTION_NAME = "nodes";

  readonly #db: Db;
  readonly #collection: Collection;
  readonly #client: MongoClient;

  constructor(client: MongoClient, dbname: string) {
    this.#client = client;
    this.#db = client.db(dbname);
    this.#collection = this.#db.collection(
      MongodbNodeRepository.#COLLECTION_NAME,
    );
  }

  add(node: Node): Promise<Either<AntboxError, void>> {
    const doc = {
      ...toObjectId(node.uuid),
      ...node,
    };

    return this.#collection
      .insertOne(doc)
      .then(() => right(undefined))
      .catch((err) => new MongodbError(err.message)) as Promise<
      Either<AntboxError, void>
    >;
  }

  async getById(uuid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
    try {
      const doc = await this.#collection.findOne(toObjectId(uuid));

      if (!doc) {
        return left(new NodeNotFoundError(uuid));
      }

      const node = NodeFactory.from(doc as unknown as NodeMetadata)
        .value as NodeLike;
      return right(node);
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
      await this.#collection.deleteOne(toObjectId(uuid));
    } catch (err) {
      // deno-lint-ignore no-explicit-any
      return left(new MongodbError((err as any).message));
    }

    return right(undefined);
  }

  async filter(
    filters: NodeFilter[],
    pageSize: number,
    pageToken: number,
  ): Promise<NodeFilterResult> {
    const query = buildMongoQuery(filters);

    const [count, findCursor] = await Promise.all([
      this.#collection.countDocuments(query),
      this.#collection.find(query, {
        limit: pageSize,
        skip: pageSize * (pageToken - 1),
      }),
    ]);

    const docs = await findCursor.toArray();

    const nodes = docs.map(
      (d) => NodeFactory.from(d as unknown as NodeMetadata).value as NodeLike,
    );

    return {
      nodes,
      pageSize,
      pageToken,
      pageCount: Math.ceil(count / pageSize),
    };
  }

  async getByFid(fid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
    const result = await this.filter([["fid", "==", fid]], 1, 1);

    if (result.nodes.length === 0) {
      return left(new NodeNotFoundError(fid));
    }

    return right(result.nodes[0]);
  }

  async update(node: Node): Promise<Either<NodeNotFoundError, void>> {
    const doc = await this.getById(node.uuid);

    if (doc.isLeft()) {
      return left(doc.value);
    }

    try {
      await this.#collection.updateOne(toObjectId(node.uuid), {
        $set: { ...node },
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
}

export class MongodbError extends AntboxError {
  static ERROR_CODE = "MongodbError";
  constructor(message: string) {
    super(MongodbError.ERROR_CODE, message);
  }
}

export function toObjectId(uuid: string): WithId<Document> {
  return { _id: new ObjectId(checksum(uuid)) };
}

function buildMongoQuery(filters: NodeFilter[]): Filter<Document> {
  if (filters.length === 0) {
    return {};
  }

  const mongoFilters = filters.map(toMongoFilter);
  if (mongoFilters.length === 1) {
    return mongoFilters[0];
  }

  return { $and: mongoFilters };
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

function checksum(input: string): string {
  // Calculate the 32-bit MurmurHash3 value of the input string
  const algo = new MurmurHash3(input);

  // Convert the hash value to a hexadecimal string and pad it with leading zeroes
  return algo.result().toString(16).padStart(24, "0");
}
