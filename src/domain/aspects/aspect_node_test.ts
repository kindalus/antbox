import { test } from "bdd";
import { expect } from "expect";
import { ValidationError } from "shared/validation_error.ts";
import { AspectNode, type AspectProperty } from "./aspect_node.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { NodeFilters } from "../nodes/node_filter.ts";

test("AspectNode.create should initialize", () => {
  const result = AspectNode.create({
    title: "New aspect",
    owner: "user@domain.com",
  });

  expect(result.isRight(), (result.value as ValidationError).message).toBe(
    true,
  );
  const aspectNode = result.right;
  expect(Nodes.isAspect(aspectNode)).toBe(true);
  expect(aspectNode.title).toBe("New aspect");
  expect(aspectNode.parent).toBe(Folders.ASPECTS_FOLDER_UUID);
  expect(aspectNode.owner).toBe("user@domain.com");
  expect(aspectNode.mimetype).toBe(Nodes.ASPECT_MIMETYPE);
  expect(aspectNode.properties).toEqual([]);
  expect(aspectNode.filters).toEqual([]);
});

test("AspectNode.create should initialize with properties and filters", () => {
  const properties: AspectProperty[] = [
    {
      name: "test_property",
      title: "Test Property",
      type: "string",
      required: true,
    },
    {
      name: "number_prop",
      title: "Number Property",
      type: "number",
      default: 42,
    },
  ];

  const filters: NodeFilters = [["mimetype", "==", "application/pdf"]];

  const result = AspectNode.create({
    title: "Test aspect",
    owner: "user@domain.com",
    properties: properties,
    filters: filters,
  });

  expect(result.isRight(), (result.value as ValidationError).message).toBe(
    true,
  );
  const aspectNode = result.right;
  expect(aspectNode.properties).toEqual(properties);
  expect(aspectNode.filters).toEqual(filters);
});

test("AspectNode.create should always have aspect mimetype", () => {
  const result = AspectNode.create({
    title: "Test aspect",
    mimetype: "application/json",
    owner: "user@domain.com",
  });

  expect(result.isRight(), (result.value as ValidationError).message).toBe(
    true,
  );
  expect(result.right.mimetype).toBe(Nodes.ASPECT_MIMETYPE);
});

test("AspectNode.create should always have aspects folder as parent", () => {
  const result = AspectNode.create({
    title: "Test aspect",
    parent: "custom-parent",
    owner: "user@domain.com",
  });

  expect(result.isRight(), (result.value as ValidationError).message).toBe(
    true,
  );
  expect(result.right.parent).toBe(Folders.ASPECTS_FOLDER_UUID);
});

test("AspectNode.create should return error if title is missing", () => {
  const result = AspectNode.create({
    title: "",
    owner: "user@domain.com",
  });

  expect(result.isLeft()).toBe(true);
  expect(result.value).toBeInstanceOf(ValidationError);
});

test("AspectNode.create should return error if owner is missing", () => {
  const result = AspectNode.create({
    title: "Test aspect",
    owner: "",
  });

  expect(result.isLeft()).toBe(true);
  expect(result.value).toBeInstanceOf(ValidationError);
});

test("AspectNode.create should initialize with various property types", () => {
  const properties: AspectProperty[] = [
    {
      name: "string_prop",
      title: "String Property",
      type: "string",
      required: true,
      validationRegex: "^[a-zA-Z]+$",
    },
    {
      name: "number_prop",
      title: "Number Property",
      type: "number",
      default: 100,
    },
    {
      name: "boolean_prop",
      title: "Boolean Property",
      type: "boolean",
      default: false,
    },
    {
      name: "uuid_prop",
      title: "UUID Property",
      type: "uuid",
    },
    {
      name: "array_prop",
      title: "Array Property",
      type: "array",
      arrayType: "string",
    },
    {
      name: "file_prop",
      title: "File Property",
      type: "file",
    },
  ];

  const result = AspectNode.create({
    title: "Complex aspect",
    owner: "user@domain.com",
    properties: properties,
  });

  expect(result.isRight(), (result.value as ValidationError).message).toBe(
    true,
  );
  const aspectNode = result.right;
  expect(aspectNode.properties).toEqual(properties);
});

test("AspectNode.update should modify title, fid, description and filters", async () => {
  const createResult = AspectNode.create({
    title: "Initial aspect",
    owner: "user@domain.com",
    filters: [["mimetype", "==", "text/plain"]],
  });

  const aspectNode = createResult.right;
  const initialModifiedTime = aspectNode.modifiedTime;

  const timeout = (t: number) =>
    new Promise((res) => setTimeout(() => res(undefined), t));
  await timeout(5);

  const newFilters: NodeFilters = [["title", "contains", "test"]];
  const updateResult = aspectNode.update({
    title: "Updated aspect",
    fid: "new-fid",
    description: "Updated description",
    filters: newFilters,
  });

  expect(updateResult.isRight()).toBe(true);
  expect(aspectNode.title).toBe("Updated aspect");
  expect(aspectNode.fid).toBe("new-fid");
  expect(aspectNode.description).toBe("Updated description");
  expect(aspectNode.filters).toEqual(newFilters);
  expect(aspectNode.modifiedTime > initialModifiedTime).toBe(true);
});

test("AspectNode.update should modify properties", () => {
  const initialProperties: AspectProperty[] = [
    {
      name: "initial_prop",
      title: "Initial Property",
      type: "string",
    },
  ];

  const createResult = AspectNode.create({
    title: "Test aspect",
    owner: "user@domain.com",
    properties: initialProperties,
  });

  const aspectNode = createResult.right;

  const newProperties: AspectProperty[] = [
    {
      name: "updated_prop",
      title: "Updated Property",
      type: "number",
      required: true,
    },
    {
      name: "second_prop",
      title: "Second Property",
      type: "boolean",
      default: true,
    },
  ];

  const updateResult = aspectNode.update({
    properties: newProperties,
  });

  expect(updateResult.isRight()).toBe(true);
  expect(aspectNode.properties).toEqual(newProperties);
});

test("AspectNode.update should not change createdTime", () => {
  const createResult = AspectNode.create({
    title: "Test aspect",
    owner: "user@domain.com",
  });

  const aspectNode = createResult.right;
  const createdTime = aspectNode.createdTime;

  aspectNode.update({ title: "Another title" });
  expect(aspectNode.createdTime).toBe(createdTime);
});

test("AspectNode.update should return error if title is missing", () => {
  const aspectNodeOrErr = AspectNode.create({
    title: "Initial aspect",
    owner: "user@domain.com",
  });

  expect(aspectNodeOrErr.isRight()).toBe(true);

  const result = aspectNodeOrErr.right.update({ title: "" });

  expect(result.isLeft()).toBe(true);
  expect(result.value).toBeInstanceOf(ValidationError);
});

test("AspectNode.update should not modify parent", () => {
  const createResult = AspectNode.create({
    title: "Test aspect",
    owner: "user@domain.com",
  });

  const aspectNode = createResult.right;

  aspectNode.update({ parent: "custom-parent" });
  expect(aspectNode.parent).toBe(Folders.ASPECTS_FOLDER_UUID);
});

test("AspectNode.update should not modify mimetype", () => {
  const createResult = AspectNode.create({
    title: "Test aspect",
    owner: "user@domain.com",
  });

  const aspectNode = createResult.right;

  aspectNode.update({ mimetype: "application/json" });
  expect(aspectNode.mimetype).toBe(Nodes.ASPECT_MIMETYPE);
});

test("AspectNode properties should support validation configuration", () => {
  const properties: AspectProperty[] = [
    {
      name: "validated_string",
      title: "Validated String",
      type: "string",
      required: true,
      validationRegex: "^[A-Z]+$",
      searchable: true,
    },
    {
      name: "list_property",
      title: "List Property",
      type: "string",
      validationList: ["option1", "option2", "option3"],
    },
    {
      name: "filtered_property",
      title: "Filtered Property",
      type: "uuid",
      validationFilters: [["mimetype", "==", "application/vnd.antbox.folder"]],
    },
    {
      name: "readonly_property",
      title: "Readonly Property",
      type: "string",
      readonly: true,
      default: "readonly_value",
    },
  ];

  const result = AspectNode.create({
    title: "Validation aspect",
    owner: "user@domain.com",
    properties: properties,
  });

  expect(result.isRight(), (result.value as ValidationError).message).toBe(
    true,
  );
  const aspectNode = result.right;

  const validatedString = aspectNode.properties.find((p) =>
    p.name === "validated_string"
  );
  expect(validatedString?.validationRegex).toBe("^[A-Z]+$");
  expect(validatedString?.searchable).toBe(true);

  const listProperty = aspectNode.properties.find((p) =>
    p.name === "list_property"
  );
  expect(listProperty?.validationList).toEqual([
    "option1",
    "option2",
    "option3",
  ]);

  const filteredProperty = aspectNode.properties.find((p) =>
    p.name === "filtered_property"
  );
  expect(filteredProperty?.validationFilters).toEqual([[
    "mimetype",
    "==",
    "application/vnd.antbox.folder",
  ]]);

  const readonlyProperty = aspectNode.properties.find((p) =>
    p.name === "readonly_property"
  );
  expect(readonlyProperty?.readonly).toBe(true);
  expect(readonlyProperty?.default).toBe("readonly_value");
});

test("AspectNode should handle empty filters and properties gracefully", () => {
  const result = AspectNode.create({
    title: "Empty aspect",
    owner: "user@domain.com",
    properties: [],
    filters: [],
  });

  expect(result.isRight(), (result.value as ValidationError).message).toBe(
    true,
  );
  const aspectNode = result.right;
  expect(aspectNode.properties).toEqual([]);
  expect(aspectNode.filters).toEqual([]);
});

test("ValidationList should only be used when type is 'string' or when type is 'array' and arrayType is 'string'", () => {
  // Valid case: string type with validationList
  const validStringResult = AspectNode.create({
    title: "Test aspect",
    owner: "user@domain.com",
    properties: [{
      name: "string_list_prop",
      title: "String List Property",
      type: "string",
      validationList: ["option1", "option2", "option3"],
    }],
  });

  expect(
    validStringResult.isRight(),
    (validStringResult.value as ValidationError).message,
  ).toBe(true);

  // Valid case: array type with string arrayType and validationList
  const validArrayResult = AspectNode.create({
    title: "Test aspect",
    owner: "user@domain.com",
    properties: [{
      name: "array_list_prop",
      title: "Array List Property",
      type: "array",
      arrayType: "string",
      validationList: ["option1", "option2", "option3"],
    }],
  });

  expect(
    validArrayResult.isRight(),
    (validArrayResult.value as ValidationError).message,
  ).toBe(true);

  // Invalid case: number type with validationList
  const invalidNumberResult = AspectNode.create({
    title: "Test aspect",
    owner: "user@domain.com",
    properties: [{
      name: "number_list_prop",
      title: "Number List Property",
      type: "number",
      validationList: ["1", "2", "3"],
    }],
  });

  expect(invalidNumberResult.isLeft()).toBe(true);
  expect(invalidNumberResult.value).toBeInstanceOf(ValidationError);

  // Invalid case: array type with non-string arrayType and validationList
  const invalidArrayResult = AspectNode.create({
    title: "Test aspect",
    owner: "user@domain.com",
    properties: [{
      name: "array_number_list_prop",
      title: "Array Number List Property",
      type: "array",
      arrayType: "number",
      validationList: ["1", "2", "3"],
    }],
  });

  expect(invalidArrayResult.isLeft()).toBe(true);
  expect(invalidArrayResult.value).toBeInstanceOf(ValidationError);
});

test("ValidationRegex should only be used when type is 'string' or when type is 'array' and arrayType is 'string'", () => {
  // Valid case: string type with validationRegex
  const validStringResult = AspectNode.create({
    title: "Test aspect",
    owner: "user@domain.com",
    properties: [{
      name: "string_regex_prop",
      title: "String Regex Property",
      type: "string",
      validationRegex: "^[A-Z]+$",
    }],
  });

  expect(
    validStringResult.isRight(),
    (validStringResult.value as ValidationError).message,
  ).toBe(true);

  // Valid case: array type with string arrayType and validationRegex
  const validArrayResult = AspectNode.create({
    title: "Test aspect",
    owner: "user@domain.com",
    properties: [{
      name: "array_regex_prop",
      title: "Array Regex Property",
      type: "array",
      arrayType: "string",
      validationRegex: "^[A-Z]+$",
    }],
  });

  expect(
    validArrayResult.isRight(),
    (validArrayResult.value as ValidationError).message,
  ).toBe(true);

  // Invalid case: number type with validationRegex
  const invalidNumberResult = AspectNode.create({
    title: "Test aspect",
    owner: "user@domain.com",
    properties: [{
      name: "number_regex_prop",
      title: "Number Regex Property",
      type: "number",
      validationRegex: "^[0-9]+$",
    }],
  });

  expect(invalidNumberResult.isLeft()).toBe(true);
  expect(invalidNumberResult.value).toBeInstanceOf(ValidationError);

  // Invalid case: boolean type with validationRegex
  const invalidBooleanResult = AspectNode.create({
    title: "Test aspect",
    owner: "user@domain.com",
    properties: [{
      name: "boolean_regex_prop",
      title: "Boolean Regex Property",
      type: "boolean",
      validationRegex: "true|false",
    }],
  });

  expect(invalidBooleanResult.isLeft()).toBe(true);
  expect(invalidBooleanResult.value).toBeInstanceOf(ValidationError);
});

test("ValidationFilters should only be used when type is 'uuid' or when type is 'array' and arrayType is 'uuid'", () => {
  // Valid case: uuid type with validationFilters
  const validUuidResult = AspectNode.create({
    title: "Test aspect",
    owner: "user@domain.com",
    properties: [{
      name: "uuid_filter_prop",
      title: "UUID Filter Property",
      type: "uuid",
      validationFilters: [["mimetype", "==", "application/vnd.antbox.folder"]],
    }],
  });

  expect(
    validUuidResult.isRight(),
    (validUuidResult.value as ValidationError).message,
  ).toBe(true);

  // Valid case: array type with uuid arrayType and validationFilters
  const validArrayResult = AspectNode.create({
    title: "Test aspect",
    owner: "user@domain.com",
    properties: [{
      name: "array_uuid_filter_prop",
      title: "Array UUID Filter Property",
      type: "array",
      arrayType: "uuid",
      validationFilters: [["mimetype", "==", "application/vnd.antbox.folder"]],
    }],
  });

  expect(
    validArrayResult.isRight(),
    (validArrayResult.value as ValidationError).message,
  ).toBe(true);

  // Invalid case: string type with validationFilters
  const invalidStringResult = AspectNode.create({
    title: "Test aspect",
    owner: "user@domain.com",
    properties: [{
      name: "string_filter_prop",
      title: "String Filter Property",
      type: "string",
      validationFilters: [["mimetype", "==", "application/vnd.antbox.folder"]],
    }],
  });

  expect(invalidStringResult.isLeft()).toBe(true);
  expect(invalidStringResult.value).toBeInstanceOf(ValidationError);

  // Invalid case: array type with non-uuid arrayType and validationFilters
  const invalidArrayResult = AspectNode.create({
    title: "Test aspect",
    owner: "user@domain.com",
    properties: [{
      name: "array_string_filter_prop",
      title: "Array String Filter Property",
      type: "array",
      arrayType: "string",
      validationFilters: [["mimetype", "==", "application/vnd.antbox.folder"]],
    }],
  });

  expect(invalidArrayResult.isLeft()).toBe(true);
  expect(invalidArrayResult.value).toBeInstanceOf(ValidationError);
});

test("String mimetype should only be used when type is 'string'", () => {
  // Valid case: string type with stringMimetype
  const validStringResult = AspectNode.create({
    title: "Test aspect",
    owner: "user@domain.com",
    properties: [{
      name: "string_mimetype_prop",
      title: "String Mimetype Property",
      type: "string",
      stringMimetype: "application/json",
    }],
  });

  expect(
    validStringResult.isRight(),
    (validStringResult.value as ValidationError).message,
  ).toBe(true);

  // Invalid case: number type with stringMimetype
  const invalidNumberResult = AspectNode.create({
    title: "Test aspect",
    owner: "user@domain.com",
    properties: [{
      name: "number_mimetype_prop",
      title: "Number Mimetype Property",
      type: "number",
      stringMimetype: "application/json",
    }],
  });

  expect(invalidNumberResult.isLeft()).toBe(true);
  expect(invalidNumberResult.value).toBeInstanceOf(ValidationError);

  // Invalid case: file type with stringMimetype (file should use its own mimetype handling)
  const invalidFileResult = AspectNode.create({
    title: "Test aspect",
    owner: "user@domain.com",
    properties: [{
      name: "file_string_mimetype_prop",
      title: "File String Mimetype Property",
      type: "file",
      stringMimetype: "application/json",
    }],
  });

  expect(invalidFileResult.isLeft()).toBe(true);
  expect(invalidFileResult.value).toBeInstanceOf(ValidationError);
});

test("Default value should be valid according to all property constraints", () => {
  // Valid case: string default matching validationRegex
  const validRegexResult = AspectNode.create({
    title: "Test aspect",
    owner: "user@domain.com",
    properties: [{
      name: "regex_prop",
      title: "Regex Property",
      type: "string",
      validationRegex: "^[A-Z]+$",
      default: "VALID",
    }],
  });

  expect(
    validRegexResult.isRight(),
    (validRegexResult.value as ValidationError).message,
  ).toBe(true);

  // Invalid case: string default not matching validationRegex
  const invalidRegexResult = AspectNode.create({
    title: "Test aspect",
    owner: "user@domain.com",
    properties: [{
      name: "invalid_regex_prop",
      title: "Invalid Regex Property",
      type: "string",
      validationRegex: "^[A-Z]+$",
      default: "invalid123",
    }],
  });

  expect(invalidRegexResult.isLeft()).toBe(true);
  expect(invalidRegexResult.value).toBeInstanceOf(ValidationError);

  // Valid case: string default in validationList
  const validListResult = AspectNode.create({
    title: "Test aspect",
    owner: "user@domain.com",
    properties: [{
      name: "list_prop",
      title: "List Property",
      type: "string",
      validationList: ["option1", "option2", "option3"],
      default: "option2",
    }],
  });

  expect(
    validListResult.isRight(),
    (validListResult.value as ValidationError).message,
  ).toBe(true);

  // Invalid case: string default not in validationList
  const invalidListResult = AspectNode.create({
    title: "Test aspect",
    owner: "user@domain.com",
    properties: [{
      name: "invalid_list_prop",
      title: "Invalid List Property",
      type: "string",
      validationList: ["option1", "option2", "option3"],
      default: "invalid_option",
    }],
  });

  expect(invalidListResult.isLeft()).toBe(true);
  expect(invalidListResult.value).toBeInstanceOf(ValidationError);

  // Valid case: number default within expected range
  const validNumberResult = AspectNode.create({
    title: "Test aspect",
    owner: "user@domain.com",
    properties: [{
      name: "number_prop",
      title: "Number Property",
      type: "number",
      default: 42,
    }],
  });

  expect(
    validNumberResult.isRight(),
    (validNumberResult.value as ValidationError).message,
  ).toBe(true);

  // Invalid case: wrong type for default value
  const invalidTypeResult = AspectNode.create({
    title: "Test aspect",
    owner: "user@domain.com",
    properties: [{
      name: "type_mismatch_prop",
      title: "Type Mismatch Property",
      type: "number",
      default: "not_a_number",
    }],
  });

  expect(invalidTypeResult.isLeft()).toBe(true);
  expect(invalidTypeResult.value).toBeInstanceOf(ValidationError);
});
