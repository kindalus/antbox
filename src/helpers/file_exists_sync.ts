export default function fileExistsSync(filePath: string): boolean {
	try {
		Deno.lstatSync(filePath);
		return true;
	} catch (err) {
		if (err instanceof Deno.errors.NotFound) {
			return false;
		}
		throw err;
	}
}
