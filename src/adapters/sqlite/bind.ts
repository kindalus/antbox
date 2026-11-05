import type { SQLInputValue } from "node:sqlite";

export type BindValue = SQLInputValue | boolean | undefined;

export function toSqlValue(value: BindValue): SQLInputValue {
	if (value === undefined) return null;
	if (typeof value === "boolean") return value ? 1n : 0n;
	if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
	return value;
}

export function toSqlValues(values: BindValue[]): SQLInputValue[] {
	return values.map(toSqlValue);
}
