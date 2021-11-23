const charTable = buildCharactersArray();

function buildCharactersArray() {
	return ["_"].concat(buildSmallCasesArray().concat(), buildUpperCasesArray(), buildNumbersArray());
}

function buildSmallCasesArray() {
	return generateUnicodeArrayFromCodePoint("a", 25);
}

function buildUpperCasesArray() {
	return generateUnicodeArrayFromCodePoint("A", 25);
}

function buildNumbersArray() {
	return generateUnicodeArrayFromCodePoint("0", 9);
}

function generateUnicodeArrayFromCodePoint(char: string, lenght: number) {
	const initialPosition = char.codePointAt(0) as number;
	return generateUnicodeArray(initialPosition, initialPosition + lenght);
}

function generateUnicodeArray(from: number, to: number): string[] {
	if (to < from) return [];
	return [String.fromCodePoint(from)].concat(generateUnicodeArray(from + 1, to));
}

export function generateUuid(number = 8): string {
	return generateSafiraIdCharacters(number);
}

function generateSafiraIdCharacters(length: number): string {
	if (length === 0) return "";

	const char = Math.floor(Math.random() * charTable.length);

	return charTable[char].concat(generateSafiraIdCharacters(length - 1));
}

export function generateFid(title: string): string {
	return title
		.toLocaleLowerCase()
		.replace(/[áàâäãå]/g, "a")
		.replace(/[ç]/g, "c")
		.replace(/[éèêë]/g, "e")
		.replace(/[íìîï]/g, "i")
		.replace(/ñ/g, "n")
		.replace(/[óòôöõ]/g, "o")
		.replace(/[úùûü]/g, "u")
		.replace(/[ýÿ]/g, "y")
		.replace(/[\W_]/g, "-")
		.trim();
}
