import { loadTemplate, TEMPLATES } from "api/templates/index.ts";
import type { OCRProvider } from "domain/ai/ocr_provider.ts";
import type { NodeFilters } from "domain/nodes/node_filter.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { DOCS, loadDoc } from "../../../docs/index.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";
import type { NodeService } from "../nodes/node_service.ts";
import { type AntboxError, BadRequestError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";

interface SystemAIToolContext {
	nodeService: NodeService;
	ocrProvider?: OCRProvider;
}

export async function runSystemAITool<T>(
	ctx: AuthenticationContext,
	name: string,
	args: Record<string, unknown>,
	dependencies: SystemAIToolContext,
): Promise<Either<AntboxError, T>> {
	try {
		let result: Either<AntboxError, unknown>;

		switch (name) {
			case "NodeService:find":
				result = await dependencies.nodeService.find(
					ctx,
					args.filters as NodeFilters,
					args.pageSize as number ?? 20,
					args.pageToken as number ?? 1,
				);
				break;
			case "NodeService:get":
				result = await dependencies.nodeService.get(ctx, args.uuid as string);
				break;
			case "NodeService:create":
				result = await dependencies.nodeService.create(ctx, args.metadata as NodeMetadata);
				break;
			case "NodeService:duplicate":
				result = await dependencies.nodeService.duplicate(ctx, args.uuid as string);
				break;
			case "NodeService:copy":
				result = await dependencies.nodeService.copy(
					ctx,
					args.uuid as string,
					args.parent as string,
				);
				break;
			case "NodeService:breadcrumbs":
				result = await dependencies.nodeService.breadcrumbs(ctx, args.uuid as string);
				break;
			case "NodeService:delete":
				result = await dependencies.nodeService.delete(ctx, args.uuid as string);
				break;
			case "NodeService:update":
				result = await dependencies.nodeService.update(
					ctx,
					args.uuid as string,
					args.metadata as NodeMetadata,
				);
				break;
			case "NodeService:export":
				result = await dependencies.nodeService.export(ctx, args.uuid as string);
				break;
			case "NodeService:list":
				result = await dependencies.nodeService.list(ctx, args.parent as string);
				break;
			case "OcrModel:ocr": {
				if (!dependencies.ocrProvider) {
					return left(new UnknownError("OCR provider not initialized"));
				}

				const fileOrErr = await dependencies.nodeService.export(ctx, args.uuid as string);
				if (fileOrErr.isLeft()) {
					return left(fileOrErr.value);
				}

				result = await dependencies.ocrProvider.ocr(fileOrErr.value);
				break;
			}
			case "Templates:list":
				result = right(TEMPLATES);
				break;
			case "Templates:get": {
				const template = await loadTemplate(args.uuid as string);
				if (!template) {
					return left(new NodeNotFoundError(`Template '${args.uuid}' not found`));
				}
				result = right(template.content);
				break;
			}
			case "Docs:list":
				result = right(DOCS);
				break;
			case "Docs:get": {
				const doc = await loadDoc(args.uuid as string);
				if (!doc) {
					return left(new NodeNotFoundError(`Documentation '${args.uuid}' not found`));
				}
				result = right(doc.content);
				break;
			}
			default:
				return left(new BadRequestError("Unknown tool"));
		}

		return result as Either<AntboxError, T>;
	} catch (error) {
		return left(new BadRequestError(`Unknown error: ${(error as Error).message}`));
	}
}
