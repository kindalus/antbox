import type { FeatureData } from "domain/configuration/feature_data.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { type AntboxError, BadRequestError, ForbiddenError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { kebabToCamelCase } from "shared/string_utils.ts";
import { ValidationError } from "shared/validation_error.ts";

interface FeatureExtensionContext {
	getFeature(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, FeatureData>>;
	execute(
		params: Record<string, unknown>,
		requestUrl: Readonly<URL>,
	): Promise<Either<AntboxError, unknown>>;
}

export async function runFeatureExtension(
	ctx: AuthenticationContext,
	uuid: string,
	request: Request,
	dependencies: FeatureExtensionContext,
): Promise<Response> {
	const featureOrErr = await dependencies.getFeature(ctx, uuid);
	if (featureOrErr.isLeft()) {
		return new Response(featureOrErr.value.message, {
			status: featureOrErr.value instanceof ForbiddenError ? 403 : 404,
		});
	}

	const feature = featureOrErr.value;
	if (!feature.exposeExtension) {
		return new Response("Feature is not exposed as extension", { status: 400 });
	}

	const paramsOrErr = await extractParameters(request);
	if (paramsOrErr.isLeft()) {
		return new Response(paramsOrErr.value.message, { status: 400 });
	}

	const params = Object.fromEntries(
		Object.entries(paramsOrErr.value).map(([key, value]) => [kebabToCamelCase(key), value]),
	);
	const resultOrErr = await dependencies.execute(params, safeRequestUrl(request));
	if (resultOrErr.isLeft()) {
		return new Response(resultOrErr.value.message, { status: errorStatus(resultOrErr.value) });
	}

	return extensionResponse(feature, resultOrErr.value);
}

function errorStatus(error: AntboxError): number {
	if (error instanceof ValidationError || error instanceof BadRequestError) {
		return 400;
	}

	return error instanceof ForbiddenError ? 403 : 500;
}

async function extractParameters(
	request: Request,
): Promise<Either<BadRequestError, Record<string, unknown>>> {
	if (request.method === "GET") {
		return right(Object.fromEntries(new URL(request.url).searchParams));
	}

	if (request.method !== "POST") {
		return left(new BadRequestError("Unsupported HTTP method"));
	}

	const contentType = request.headers.get("content-type") || "";
	if (contentType.includes("application/json")) {
		try {
			return right(await request.json());
		} catch {
			return left(new BadRequestError("Invalid JSON body"));
		}
	}

	if (
		contentType.includes("application/x-www-form-urlencoded") ||
		contentType.includes("multipart/form-data")
	) {
		try {
			return right(Object.fromEntries(await request.formData()));
		} catch {
			return left(new BadRequestError("Invalid form body"));
		}
	}

	return left(new BadRequestError(`Unsupported content type: ${contentType}`));
}

function safeRequestUrl(request: Request): Readonly<URL> {
	const url = new URL(request.url);
	url.username = "";
	url.password = "";
	url.search = "";
	url.hash = "";
	return url;
}

function extensionResponse(feature: FeatureData, value: unknown): Response {
	if (value instanceof Response) {
		return value;
	}

	if (!value || feature.returnType === "void") {
		return new Response("OK", { status: 200 });
	}

	switch (feature.returnType) {
		case "file": {
			const file = value as File;
			return new Response(file, {
				headers: {
					"Content-Type": file.type,
					"Content-Disposition": `attachment; filename="${file.name}"`,
				},
			});
		}
		case "array":
		case "object":
			return new Response(JSON.stringify(value), {
				headers: { "Content-Type": "application/json" },
			});
		default:
			return new Response(`${value}`, {
				headers: {
					"Content-Type": feature.returnContentType ?? "text/plain",
				},
				status: 200,
			});
	}
}
