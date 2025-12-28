import { AIModel } from "./ai_model.ts";

export interface AIModelDTO {
	modelName: string;
	embeddings: boolean;
	llm: boolean;
	tools: boolean;
	files: boolean;
	reasoning: boolean;
}

export function aiModelToDto(metadata: AIModel): AIModelDTO {
	return {
		modelName: metadata.modelName,
		embeddings: metadata.embeddings,
		llm: metadata.llm,
		tools: metadata.tools,
		files: metadata.files,
		reasoning: metadata.reasoning,
	} as AIModelDTO;
}
