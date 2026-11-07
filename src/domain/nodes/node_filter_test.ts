import { describe, it } from "bdd";
import { expect } from "expect";
import { AspectDataSchema } from "domain/configuration/aspect_schema.ts";
import { FeatureDataSchema } from "domain/configuration/feature_schema.ts";
import { WorkflowDataSchema } from "domain/configuration/workflow_schema.ts";
import { FULLTEXT_FILTER_ERROR, hasFulltextFilter } from "./node_filter.ts";

const now = new Date().toISOString();
const fulltext = ["fulltext", "match", "invoice"];

describe("hasFulltextFilter", () => {
	it("finds fulltext match filters in 1D and 2D filters", () => {
		expect(hasFulltextFilter([fulltext])).toBe(true);
		expect(hasFulltextFilter([[["title", "==", "x"]], [fulltext]])).toBe(true);
		expect(hasFulltextFilter([["title", "match", "x"], ["fulltext", "==", "x"]])).toBe(false);
		expect(hasFulltextFilter([])).toBe(false);
		expect(hasFulltextFilter([[]])).toBe(false);
	});
});

describe("filters checked against one node", () => {
	const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
		result.error?.issues.map((issue) => issue.message) ?? [];

	it("rejects fulltext in aspect filters and validation filters", () => {
		const aspect = {
			uuid: "invoice-aspect",
			title: "Invoice",
			filters: [],
			properties: [],
			createdTime: now,
			modifiedTime: now,
		};
		expect(AspectDataSchema.safeParse(aspect).success).toBe(true);
		expect(messages(AspectDataSchema.safeParse({ ...aspect, filters: [fulltext] })))
			.toContain(FULLTEXT_FILTER_ERROR);
		const property = {
			name: "related",
			title: "Related",
			type: "uuid",
			validationFilters: [[fulltext]],
		};
		expect(messages(AspectDataSchema.safeParse({ ...aspect, properties: [property] })))
			.toContain(FULLTEXT_FILTER_ERROR);
	});

	it("rejects fulltext in feature filters", () => {
		const feature = {
			uuid: "invoiceFeature",
			title: "Invoice feature",
			description: "Handles invoices",
			run: "export default async function () {}",
			exposeExtension: true,
			filters: [],
			createdTime: now,
			modifiedTime: now,
		};
		expect(FeatureDataSchema.safeParse(feature).success).toBe(true);
		expect(messages(FeatureDataSchema.safeParse({ ...feature, filters: [fulltext] })))
			.toContain(FULLTEXT_FILTER_ERROR);
	});

	it("rejects fulltext in workflow and transition filters", () => {
		const workflow = {
			uuid: "invoice-flow",
			title: "Invoice flow",
			states: [
				{
					name: "draft",
					isInitial: true,
					transitions: [{ signal: "go", targetState: "done" }],
				},
				{ name: "done", isFinal: true },
			],
			availableStateNames: ["draft", "done"],
			filters: [],
			participants: [],
			createdTime: now,
			modifiedTime: now,
		};
		expect(WorkflowDataSchema.safeParse(workflow).success).toBe(true);
		expect(messages(WorkflowDataSchema.safeParse({ ...workflow, filters: [fulltext] })))
			.toContain(FULLTEXT_FILTER_ERROR);
		const states = [
			{
				name: "draft",
				isInitial: true,
				transitions: [{ signal: "go", targetState: "done", filters: [fulltext] }],
			},
			{ name: "done", isFinal: true },
		];
		expect(messages(WorkflowDataSchema.safeParse({ ...workflow, states })))
			.toContain(FULLTEXT_FILTER_ERROR);
	});
});
