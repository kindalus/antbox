export function kebabToCamelCase(str: string): string {
	if (!/[\s_-]/.test(str)) return str;
	const words = str.split(/[\s_-]+/);
	return words[0].toLowerCase() +
		words.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
}
