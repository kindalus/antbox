import { z } from "zod";
import { BadRequestError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";

export async function parseJsonBody<T>(
	req: Request,
	schema: z.ZodType<T>,
): Promise<Either<BadRequestError, T>> {
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return left(new BadRequestError("Invalid JSON body"));
	}
	const parsed = schema.safeParse(body);
	if (!parsed.success) {
		return left(
			new BadRequestError(parsed.error.issues.map((issue) => issue.message).join("; ")),
		);
	}
	return right(parsed.data);
}
