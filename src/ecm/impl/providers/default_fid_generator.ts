import FidGenerator from "../../fid_generator.js";

export default class DefaultFidGenerator implements FidGenerator {
	generate(title: string): string {
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
}
