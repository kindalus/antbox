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

export function toPropertyError(
  className: string,
): (issue: $ZodIssue) => AntboxError {
  return (issue: $ZodIssue) => {
    const fieldName = `${className}.${
      issue.path.length > 0 ? String(issue.path[0]) : "unknown"
    }`;

    switch (issue.code) {
      case "too_small":
        if (issue.minimum === 1) return new PropertyRequiredError(fieldName);

        return new PropertyFormatError(
          fieldName,
          `${issue.minimum ? "at least" : "exactly"} ${
            issue.minimum ?? issue.exact
          } characters long`,
          `"${issue.input}"`,
        );

      case "invalid_format":
        return (new PropertyFormatError(
          fieldName,
          issue.format,
          issue.message,
        ));

      case "invalid_type":
        if (issue.input === undefined || issue.input === undefined) {
          return (new PropertyRequiredError(fieldName));
        }
        return (new PropertyTypeError(
          fieldName,
          issue.expected,
          issue.message,
        ));

      default:
        return (new UnknownPropertyError(fieldName, issue.message));
    }
  };
}
