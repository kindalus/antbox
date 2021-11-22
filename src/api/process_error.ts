import { Response } from "express";

export default function processError(error: any, res: Response) {
	if (error.errorCode && error.errorCode === "NodeNotFoundError") {
		res.statusCode = 404;
		res.write(error.message);
	} else {
		res.statusCode = 500;
		console.error(error);
	}
	res.end();
}
