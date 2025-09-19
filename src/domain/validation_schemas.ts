import z from "zod";
import { AntboxError } from "shared/antbox_error.ts";
import {
  PropertyFormatError,
  PropertyRequiredError,
  PropertyTypeError,
  UnknownPropertyError,
} from "./nodes/property_errors.ts";
import { $ZodIssue } from "zod/v4/core";

export function uuid() {
  const uuidValidationSchema = z.string().regex(
    /^(\w{8,}|---\w+---)$/,
    "Invalid UUID format",
  );

  return uuidValidationSchema;
}

export function toPropertyError(issue: $ZodIssue): AntboxError {
  const fieldName = issue.path.length > 0 ? String(issue.path[0]) : "unknown";

  switch (issue.code) {
    case "too_small":
      return (new PropertyRequiredError(fieldName));

    case "invalid_format":
      return (new PropertyFormatError(
        fieldName,
        issue.format,
        issue.message,
      ));

    case "invalid_type":
      return (new PropertyTypeError(
        fieldName,
        issue.expected,
        issue.message,
      ));

    default:
      return (new UnknownPropertyError(fieldName, issue.message));
  }
}
