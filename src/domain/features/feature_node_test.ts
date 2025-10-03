import { it } from "bdd";
import { expect } from "expect";
import { ValidationError } from "shared/validation_error.ts";
import { FeatureNode, type FeatureParameter } from "./feature_node.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import type { NodeFilters } from "domain/nodes/node_filter.ts";

it("FeatureNode.create should initialize with minimal metadata", () => {
	const result = FeatureNode.create({
		title: "Test Feature",
		parent: Folders.FEATURES_FOLDER_UUID,
		owner: "user@domain.com",
		mimetype: Nodes.FEATURE_MIMETYPE,
	});

	expect(result.isRight(), result.value.message).toBe(true);
	const featureNode = result.right;
	expect(Nodes.isFeature(featureNode)).toBe(true);
	expect(featureNode.title).toBe("Test Feature");
	expect(featureNode.name).toBe("Test Feature");
	expect(featureNode.parent).toBe(Folders.FEATURES_FOLDER_UUID);
	expect(featureNode.owner).toBe("user@domain.com");
	expect(featureNode.mimetype).toBe(Nodes.FEATURE_MIMETYPE);
});

it("FeatureNode.create should initialize with name override", () => {
	const result = FeatureNode.create({
		title: "Test Feature Title",
		name: "custom_feature_name",
		parent: Folders.FEATURES_FOLDER_UUID,
		owner: "user@domain.com",
		mimetype: Nodes.FEATURE_MIMETYPE,
	});

	expect(result.isRight(), result.value.message).toBe(true);
	const featureNode = result.right;
	expect(featureNode.title).toBe("Test Feature Title");
	expect(featureNode.name).toBe("custom_feature_name");
});

it("FeatureNode.create should set default boolean values", () => {
	const result = FeatureNode.create({
		title: "Test Feature",
		parent: Folders.FEATURES_FOLDER_UUID,
		owner: "user@domain.com",
		mimetype: Nodes.FEATURE_MIMETYPE,
	});

	expect(result.isRight(), result.value.message).toBe(true);
	const featureNode = result.right;
	expect(featureNode.exposeAction).toBe(false);
	expect(featureNode.runOnCreates).toBe(false);
	expect(featureNode.runOnUpdates).toBe(false);
	expect(featureNode.runManually).toBe(true);
	expect(featureNode.exposeExtension).toBe(false);
	expect(featureNode.exposeAITool).toBe(false);
});

it("FeatureNode.create should set default array and object values", () => {
	const result = FeatureNode.create({
		title: "Test Feature",
		parent: Folders.FEATURES_FOLDER_UUID,
		owner: "user@domain.com",
		mimetype: Nodes.FEATURE_MIMETYPE,
	});

	expect(result.isRight(), result.value.message).toBe(true);
	const featureNode = result.right;
	expect(featureNode.filters).toEqual([]);
	expect(featureNode.groupsAllowed).toEqual([]);
	expect(featureNode.parameters).toEqual([]);
});

it("FeatureNode.create should set default return type to void", () => {
	const result = FeatureNode.create({
		title: "Test Feature",
		parent: Folders.FEATURES_FOLDER_UUID,
		owner: "user@domain.com",
		mimetype: Nodes.FEATURE_MIMETYPE,
	});

	expect(result.isRight(), result.value.message).toBe(true);
	const featureNode = result.right;
	expect(featureNode.returnType).toBe("void");
	expect(featureNode.returnDescription).toBeUndefined();
	expect(featureNode.returnContentType).toBeUndefined();
});

it("FeatureNode.create should initialize with full metadata", () => {
	const parameters: FeatureParameter[] = [
		{
			name: "input",
			type: "string",
			required: true,
			description: "Input parameter",
			defaultValue: "default",
		},
		{
			name: "count",
			type: "number",
			required: false,
			description: "Count parameter",
		},
	];

	const filters: NodeFilters = [["mimetype", "==", "text/plain"]];

	const result = FeatureNode.create({
		title: "Full Feature",
		name: "full_feature",
		owner: "user@domain.com",
		description: "A complete feature",
		exposeAction: false,
		runOnCreates: true,
		runOnUpdates: true,
		runManually: false,
		filters: filters,
		exposeExtension: true,
		exposeAITool: true,
		runAs: "system@domain.com",
		groupsAllowed: ["admin", "power-users"],
		parameters: parameters,
		returnType: "string",
		returnDescription: "Returns processed result",
		returnContentType: "text/plain",
	});

	expect(result.isRight(), result.value.message).toBe(true);
	const featureNode = result.right;
	expect(featureNode.name).toBe("full_feature");
	expect(featureNode.description).toBe("A complete feature");
	expect(featureNode.exposeAction).toBe(false);
	expect(featureNode.runOnCreates).toBe(false);
	expect(featureNode.runOnUpdates).toBe(false);
	expect(featureNode.runManually).toBe(true);
	expect(featureNode.filters).toEqual(filters);
	expect(featureNode.exposeExtension).toBe(true);
	expect(featureNode.exposeAITool).toBe(true);
	expect(featureNode.runAs).toBe("system@domain.com");
	expect(featureNode.groupsAllowed).toEqual(["admin", "power-users"]);
	expect(featureNode.parameters).toEqual(parameters);
	expect(featureNode.returnType).toBe("string");
	expect(featureNode.returnDescription).toBe("Returns processed result");
	expect(featureNode.returnContentType).toBe("text/plain");
});

it("FeatureNode.create should always have FEATURE_MIMETYPE", () => {
	const result = FeatureNode.create({
		title: "Test Feature",
		mimetype: "application/json", // Different mimetype
		parent: Folders.FEATURES_FOLDER_UUID,
		owner: "user@domain.com",
	});

	expect(result.isRight(), result.value.message).toBe(true);
	expect(result.right.mimetype).toBe(Nodes.FEATURE_MIMETYPE);
});

it("FeatureNode.create should return error if name and title are missing", () => {
	const result = FeatureNode.create({
		parent: Folders.FEATURES_FOLDER_UUID,
		owner: "user@domain.com",
		mimetype: Nodes.FEATURE_MIMETYPE,
	});

	expect(result.isLeft()).toBe(true);
	expect(result.value).toBeInstanceOf(ValidationError);
});

it("FeatureNode.create should return error if title is empty", () => {
	const result = FeatureNode.create({
		title: "",
		parent: Folders.FEATURES_FOLDER_UUID,
		owner: "user@domain.com",
		mimetype: Nodes.FEATURE_MIMETYPE,
	});

	expect(result.isLeft()).toBe(true);
	expect(result.value).toBeInstanceOf(ValidationError);
});

it("FeatureNode.create should return error if owner is missing", () => {
	const result = FeatureNode.create({
		title: "Test Feature",
		parent: Folders.FEATURES_FOLDER_UUID,
		mimetype: Nodes.FEATURE_MIMETYPE,
	});

	expect(result.isLeft()).toBe(true);
	expect(result.value).toBeInstanceOf(ValidationError);
});

it("FeatureNode.create should handle various parameter types", () => {
	const parameters: FeatureParameter[] = [
		{
			name: "stringParam",
			type: "string",
			required: true,
			description: "A string parameter",
			defaultValue: "default string",
		},
		{
			name: "numberParam",
			type: "number",
			required: false,
			description: "A number parameter",
			defaultValue: 42,
		},
		{
			name: "booleanParam",
			type: "boolean",
			required: true,
			description: "A boolean parameter",
			defaultValue: true,
		},
		{
			name: "objectParam",
			type: "object",
			required: false,
			description: "An object parameter",
			defaultValue: { key: "value" },
		},
		{
			name: "arrayParam",
			type: "array",
			arrayType: "string",
			required: false,
			description: "An array parameter",
			defaultValue: ["item1", "item2"],
		},
		{
			name: "fileParam",
			type: "file",
			contentType: "application/pdf",
			required: false,
			description: "A file parameter",
		},
	];

	const result = FeatureNode.create({
		title: "Parameter Test Feature",
		parent: Folders.FEATURES_FOLDER_UUID,
		owner: "user@domain.com",
		mimetype: Nodes.FEATURE_MIMETYPE,
		parameters: parameters,
	});

	expect(result.isRight(), result.value.message).toBe(true);
	const featureNode = result.right;
	expect(featureNode.parameters).toEqual(parameters);
});

it("FeatureNode.create should handle various return types", () => {
	const returnTypes = [
		"string",
		"number",
		"boolean",
		"array",
		"object",
		"file",
		"void",
	] as const;

	returnTypes.forEach((returnType) => {
		const result = FeatureNode.create({
			title: `Feature with ${returnType} return`,
			parent: Folders.FEATURES_FOLDER_UUID,
			owner: "user@domain.com",
			mimetype: Nodes.FEATURE_MIMETYPE,
			returnType: returnType,
		});

		expect(result.isRight(), result.value.message).toBe(true);
		expect(result.right.returnType).toBe(returnType);
	});
});

it("FeatureNode should include all properties in metadata", () => {
	const parameters: FeatureParameter[] = [
		{
			name: "uuids",
			type: "array",
			arrayType: "string",
			required: true,
			description: "Node UUIDs to process",
		},
		{
			name: "test",
			type: "string",
			required: true,
		},
	];

	const filters: NodeFilters = [["title", "contains", "test"]];

	const result = FeatureNode.create({
		title: "Metadata Test",
		name: "metadata_test",
		parent: Folders.FEATURES_FOLDER_UUID,
		owner: "user@domain.com",
		mimetype: Nodes.FEATURE_MIMETYPE,
		description: "Test description",
		exposeAction: true,
		runOnCreates: true,
		runOnUpdates: false,
		runManually: true,
		filters: filters,
		exposeExtension: true,
		exposeAITool: false,
		runAs: "admin@domain.com",
		groupsAllowed: ["admin"],
		parameters: parameters,
		returnType: "object",
		returnDescription: "Test return",
		returnContentType: "application/json",
		size: 1024,
	});

	expect(result.isRight(), result.value.message).toBe(true);
	const featureNode = result.right;
	const metadata = featureNode.metadata;

	expect(metadata.mimetype).toBe(Nodes.FEATURE_MIMETYPE);
	expect(metadata.exposeAction).toBe(true);
	expect(metadata.runOnCreates).toBe(true);
	expect(metadata.runOnUpdates).toBe(false);
	expect(metadata.runManually).toBe(true);
	expect(metadata.filters).toEqual(filters);
	expect(metadata.exposeExtension).toBe(true);
	expect(metadata.exposeAITool).toBe(false);
	expect(metadata.runAs).toBe("admin@domain.com");
	expect(metadata.groupsAllowed).toEqual(["admin"]);
	expect(metadata.parameters).toEqual(parameters);
	expect(metadata.returnType).toBe("object");
	expect(metadata.returnDescription).toBe("Test return");
	expect(metadata.returnContentType).toBe("application/json");
	expect(metadata.size).toBe(1024);
});

it("FeatureNode should handle complex filter configurations", () => {
	const filters1D: NodeFilters = [
		["mimetype", "==", "text/plain"],
		["parent", "!=", Folders.ROOT_FOLDER_UUID],
	];

	const filters2D: NodeFilters = [
		[["mimetype", "==", "text/plain"], ["size", ">", 1000]],
		[["title", "contains", "test"]],
	];

	// Test 1D filters
	const result1D = FeatureNode.create({
		title: "1D Filter Feature",
		parent: Folders.FEATURES_FOLDER_UUID,
		owner: "user@domain.com",
		mimetype: Nodes.FEATURE_MIMETYPE,
		filters: filters1D,
	});

	expect(result1D.isRight()).toBe(true);
	expect(result1D.right.filters).toEqual(filters1D);

	// Test 2D filters
	const result2D = FeatureNode.create({
		title: "2D Filter Feature",
		parent: Folders.FEATURES_FOLDER_UUID,
		owner: "user@domain.com",
		mimetype: Nodes.FEATURE_MIMETYPE,
		filters: filters2D,
	});

	expect(result2D.isRight()).toBe(true);
	expect(result2D.right.filters).toEqual(filters2D);
});

it("FeatureNode should inherit from FileMixin", () => {
	const result = FeatureNode.create({
		title: "File Mixin Test",
		parent: Folders.FEATURES_FOLDER_UUID,
		owner: "user@domain.com",
		mimetype: Nodes.FEATURE_MIMETYPE,
		size: 2048,
	});

	expect(result.isRight(), result.value.message).toBe(true);
	const featureNode = result.right;
	expect(featureNode.size).toBe(2048);
	expect(typeof featureNode.update).toBe("function");
});

it("FeatureNode should handle empty parameters gracefully", () => {
	const result = FeatureNode.create({
		title: "Empty Parameters Feature",
		parent: Folders.FEATURES_FOLDER_UUID,
		owner: "user@domain.com",
		mimetype: Nodes.FEATURE_MIMETYPE,
		parameters: [],
	});

	expect(result.isRight(), result.value.message).toBe(true);
	expect(result.right.parameters).toEqual([]);
});

it("FeatureNode should handle undefined optional properties", () => {
	const result = FeatureNode.create({
		title: "Minimal Feature",
		parent: Folders.FEATURES_FOLDER_UUID,
		owner: "user@domain.com",
		mimetype: Nodes.FEATURE_MIMETYPE,
		runAs: undefined,
		returnDescription: undefined,
		returnContentType: undefined,
	});

	expect(result.isRight(), result.value.message).toBe(true);
	const featureNode = result.right;
	expect(featureNode.runAs).toBeUndefined();
	expect(featureNode.returnDescription).toBeUndefined();
	expect(featureNode.returnContentType).toBeUndefined();
});

it("FeatureNode should handle security and execution configurations", () => {
	const result = FeatureNode.create({
		title: "Secure Feature",
		parent: Folders.FEATURES_FOLDER_UUID,
		owner: "user@domain.com",
		mimetype: Nodes.FEATURE_MIMETYPE,
		parameters: [
			{
				name: "uuids",
				type: "array",
				arrayType: "string",
				required: true,
				description: "Input data",
			},
		],
		exposeAction: true,
		runOnCreates: true,
		runOnUpdates: true,
		runManually: false,
		runAs: "service@domain.com",
		groupsAllowed: ["admin", "editor", "viewer"],
	});

	expect(result.isRight(), result.value.message).toBe(true);
	const featureNode = result.right;
	expect(featureNode.exposeAction).toBe(true);
	expect(featureNode.runOnCreates).toBe(true);
	expect(featureNode.runOnUpdates).toBe(true);
	expect(featureNode.runManually).toBe(false);
	expect(featureNode.runAs).toBe("service@domain.com");
	expect(featureNode.groupsAllowed).toEqual(["admin", "editor", "viewer"]);
});

it("FeatureNode should handle exposure configurations", () => {
	const parameters: FeatureParameter[] = [
		{
			name: "uuids",
			type: "array",
			arrayType: "string",
			required: true,
			description: "Node UUIDs to process",
		},
	];

	const testCases = [
		{ exposeAction: true, exposeExtension: false, exposeAITool: false },
		{ exposeAction: false, exposeExtension: true, exposeAITool: false },
		{ exposeAction: false, exposeExtension: false, exposeAITool: true },
		{ exposeAction: true, exposeExtension: true, exposeAITool: true },
	];

	testCases.forEach((testCase, index) => {
		const result = FeatureNode.create({
			title: `Exposure Test ${index}`,
			parent: Folders.FEATURES_FOLDER_UUID,
			owner: "user@domain.com",
			mimetype: Nodes.FEATURE_MIMETYPE,
			parameters,
			...testCase,
		});

		expect(result.isRight(), result.value.message).toBe(true);
		const featureNode = result.right;
		expect(featureNode.exposeAction).toBe(testCase.exposeAction);
		expect(featureNode.exposeExtension).toBe(testCase.exposeExtension);
		expect(featureNode.exposeAITool).toBe(testCase.exposeAITool);
	});
});

it("FeatureNode should require 'uuids' parameter when exposed as action", () => {
	const parametersWithUuids: FeatureParameter[] = [
		{
			name: "uuids",
			type: "array",
			arrayType: "string",
			required: true,
			description: "Node UUIDs to process",
		},
		{
			name: "option",
			type: "string",
			required: false,
			description: "Optional parameter",
		},
	];

	const result = FeatureNode.create({
		title: "Action Feature",
		parent: Folders.FEATURES_FOLDER_UUID,
		owner: "user@domain.com",
		mimetype: Nodes.FEATURE_MIMETYPE,
		exposeAction: true,
		parameters: parametersWithUuids,
	});

	expect(result.isRight(), result.value.message).toBe(true);
	const featureNode = result.right;
	expect(featureNode.exposeAction).toBe(true);

	const uuidsParam = featureNode.parameters.find((p) => p.name === "uuids");
	expect(uuidsParam).toBeDefined();
	expect(uuidsParam?.type).toBe("array");
	expect(uuidsParam?.arrayType).toBe("string");
});

it("FeatureNode should validate uuids parameter type for actions", () => {
	const parametersWithInvalidUuids: FeatureParameter[] = [
		{
			name: "uuids",
			type: "string", // Invalid: should be array
			required: true,
			description: "Node UUIDs to process",
		},
	];

	const result = FeatureNode.create({
		title: "Invalid Action Feature",
		parent: Folders.FEATURES_FOLDER_UUID,
		owner: "user@domain.com",
		mimetype: Nodes.FEATURE_MIMETYPE,
		exposeAction: true,
		parameters: parametersWithInvalidUuids,
	});

	expect(result.isLeft()).toBe(true);
	expect(result.value).toBeInstanceOf(ValidationError);
});

it("FeatureNode with file parameter should be exposed as extension only", () => {
	const parametersWithFile: FeatureParameter[] = [
		{
			name: "inputFile",
			type: "file",
			contentType: "application/pdf",
			required: true,
			description: "File to process",
		},
		{
			name: "option",
			type: "string",
			required: false,
			description: "Processing option",
		},
	];

	const result = FeatureNode.create({
		title: "File Processing Feature",
		parent: Folders.FEATURES_FOLDER_UUID,
		owner: "user@domain.com",
		mimetype: Nodes.FEATURE_MIMETYPE,
		exposeExtension: true,
		exposeAction: false, // Should not be exposed as action
		parameters: parametersWithFile,
	});

	expect(result.isRight(), result.value.message).toBe(true);
	const featureNode = result.right;
	expect(featureNode.exposeExtension).toBe(true);
	expect(featureNode.exposeAction).toBe(false);

	const fileParam = featureNode.parameters.find((p) => p.type === "file");
	expect(fileParam).toBeDefined();
	expect(fileParam?.contentType).toBe("application/pdf");
});

it("FeatureNode with array of files parameter should be exposed as extension only", () => {
	const parametersWithFileArray: FeatureParameter[] = [
		{
			name: "inputFiles",
			type: "array",
			arrayType: "file",
			required: true,
			description: "Files to process",
		},
		{
			name: "batchSize",
			type: "number",
			required: false,
			description: "Batch processing size",
		},
	];

	const result = FeatureNode.create({
		title: "Batch File Processing Feature",
		parent: Folders.FEATURES_FOLDER_UUID,
		owner: "user@domain.com",
		mimetype: Nodes.FEATURE_MIMETYPE,
		exposeExtension: true,
		exposeAction: false, // Should not be exposed as action
		parameters: parametersWithFileArray,
	});

	expect(result.isRight(), result.value.message).toBe(true);
	const featureNode = result.right;
	expect(featureNode.exposeExtension).toBe(true);
	expect(featureNode.exposeAction).toBe(false);

	const fileArrayParam = featureNode.parameters.find((p) =>
		p.type === "array" && p.arrayType === "file"
	);
	expect(fileArrayParam).toBeDefined();
	expect(fileArrayParam?.name).toBe("inputFiles");
});

it("FeatureNode should handle mixed parameter types correctly", () => {
	const mixedParameters: FeatureParameter[] = [
		{
			name: "text",
			type: "string",
			required: true,
			description: "Text input",
		},
		{
			name: "count",
			type: "number",
			required: false,
			description: "Count parameter",
		},
		{
			name: "files",
			type: "array",
			arrayType: "file",
			required: true,
			description: "Files to process",
		},
	];

	// This feature should be extension-only due to file array parameter
	const result = FeatureNode.create({
		title: "Mixed Parameters Feature",
		parent: Folders.FEATURES_FOLDER_UUID,
		owner: "user@domain.com",
		mimetype: Nodes.FEATURE_MIMETYPE,
		exposeExtension: true,
		exposeAction: false,
		parameters: mixedParameters,
	});

	expect(result.isRight(), result.value.message).toBe(true);
	const featureNode = result.right;
	expect(featureNode.exposeExtension).toBe(true);
	expect(featureNode.exposeAction).toBe(false);
	expect(featureNode.parameters).toHaveLength(3);

	const stringParam = featureNode.parameters.find((p) => p.type === "string");
	const numberParam = featureNode.parameters.find((p) => p.type === "number");
	const fileArrayParam = featureNode.parameters.find((p) =>
		p.type === "array" && p.arrayType === "file"
	);

	expect(stringParam).toBeDefined();
	expect(numberParam).toBeDefined();
	expect(fileArrayParam).toBeDefined();
});

it("FeatureNode should fail if file parameter is exposed as action", () => {
	const parametersWithFile: FeatureParameter[] = [
		{
			name: "inputFile",
			type: "file",
			contentType: "application/pdf",
			required: true,
			description: "File to process",
		},
	];

	const result = FeatureNode.create({
		title: "Invalid File Action Feature",
		parent: Folders.FEATURES_FOLDER_UUID,
		owner: "user@domain.com",
		mimetype: Nodes.FEATURE_MIMETYPE,
		exposeAction: true, // Should fail - file parameters can't be actions
		exposeExtension: false,
		parameters: parametersWithFile,
	});

	expect(result.isLeft()).toBe(true);
	expect(result.value).toBeInstanceOf(ValidationError);
});

it("FeatureNode should fail if file parameter is exposed as AI tool only", () => {
	const parametersWithFile: FeatureParameter[] = [
		{
			name: "inputFile",
			type: "file",
			contentType: "application/pdf",
			required: true,
			description: "File to process",
		},
	];

	const result = FeatureNode.create({
		title: "Invalid File AI Tool Feature",
		parent: Folders.FEATURES_FOLDER_UUID,
		owner: "user@domain.com",
		mimetype: Nodes.FEATURE_MIMETYPE,
		exposeAction: false,
		exposeExtension: false,
		exposeAITool: true, // Should fail - file parameters require extension exposure
		parameters: parametersWithFile,
	});

	expect(result.isLeft()).toBe(true);
	expect(result.value).toBeInstanceOf(ValidationError);
});

it("FeatureNode should fail if array of files parameter is exposed as action", () => {
	const parametersWithFileArray: FeatureParameter[] = [
		{
			name: "inputFiles",
			type: "array",
			arrayType: "file",
			required: true,
			description: "Files to process",
		},
	];

	const result = FeatureNode.create({
		title: "Invalid File Array Action Feature",
		parent: Folders.FEATURES_FOLDER_UUID,
		owner: "user@domain.com",
		mimetype: Nodes.FEATURE_MIMETYPE,
		exposeAction: true, // Should fail - array of file parameters can't be actions
		exposeExtension: false,
		parameters: parametersWithFileArray,
	});

	expect(result.isLeft()).toBe(true);
	expect(result.value).toBeInstanceOf(ValidationError);
});

it("FeatureNode should fail if array of files parameter is exposed as AI tool only", () => {
	const parametersWithFileArray: FeatureParameter[] = [
		{
			name: "inputFiles",
			type: "array",
			arrayType: "file",
			required: true,
			description: "Files to process",
		},
	];

	const result = FeatureNode.create({
		title: "Invalid File Array AI Tool Feature",
		parent: Folders.FEATURES_FOLDER_UUID,
		owner: "user@domain.com",
		mimetype: Nodes.FEATURE_MIMETYPE,
		exposeAction: false,
		exposeExtension: false,
		exposeAITool: true, // Should fail - array of file parameters require extension exposure
		parameters: parametersWithFileArray,
	});

	expect(result.isLeft()).toBe(true);
	expect(result.value).toBeInstanceOf(ValidationError);
});
