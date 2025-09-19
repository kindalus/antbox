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

  expect(result.isRight()).toBe(true);
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

  expect(result.isRight()).toBe(true);
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

  expect(result.isRight()).toBe(true);
  expect(result.right.mimetype).toBe(Nodes.ASPECT_MIMETYPE);
});

test("AspectNode.create should always have aspects folder as parent", () => {
  const result = AspectNode.create({
    title: "Test aspect",
    parent: "custom-parent",
    owner: "user@domain.com",
  });

  expect(result.isRight()).toBe(true);
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
      stringMimetype: "application/pdf",
    },
  ];

  const result = AspectNode.create({
    title: "Complex aspect",
    owner: "user@domain.com",
    properties: properties,
  });

  expect(result.isRight()).toBe(true);
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

  expect(result.isRight()).toBe(true);
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

  expect(result.isRight()).toBe(true);
  const aspectNode = result.right;
  expect(aspectNode.properties).toEqual([]);
  expect(aspectNode.filters).toEqual([]);
});
