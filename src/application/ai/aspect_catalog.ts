import type { AspectData, AspectProperty } from "domain/configuration/aspect_data.ts";

/** Values of one validationList shown before the rest is summarised. */
const MAX_LIST_VALUES = 30;
/** The catalog stops adding aspects past this size, about 3000 tokens. */
const MAX_CATALOG_CHARS = 12_000;

const HEADER = [
	"## Aspect catalog",
	'Aspects classify nodes. Select an aspect with ["aspects","contains","<uuid>"] and filter its properties as "<uuid>:<property>". Listed values are the only valid ones; use them exactly.',
].join("\n");

/**
 * A compact description of the aspects for a system prompt: `uuid (title)` followed by one line
 * per property, `name "title": type<arrayType> [allowed values] (required)`. The title is shown
 * only when it says more than the name.
 */
export function formatAspectCatalog(aspects: readonly AspectData[]): string {
	if (aspects.length === 0) return `${HEADER}\nNo aspects are defined.`;

	const lines = [HEADER];
	let size = HEADER.length;
	for (const [index, aspect] of aspects.entries()) {
		const block = formatAspect(aspect);
		if (size + block.length > MAX_CATALOG_CHARS) {
			lines.push(`(${aspects.length - index} more aspects not listed)`);
			break;
		}
		lines.push(block);
		size += block.length + 1;
	}
	return lines.join("\n");
}

function formatAspect(aspect: AspectData): string {
	const head = `- ${aspect.uuid}${
		aspect.title && aspect.title !== aspect.uuid ? ` (${aspect.title})` : ""
	}`;
	return [head, ...aspect.properties.map((property) => `  - ${formatProperty(property)}`)]
		.join("\n");
}

function formatProperty(property: AspectProperty): string {
	const title = saysMoreThanName(property) ? ` "${property.title}"` : "";
	const type = property.type === "array" && property.arrayType
		? `array<${property.arrayType}>`
		: property.type;
	const values = property.validationList?.length
		? ` ${formatValues(property.validationList)}`
		: "";
	const required = property.required ? " (required)" : "";
	return `${property.name}${title}: ${type}${values}${required}`;
}

function formatValues(values: readonly (string | number)[]): string {
	const shown = values.slice(0, MAX_LIST_VALUES).map((value) => JSON.stringify(value));
	const rest = values.length - shown.length;
	return `[${shown.join(", ")}${rest > 0 ? `, …${rest} more` : ""}]`;
}

function saysMoreThanName(property: AspectProperty): boolean {
	const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
	return !!property.title && normalize(property.title) !== normalize(property.name);
}
