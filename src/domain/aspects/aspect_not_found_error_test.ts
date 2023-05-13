import { assertEquals, assertFalse } from "../../../dev_deps.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { AspectProperty } from "./aspect.ts";
import {
	buildAspectPropertySpec,
	PropertyTypeError,
	RequiredPropertyError,
} from "./aspect_property_spec.ts";

Deno.test("propertyTypeSpec", () => {
	const p = { name: "name", type: "string" };
	const v0 = undefined;
	const v1 = null;
	const v2 = "value";
	const v3 = 0;

	const spec = buildAspectPropertySpec(p as AspectProperty);

	const r0 = spec.isSatisfiedBy(v0);
	const r1 = spec.isSatisfiedBy(v1);
	const r2 = spec.isSatisfiedBy(v2);
	const r3 = spec.isSatisfiedBy(v3);

	assertEquals(r0.isRight(), true);
	assertEquals(r1.isRight(), true);
	assertEquals(r2.isRight(), true);

	assertFalse(r3.isRight());
	assertEquals(
		(r3.value as ValidationError).has(PropertyTypeError.ERROR_CODE),
		true,
	);
});

Deno.test("requiredSpec", () => {
	const p = { name: "name", required: true, type: "string" };
	const v0 = undefined;
	const v1 = null;
	const v2 = "value";
	const v3 = 0;
	const v4 = [] as unknown;

	const spec = buildAspectPropertySpec(p as AspectProperty);

	const r0 = spec.isSatisfiedBy(v0);
	const r1 = spec.isSatisfiedBy(v1);
	const r2 = spec.isSatisfiedBy(v2);
	const r3 = spec.isSatisfiedBy(v3);
	const r4 = spec.isSatisfiedBy(v4);

	assertFalse(r0.isRight());
	assertEquals(
		(r0.value as ValidationError).has(RequiredPropertyError.ERROR_CODE),
		true,
	);

	assertFalse(r1.isRight());
	assertEquals(
		(r1.value as ValidationError).has(RequiredPropertyError.ERROR_CODE),
		true,
	);

	assertEquals(r2.isRight(), true);
	assertFalse(
		(r3.value as ValidationError).has(RequiredPropertyError.ERROR_CODE),
	);

	assertFalse(r4.isRight());
	assertEquals(
		(r4.value as ValidationError).has(RequiredPropertyError.ERROR_CODE),
		true,
	);
});
