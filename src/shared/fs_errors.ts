function hasCode(error: unknown, ...codes: string[]): boolean {
	if (typeof error !== "object" || error === null) return false;
	const code = (error as { code?: unknown }).code;
	return typeof code === "string" && codes.includes(code);
}

export function isNotFoundError(error: unknown): boolean {
	return hasCode(error, "ENOENT");
}

export function isAlreadyExistsError(error: unknown): boolean {
	return hasCode(error, "EEXIST");
}

export function isPermissionDeniedError(error: unknown): boolean {
	return hasCode(error, "EACCES", "EPERM");
}

export function isNotSupportedError(error: unknown): boolean {
	return hasCode(error, "ENOTSUP", "ENOSYS");
}
