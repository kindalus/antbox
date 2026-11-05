import type { SQLInputValue } from "node:sqlite";

export type BindValue = SQLInputValue | boolean | undefined;

export function toSqlValue(value: BindValue): SQLInputValue {
	if (value === undefined) return null;
	if (typeof value === "boolean") return value ? 1 : 0;
	return value;
}

export function toSqlValues(values: BindValue[]): SQLInputValue[] {
	return values.map(toSqlValue);
}
