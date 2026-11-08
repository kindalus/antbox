import { describe, it } from "bdd";
import { expect } from "expect";
import { AspectDataSchema } from "domain/configuration/aspect_schema.ts";
import { FeatureDataSchema } from "domain/configuration/feature_schema.ts";
import { WorkflowDataSchema } from "domain/configuration/workflow_schema.ts";
import {
	FULLTEXT_FILTER_ERROR,
	hasFulltextFilter,
	hasSelfReference,
	NodeFiltersSchema,
	SELF_REFERENCE_FILTER_ERROR,
} from "./node_filter.ts";

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

describe("${field} values", () => {
	const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
		result.error?.issues.map((issue) => issue.message) ?? [];
	const reference = ["process:date", "<=", "${invoice:date}"];
	const aspect = {
		uuid: "invoice",
		title: "Invoice",
		filters: [],
		properties: [],
		createdTime: now,
		modifiedTime: now,
	};

	it("finds ${field} values only when they are the whole value", () => {
		expect(hasSelfReference([reference])).toBe(true);
		expect(hasSelfReference([[["title", "==", "x"]], [reference]])).toBe(true);
		expect(hasSelfReference([["title", "==", "FT-${number}"], ["${title}", "==", "x"]]))
			.toBe(false);
		expect(hasSelfReference([["uuid", "in", ["${title}"]]])).toBe(false);
	});

	it("accepts a reference as the list of an array operator and rejects @ and empty fields", () => {
		expect(NodeFiltersSchema.safeParse([["uuid", "in", "${invoice:processes}"]]).success)
			.toBe(true);
		for (const value of ["${@title}", "${}", "${ }", "${fulltext}", "${a b}"]) {
			expect(NodeFiltersSchema.safeParse([["title", "==", value]]).success).toBe(false);
		}
	});

	it("are accepted in aspect validationFilters and rejected in aspect filters", () => {
		const property = {
			name: "process",
			title: "Process",
			type: "uuid",
			validationFilters: [reference],
		};
		expect(AspectDataSchema.safeParse({ ...aspect, properties: [property] }).success).toBe(true);
		expect(messages(AspectDataSchema.safeParse({ ...aspect, filters: [reference] })))
			.toContain(SELF_REFERENCE_FILTER_ERROR);
		const atParent = { ...property, validationFilters: [["title", "==", "${@title}"]] };
		expect(AspectDataSchema.safeParse({ ...aspect, properties: [atParent] }).success).toBe(false);
	});

	it("are rejected in feature and workflow filters", () => {
		const feature = {
			uuid: "invoiceFeature",
			title: "Invoice feature",
			description: "Handles invoices",
			run: "export default async function () {}",
			exposeExtension: true,
			filters: [reference],
			createdTime: now,
			modifiedTime: now,
		};
		expect(messages(FeatureDataSchema.safeParse(feature))).toContain(SELF_REFERENCE_FILTER_ERROR);
		const workflow = {
			uuid: "invoice-flow",
			title: "Invoice flow",
			states: [
				{
					name: "draft",
					isInitial: true,
					transitions: [{ signal: "go", targetState: "done", filters: [reference] }],
				},
				{ name: "done", isFinal: true },
			],
			availableStateNames: ["draft", "done"],
			filters: [],
			participants: [],
			createdTime: now,
			modifiedTime: now,
		};
		expect(messages(WorkflowDataSchema.safeParse(workflow))).toContain(
			SELF_REFERENCE_FILTER_ERROR,
		);
		expect(messages(WorkflowDataSchema.safeParse({ ...workflow, filters: [reference] })))
			.toContain(SELF_REFERENCE_FILTER_ERROR);
	});
});
