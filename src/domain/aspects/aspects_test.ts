import { test } from "bdd";
import { expect } from "expect";
import { Aspects } from "./aspects.ts";
import { AspectNode, type AspectProperty } from "./aspect_node.ts";
import { ValidationError } from "shared/validation_error.ts";
import { Folders } from "domain/nodes/folders.ts";
import type { AspectableNode } from "domain/node_like.ts";
import { FileNode } from "domain/nodes/file_node.ts";

// Helper function to create a mock AspectNode
function createMockAspectNode(properties: AspectProperty[] = []): AspectNode {
	const result = AspectNode.create({
		title: "Test Aspect",
		owner: "test@example.com",
		properties: properties,
	});

	if (result.isLeft()) {
		throw new Error("Failed to create mock AspectNode");
	}

	return result.right;
}

// Helper function to create a mock AspectableNode
function createMockAspectableNode(
	properties: Record<string, unknown> = {},
): AspectableNode {
	const result = FileNode.create({
		title: "Mock Node",
		mimetype: "application/json",
		parent: Folders.ROOT_FOLDER_UUID,
		owner: "test@example.com",
		properties: properties,
	});

	if (result.isLeft()) {
		throw new Error("Failed to create mock AspectableNode");
	}

	return result.right;
}

test("Aspects.propertyName should generate correct property name format", () => {
	const property: AspectProperty = {
		name: "test_property",
		title: "Test Property",
		type: "string",
	};

	const aspect = createMockAspectNode([property]);
	const propertyName = Aspects.propertyName(aspect, property);

	expect(propertyName).toBe(`${aspect.uuid}:test_property`);
});

test("Aspects.propertyName should handle different property names", () => {
	const properties: AspectProperty[] = [
		{ name: "simple_name", title: "Simple", type: "string" },
		{ name: "complex_property_name", title: "Complex", type: "number" },
		{ name: "uuid_prop", title: "UUID", type: "uuid" },
	];

	const aspect = createMockAspectNode(properties);

	expect(Aspects.propertyName(aspect, properties[0])).toBe(
		`${aspect.uuid}:simple_name`,
	);
	expect(Aspects.propertyName(aspect, properties[1])).toBe(
		`${aspect.uuid}:complex_property_name`,
	);
	expect(Aspects.propertyName(aspect, properties[2])).toBe(
		`${aspect.uuid}:uuid_prop`,
	);
});

test("Aspects.specificationFrom should return always-true specification for aspect with no properties", () => {
	const aspect = createMockAspectNode([]);
	const specification = Aspects.specificationFrom(aspect);

	const node = createMockAspectableNode();
	const result = specification.isSatisfiedBy(node);

	expect(result.isRight(), (result.value as ValidationError).message).toBe(
		true,
	);
});

test("Aspects.specificationFrom should create specification for single property", () => {
	const property: AspectProperty = {
		name: "test_prop",
		title: "Test Property",
		type: "string",
		required: false,
	};

	const aspect = createMockAspectNode([property]);
	const specification = Aspects.specificationFrom(aspect);

	const node = createMockAspectableNode();
	const result = specification.isSatisfiedBy(node);

	expect(result.isRight(), (result.value as ValidationError).message).toBe(
		true,
	);
});

test("Aspects.specificationFrom should create specification for multiple properties", () => {
	const properties: AspectProperty[] = [
		{ name: "prop1", title: "Property 1", type: "string", required: false },
		{ name: "prop2", title: "Property 2", type: "number", required: false },
	];

	const aspect = createMockAspectNode(properties);
	const specification = Aspects.specificationFrom(aspect);

	const node = createMockAspectableNode();
	const result = specification.isSatisfiedBy(node);

	expect(result.isRight(), (result.value as ValidationError).message).toBe(
		true,
	);
});

test("Aspects.specificationFrom should validate required properties", () => {
	const property: AspectProperty = {
		name: "required_prop",
		title: "Required Property",
		type: "string",
		required: true,
	};

	const aspect = createMockAspectNode([property]);
	const specification = Aspects.specificationFrom(aspect);
	const propertyName = Aspects.propertyName(aspect, property);

	// Test with missing required property
	const nodeWithoutProperty = createMockAspectableNode({});
	const resultWithoutProperty = specification.isSatisfiedBy(
		nodeWithoutProperty,
	);

	expect(resultWithoutProperty.isLeft()).toBe(true);
	expect(resultWithoutProperty.value).toBeInstanceOf(ValidationError);

	// Test with present required property
	const nodeWithProperty = createMockAspectableNode({
		[propertyName]: "test value",
	});
	const resultWithProperty = specification.isSatisfiedBy(nodeWithProperty);

	expect(resultWithProperty.isRight()).toBe(true);
});

test("Aspects.specificationFrom should handle false boolean values for required properties", () => {
	const property: AspectProperty = {
		name: "bool_prop",
		title: "Boolean Property",
		type: "boolean",
		required: true,
	};

	const aspect = createMockAspectNode([property]);
	const specification = Aspects.specificationFrom(aspect);
	const propertyName = Aspects.propertyName(aspect, property);

	// Test with false boolean value (should be valid for required property)
	const nodeWithFalse = createMockAspectableNode({
		[propertyName]: false,
	});
	const result = specification.isSatisfiedBy(nodeWithFalse);

	expect(result.isRight(), (result.value as ValidationError).message).toBe(
		true,
	);
});

test("Aspects.specificationFrom should validate string property types", () => {
	const property: AspectProperty = {
		name: "string_prop",
		title: "String Property",
		type: "string",
		required: false,
	};

	const aspect = createMockAspectNode([property]);
	const specification = Aspects.specificationFrom(aspect);
	const propertyName = Aspects.propertyName(aspect, property);

	// Test with correct string type
	const nodeWithString = createMockAspectableNode({
		[propertyName]: "test string",
	});
	const stringResult = specification.isSatisfiedBy(nodeWithString);

	expect(stringResult.isRight()).toBe(true);

	// Test with incorrect type
	const nodeWithNumber = createMockAspectableNode({
		[propertyName]: 123,
	});
	const numberResult = specification.isSatisfiedBy(nodeWithNumber);

	expect(numberResult.isLeft()).toBe(true);
	expect(numberResult.value).toBeInstanceOf(ValidationError);
});

test("Aspects.specificationFrom should validate number property types", () => {
	const property: AspectProperty = {
		name: "number_prop",
		title: "Number Property",
		type: "number",
		required: false,
	};

	const aspect = createMockAspectNode([property]);
	const specification = Aspects.specificationFrom(aspect);
	const propertyName = Aspects.propertyName(aspect, property);

	// Test with correct number type
	const nodeWithNumber = createMockAspectableNode({
		[propertyName]: 42,
	});
	const numberResult = specification.isSatisfiedBy(nodeWithNumber);

	expect(numberResult.isRight()).toBe(true);

	// Test with incorrect type
	const nodeWithString = createMockAspectableNode({
		[propertyName]: "not a number",
	});
	const stringResult = specification.isSatisfiedBy(nodeWithString);

	expect(stringResult.isLeft()).toBe(true);
	expect(stringResult.value).toBeInstanceOf(ValidationError);
});

test("Aspects.specificationFrom should validate boolean property types", () => {
	const property: AspectProperty = {
		name: "bool_prop",
		title: "Boolean Property",
		type: "boolean",
		required: false,
	};

	const aspect = createMockAspectNode([property]);
	const specification = Aspects.specificationFrom(aspect);
	const propertyName = Aspects.propertyName(aspect, property);

	// Test with correct boolean type
	const nodeWithBoolean = createMockAspectableNode({
		[propertyName]: true,
	});
	const booleanResult = specification.isSatisfiedBy(nodeWithBoolean);

	expect(booleanResult.isRight()).toBe(true);

	// Test with false boolean
	const nodeWithFalse = createMockAspectableNode({
		[propertyName]: false,
	});
	const falseResult = specification.isSatisfiedBy(nodeWithFalse);

	expect(falseResult.isRight()).toBe(true);

	// Test with incorrect type
	const nodeWithString = createMockAspectableNode({
		[propertyName]: "not a boolean",
	});
	const stringResult = specification.isSatisfiedBy(nodeWithString);

	expect(stringResult.isLeft()).toBe(true);
	expect(stringResult.value).toBeInstanceOf(ValidationError);
});

test("Aspects.specificationFrom should skip type validation for undefined/null values", () => {
	const property: AspectProperty = {
		name: "optional_prop",
		title: "Optional Property",
		type: "string",
		required: false,
	};

	const aspect = createMockAspectNode([property]);
	const specification = Aspects.specificationFrom(aspect);
	const propertyName = Aspects.propertyName(aspect, property);

	// Test with undefined value
	const nodeWithUndefined = createMockAspectableNode({
		[propertyName]: undefined,
	});
	const undefinedResult = specification.isSatisfiedBy(nodeWithUndefined);

	expect(undefinedResult.isRight()).toBe(true);

	// Test with null value
	const nodeWithNull = createMockAspectableNode({
		[propertyName]: null,
	});
	const nullResult = specification.isSatisfiedBy(nodeWithNull);

	expect(nullResult.isRight()).toBe(true);

	// Test with empty string
	const nodeWithEmpty = createMockAspectableNode({
		[propertyName]: "",
	});
	const emptyResult = specification.isSatisfiedBy(nodeWithEmpty);

	expect(emptyResult.isRight()).toBe(true);
});

test("Aspects.specificationFrom should handle non-primitive types gracefully", () => {
	const properties: AspectProperty[] = [
		{ name: "uuid_prop", title: "UUID Property", type: "uuid" },
		{ name: "object_prop", title: "Object Property", type: "object" },
		{ name: "array_prop", title: "Array Property", type: "array" },
		{ name: "file_prop", title: "File Property", type: "file" },
	];

	const aspect = createMockAspectNode(properties);
	const specification = Aspects.specificationFrom(aspect);

	const node = createMockAspectableNode({
		[`${aspect.uuid}:uuid_prop`]: "some-uuid",
		[`${aspect.uuid}:object_prop`]: { key: "value" },
		[`${aspect.uuid}:array_prop`]: [1, 2, 3],
		[`${aspect.uuid}:file_prop`]: "file-reference",
	});

	const result = specification.isSatisfiedBy(node);

	// These should pass as the type validation for non-primitive types returns right(true)
	expect(result.isRight(), (result.value as ValidationError).message).toBe(
		true,
	);
});

test("Aspects.specificationFrom should combine multiple property validations", () => {
	const properties: AspectProperty[] = [
		{
			name: "required_string",
			title: "Required String",
			type: "string",
			required: true,
		},
		{
			name: "optional_number",
			title: "Optional Number",
			type: "number",
			required: false,
		},
	];

	const aspect = createMockAspectNode(properties);
	const specification = Aspects.specificationFrom(aspect);

	// Test with all valid properties
	const validNode = createMockAspectableNode({
		[`${aspect.uuid}:required_string`]: "valid string",
		[`${aspect.uuid}:optional_number`]: 42,
	});
	const validResult = specification.isSatisfiedBy(validNode);

	expect(validResult.isRight()).toBe(true);

	// Test with missing required property
	const invalidNode = createMockAspectableNode({
		[`${aspect.uuid}:optional_number`]: 42,
	});
	const invalidResult = specification.isSatisfiedBy(invalidNode);

	expect(invalidResult.isLeft()).toBe(true);
	expect(invalidResult.value).toBeInstanceOf(ValidationError);

	// Test with type mismatch
	const typeMismatchNode = createMockAspectableNode({
		[`${aspect.uuid}:required_string`]: "valid string",
		[`${aspect.uuid}:optional_number`]: "not a number",
	});
	const typeMismatchResult = specification.isSatisfiedBy(typeMismatchNode);

	expect(typeMismatchResult.isLeft()).toBe(true);
	expect(typeMismatchResult.value).toBeInstanceOf(ValidationError);
});

test("Aspects.specificationFrom should handle empty property name", () => {
	const property: AspectProperty = {
		name: "",
		title: "Empty Name Property",
		type: "string",
	};

	const aspect = createMockAspectNode([property]);
	const propertyName = Aspects.propertyName(aspect, property);

	expect(propertyName).toBe(`${aspect.uuid}:`);
});

test("Aspects class should not be instantiable", () => {
	// The constructor is private, so this should cause a TypeScript error
	// but we can test that the class behaves as a utility class
	expect(typeof Aspects).toBe("function");
	expect(typeof Aspects.propertyName).toBe("function");
	expect(typeof Aspects.specificationFrom).toBe("function");
});

test("Aspects.specificationFrom should validate validationList for string properties", () => {
	const property: AspectProperty = {
		name: "list_prop",
		title: "List Property",
		type: "string",
		validationList: ["apple", "banana", "cherry"],
	};

	const aspect = createMockAspectNode([property]);
	const specification = Aspects.specificationFrom(aspect);
	const propertyName = Aspects.propertyName(aspect, property);

	// Test with a valid value
	const nodeWithValidValue = createMockAspectableNode({
		[propertyName]: "banana",
	});
	const validResult = specification.isSatisfiedBy(nodeWithValidValue);
	expect(validResult.isRight(), (validResult.value as ValidationError)?.message)
		.toBe(true);

	// Test with an invalid value
	const nodeWithInvalidValue = createMockAspectableNode({
		[propertyName]: "grape",
	});
	const invalidResult = specification.isSatisfiedBy(nodeWithInvalidValue);
	expect(invalidResult.isLeft()).toBe(true);
	expect(invalidResult.value).toBeInstanceOf(ValidationError);
});

test("Aspects.specificationFrom should validate validationList for array of strings", () => {
	const property: AspectProperty = {
		name: "list_array_prop",
		title: "List Array Property",
		type: "array",
		arrayType: "string",
		validationList: ["apple", "banana", "cherry"],
	};

	const aspect = createMockAspectNode([property]);
	const specification = Aspects.specificationFrom(aspect);
	const propertyName = Aspects.propertyName(aspect, property);

	// Test with a valid array
	const nodeWithValidArray = createMockAspectableNode({
		[propertyName]: ["apple", "cherry"],
	});
	const validResult = specification.isSatisfiedBy(nodeWithValidArray);
	expect(validResult.isRight(), (validResult.value as ValidationError)?.message)
		.toBe(true);

	// Test with an array containing an invalid value
	const nodeWithInvalidArray = createMockAspectableNode({
		[propertyName]: ["apple", "grape"],
	});
	const invalidResult = specification.isSatisfiedBy(nodeWithInvalidArray);
	expect(invalidResult.isLeft()).toBe(true);
	expect(invalidResult.value).toBeInstanceOf(ValidationError);
});

test("Aspects.specificationFrom should validate validationRegex for string properties", () => {
	const property: AspectProperty = {
		name: "regex_prop",
		title: "Regex Property",
		type: "string",
		validationRegex: "^[a-z]+$",
	};

	const aspect = createMockAspectNode([property]);
	const specification = Aspects.specificationFrom(aspect);
	const propertyName = Aspects.propertyName(aspect, property);

	// Test with a valid value
	const nodeWithValidValue = createMockAspectableNode({
		[propertyName]: "abc",
	});
	const validResult = specification.isSatisfiedBy(nodeWithValidValue);
	expect(validResult.isRight(), (validResult.value as ValidationError)?.message)
		.toBe(true);

	// Test with an invalid value
	const nodeWithInvalidValue = createMockAspectableNode({
		[propertyName]: "aBc",
	});
	const invalidResult = specification.isSatisfiedBy(nodeWithInvalidValue);
	expect(invalidResult.isLeft()).toBe(true);
	expect(invalidResult.value).toBeInstanceOf(ValidationError);
});

test("Aspects.specificationFrom should validate validationRegex for array of strings", () => {
	const property: AspectProperty = {
		name: "regex_array_prop",
		title: "Regex Array Property",
		type: "array",
		arrayType: "string",
		validationRegex: "^[a-z]+$",
	};

	const aspect = createMockAspectNode([property]);
	const specification = Aspects.specificationFrom(aspect);
	const propertyName = Aspects.propertyName(aspect, property);

	// Test with a valid array
	const nodeWithValidArray = createMockAspectableNode({
		[propertyName]: ["abc", "xyz"],
	});
	const validResult = specification.isSatisfiedBy(nodeWithValidArray);
	expect(validResult.isRight(), (validResult.value as ValidationError)?.message)
		.toBe(true);

	// Test with an array containing an invalid value
	const nodeWithInvalidArray = createMockAspectableNode({
		[propertyName]: ["abc", "xYz"],
	});
	const invalidResult = specification.isSatisfiedBy(nodeWithInvalidArray);
	expect(invalidResult.isLeft()).toBe(true);
	expect(invalidResult.value).toBeInstanceOf(ValidationError);
});

test("AspectNode creation should fail for invalid property constraints", () => {
	// Test that number type with validationList fails
	const numberWithListResult = AspectNode.create({
		title: "Test Aspect",
		owner: "test@example.com",
		properties: [{
			name: "list_prop_number",
			title: "List Property Number",
			type: "number",
			validationList: ["1", "2"],
		}],
	});

	expect(numberWithListResult.isLeft()).toBe(true);
	expect(numberWithListResult.value).toBeInstanceOf(ValidationError);

	// Test that boolean type with validationRegex fails
	const booleanWithRegexResult = AspectNode.create({
		title: "Test Aspect",
		owner: "test@example.com",
		properties: [{
			name: "regex_prop_boolean",
			title: "Regex Property Boolean",
			type: "boolean",
			validationRegex: "true",
		}],
	});

	expect(booleanWithRegexResult.isLeft()).toBe(true);
	expect(booleanWithRegexResult.value).toBeInstanceOf(ValidationError);
});
