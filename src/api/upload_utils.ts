import { BadRequestError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";

export function getUploadFile(formData: FormData): Either<BadRequestError, File> {
	const file = formData.get("file");
	if (!(file instanceof File)) {
		return left(new BadRequestError("{ file } not given in form data"));
	}

	return right(file);
}

export function getFileBasename(fileName: string): string {
	const trimmed = fileName.trim();
	const lastSeparatorIndex = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
	const normalized = lastSeparatorIndex >= 0 ? trimmed.slice(lastSeparatorIndex + 1) : trimmed;
	const extensionIndex = normalized.lastIndexOf(".");

	return extensionIndex > 0 ? normalized.slice(0, extensionIndex) : normalized;
}

export function resolveUploadUuid(
	explicitUuid: string | undefined,
	fileName: string,
	spaceReplacement: "_" | "-" | "camelCase",
	artifactType: "feature" | "aspect",
): Either<BadRequestError, string> {
	const providedUuid = explicitUuid?.trim();
	if (providedUuid) {
		return right(providedUuid);
	}

	const basename = getFileBasename(fileName).trim();
	if (!basename) {
		return left(
			new BadRequestError(
				`${artifactType} uuid not provided and uploaded file name is missing`,
			),
		);
	}

	if (spaceReplacement === "camelCase") {
		const words = basename.split(/[\s_-]+/);
		return right(
			words[0].toLowerCase() +
				words.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(""),
		);
	}

	return right(basename.replaceAll(" ", spaceReplacement));
}
