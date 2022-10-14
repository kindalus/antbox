import { Node } from "/domain/nodes/node.ts";

export interface SmartFolderNodeEvaluation {
  records: Node[];
  aggregations?: AggregationResult[];
}

type AggregatorFn<T> = (acc: T, curValue: unknown) => T;
type ReducerFn = (nodes: Node[], fieldName: string) => unknown;

function calculateAggregation<T>(
  fn: AggregatorFn<T>,
  initialValue: T,
  nodes: Node[],
  field: string
): T {
  // deno-lint-ignore no-explicit-any
  return nodes.reduce((acc, node: any) => {
    const value = node[field] ?? node.properties?.[field];

    if (!value) throw "field not found " + field;

    return fn(acc, value);
  }, initialValue);
}

export const Reducers: Record<string, ReducerFn> = {
  sum(nodes: Node[], fieldName: string) {
    const fn = (acc: number, curValue: number) => acc + (curValue as number);
    return calculateAggregation(
      fn as AggregatorFn<unknown>,
      0,
      nodes,
      fieldName
    );
  },

  avg(nodes: Node[], fieldName: string) {
    const fn = ((acc: number, curValue: number) =>
      acc + (curValue as number)) as AggregatorFn<unknown>;

    const sum = calculateAggregation(fn, 0, nodes, fieldName);

    return (sum as number) / nodes.length;
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  count(nodes: Node[], _fieldName: string) {
    return nodes.length;
  },

  max(nodes: Node[], fieldName: string) {
    const fn = (acc: number, curValue: number) =>
      acc > curValue ? acc : curValue;
    return calculateAggregation(
      fn as AggregatorFn<unknown>,
      undefined,
      nodes,
      fieldName
    );
  },

  min(nodes: Node[], fieldName: string) {
    const fn = (acc: number, curValue: number) =>
      acc < curValue ? acc : curValue;
    return calculateAggregation(
      fn as AggregatorFn<unknown>,
      undefined,
      nodes,
      fieldName
    );
  },

  // deno-lint-ignore no-explicit-any
  med(nodes: any[], fieldName: string) {
    const values = nodes
      .map((node) => node[fieldName] ?? node.properties?.[fieldName])
      .sort(<T>(a: T, b: T) => (a > b ? 1 : -1));

    if (values.length === 0) return undefined;

    return values[Math.floor(values.length / 2)];
  },
};

export type AggregationResult = {
  title: string;
  value: unknown;
};
