import { describe, it } from "bdd";
import { expect } from "expect";
import type { AspectData, AspectProperty } from "domain/configuration/aspect_data.ts";
import { formatAspectCatalog } from "./aspect_catalog.ts";

function aspect(uuid: string, title: string, properties: AspectProperty[]): AspectData {
	return {
		uuid,
		title,
		description: "Long descriptions are left out of the catalog.",
		filters: [["mimetype", "==", "application/pdf"]],
		properties,
		createdTime: "2026-01-01T00:00:00.000Z",
		modifiedTime: "2026-01-01T00:00:00.000Z",
	};
}

const invoice = aspect("invoice", "Factura", [
	{
		name: "status",
		title: "Estado",
		type: "string",
		validationList: ["Open", "Closed"],
		required: true,
	},
	{ name: "amount", title: "Amount", type: "number", validationRegex: "^\\d+$" },
	{ name: "supplier-nif", title: "Supplier NIF", type: "string", searchable: true },
	{ name: "lines", title: "Lines", type: "array", arrayType: "string", readonly: true },
	{ name: "contract", title: "Contract", type: "uuid", validationFilters: [["title", "==", "x"]] },
]);

describe("formatAspectCatalog", () => {
	it("lists each aspect with its properties, types, allowed values and required flags", () => {
		const catalog = formatAspectCatalog([invoice]);
		expect(catalog).toBe([
			"## Aspect catalog",
			'Aspects classify nodes. Select an aspect with ["aspects","contains","<uuid>"] and filter its properties as "<uuid>:<property>". Listed values are the only valid ones; use them exactly.',
			"- invoice (Factura)",
			'  - status "Estado": string ["Open", "Closed"] (required)',
			"  - amount: number",
			"  - supplier-nif: string",
			"  - lines: array<string>",
			"  - contract: uuid",
		].join("\n"));
	});

	it("leaves out descriptions, filters, regexes and other noise", () => {
		const catalog = formatAspectCatalog([invoice]);
		expect(catalog).not.toContain("Long descriptions");
		expect(catalog).not.toContain("application/pdf");
		expect(catalog).not.toContain("^\\d+$");
		expect(catalog).not.toContain("readonly");
	});

	it("says when there are no aspects", () => {
		expect(formatAspectCatalog([])).toContain("No aspects are defined.");
	});

	it("summarises long value lists and stays bounded for many aspects", () => {
		const values = Array.from({ length: 45 }, (_, i) => `V${i}`);
		const long = formatAspectCatalog([
			aspect("long", "Long", [{
				name: "code",
				title: "Code",
				type: "string",
				validationList: values,
			}]),
		]);
		expect(long).toContain('"V29", …15 more]');
		expect(long).not.toContain('"V30"');

		const many = Array.from({ length: 400 }, (_, i) =>
			aspect(`aspect-${i}`, `Aspect ${i}`, [
				{ name: "status", title: "Status", type: "string", validationList: ["A", "B", "C"] },
				{ name: "amount", title: "Amount", type: "number" },
			]));
		const catalog = formatAspectCatalog(many);
		expect(catalog.length).toBeLessThanOrEqual(12_100);
		expect(catalog).toMatch(/\(\d+ more aspects not listed\)$/);
	});

	it("keeps a typical tenant within about a thousand tokens", () => {
		const tenant = Array.from({ length: 12 }, (_, i) =>
			aspect(`aspect-${i}`, `Aspect ${i}`, [
				{ name: "status", title: "Estado", type: "string", validationList: ["Open", "Closed"] },
				{ name: "date", title: "Date", type: "date" },
				{ name: "amount", title: "Amount", type: "number" },
				{ name: "owner", title: "Owner", type: "string" },
			]));
		// Roughly four characters per token.
		expect(formatAspectCatalog(tenant).length / 4).toBeLessThan(1000);
	});
});
