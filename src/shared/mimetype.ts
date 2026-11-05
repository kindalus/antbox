export function normalizeMimetype(type: string): string {
	return type
		.toLowerCase()
		.replace(/;\s*charset=utf-8\s*$/, "")
		.replace(/;\s*charset=utf-8\s*;/, ";");
}

export function fileMimetype(file: Blob): string {
	return normalizeMimetype(file.type);
}
