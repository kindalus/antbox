import {
	FormFile,
	MultipartReader,
	NextFunction,
	OpineRequest,
	OpineResponse,
	R,
} from "../../deps.ts";

import fileExistsSync from "../helpers/file_exists_sync.ts";

export type UploadRequest = OpineRequest & { file?: FormFile; parent?: string };

const { compose, nth, split } = R;

const TMP_DIR = Deno.makeTempDirSync({ prefix: "antbox" });
const MAX_FILE_SIZE = Math.pow(1024, 3); // 1GB

const getBoundary = compose(
	nth(1),
	split("="),
	nth(1),
	split(";"),
);

export default function (fieldName = "file") {
	return async (
		oreq: OpineRequest,
		_res: OpineResponse,
		next: NextFunction,
	) => {
		const req: UploadRequest = oreq as unknown as UploadRequest;
		let boundary;

		const contentType = req.get("content-type");

		if (contentType?.startsWith("multipart/form-data")) {
			boundary = getBoundary(contentType);
		}

		if (!(fileExistsSync(TMP_DIR))) {
			await Deno.mkdir(TMP_DIR, { recursive: true });
		}

		const form = await new MultipartReader(req.body, boundary).readForm({
			maxMemory: MAX_FILE_SIZE,
			dir: TMP_DIR,
		});

		req.file = form.files(fieldName)?.[0];
		req.parent = form.values("parent")?.[0];

		next();
	};
}
