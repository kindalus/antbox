import { Either, left, right } from "../../shared/either.ts";
import { AntboxError, UnknownError } from "../../shared/antbox_error.ts";
import { OcrEngine } from "../../application/OcrEngine.ts";

export default function buildTesseractOcrEngine(
	cmdName = "tesseract",
): Promise<Either<AntboxError, OcrEngine>> {
	return Promise.resolve(right(new TesseractOcrEngine(cmdName)));
}

export class TesseractOcrEngine implements OcrEngine {
	constructor(private readonly cmdName: string) {}

	async #writeToDisk(src: File): Promise<string> {
		const path = Deno.makeTempFileSync({ prefix: "antx" });

		await src.arrayBuffer().then((data) => Deno.writeFileSync(path, new Uint8Array(data)));

		return path;
	}

	convertPdfToTiff(path: string): Either<AntboxError, string> {
		const off = `${path}.tiff`;

		const args = [
			"-sDEVICE=tiff24nc",
			"-o",
			off,
			"-r100",
			"-dSAFER",
            "-dQUIET", 
			path,
		];

		const cmd = new Deno.Command("gs", { args });

		const { success, stderr } = cmd.outputSync();

		if (!success) {
			console.error("Failed to convert PDF to TIFF");
			console.error("Stderr:", new TextDecoder().decode(stderr));

			Deno.removeSync(off);

			return left(new UnknownError("Failed to convert PDF to TIFF"));
		}

		Deno.removeSync(path);
		return right(off);
	}

	async callTesseract(
		cmdName: string,
		src: string,
		lang: string,
	): Promise<Either<AntboxError, string>> {
		const language = getLanguage(lang);

		const cmd = new Deno.Command(cmdName, {
			args: [
				src,
				"stdout",
				"-l",
				language,
			],

			stdout: "piped",
		});

		const child = cmd.spawn();

		const chunks: Uint8Array[] = [];
		await child.stdout.pipeTo(memWriter(chunks));

		const status = await child.status;

		if (!status.success) {
			console.error("Failed to recognize text");
			return left(new UnknownError("Failed to recognize text"));
		}

		const blob = new Blob(chunks, { type: "text/plain" });
		const result = new TextDecoder().decode(await blob.arrayBuffer(), { stream: true });

		return right(result);
	}

	async recognize(src: File, lang = "por"): Promise<Either<AntboxError, string>> {
		let path: string | undefined;

		try {
			path = await this.#writeToDisk(src);

			if (src.type === "application/pdf") {
				const pathOrErr = this.convertPdfToTiff(path);

				if (pathOrErr.isLeft()) {
					Deno.removeSync(path);

					return left(pathOrErr.value);
				}

				path = pathOrErr.value;
			}

			const textOrErr = await this.callTesseract(this.cmdName, path, lang);

			Deno.removeSync(path);

			if (textOrErr.isLeft()) return left(textOrErr.value);

			return right(textOrErr.value);
		} catch (e) {
			if (path) Deno.removeSync(path);

			console.error("Failed to recognize text", e);
			return Promise.resolve(left(new UnknownError("Failed to recognize text")));
		}
	}
}

function getLanguage(lang: string): string {
	switch (lang) {
		case "eng":
			return "eng";
		case "en":
			return "eng";
		default:
			return "por";
	}
}

function memWriter(chunks: Uint8Array[]): WritableStream<Uint8Array> {
	const writableStream = new WritableStream({
		write(chunk) {
			return new Promise<void>((resolve) => {
				chunks.push(chunk);

				resolve();
			});
		},

		close() {
		},

		abort() {
			console.error("Failed to write to memory");
		},
	});

	return writableStream;
}
