import { Feature } from "./feature.ts";
import { RunContext } from "./feature_run_context.ts";

/**
 * AI Tool specific configuration and utilities
 *
 * This module provides functionality for integrating features with AI systems,
 * replacing the previous MCP (Model Context Protocol) terminology with more
 * intuitive "AI Tool" naming.
 */

/**
 * AI Tool metadata for enhanced AI integration
 */
export interface AIToolMetadata {
  /** Tool name as seen by AI models */
  toolName: string;

  /** Detailed description for AI understanding */
  aiDescription: string;

  /** Schema for AI tool calling */
  inputSchema: {
    type: "object";
    properties: Record<
      string,
      {
        type: string;
        description: string;
        required?: boolean;
        enum?: string[];
        default?: unknown;
      }
    >;
    required: string[];
  };

  /** Expected output format description for AI */
  outputDescription: string;

  /** Usage examples for AI models */
  examples?: Array<{
    input: Record<string, unknown>;
    output: unknown;
    description: string;
  }>;

  /** Category for AI tool organization */
  category?:
    | "data-analysis"
    | "content-generation"
    | "file-processing"
    | "communication"
    | "utility"
    | "other";
}

/**
 * Enhanced Feature interface for AI tool integration
 */
export interface AIToolFeature extends Feature {
  /** Always true for AI tools */
  exposeAITool: true;

  /** AI-specific metadata */
  aiToolMetadata?: AIToolMetadata;
}

/**
 * Utility to convert a Feature to AI Tool format
 */
export function featureToAITool(feature: Feature): AIToolMetadata | null {
  if (!feature.exposeAITool) {
    return null;
  }

  // Generate input schema from feature parameters
  const inputSchema: AIToolMetadata["inputSchema"] = {
    type: "object",
    properties: {},
    required: [],
  };

  feature.parameters.forEach((param) => {
    inputSchema.properties[param.name] = {
      type: param.type,
      description: param.description || `Parameter ${param.name}`,
      default: param.defaultValue,
    };

    if (param.required) {
      inputSchema.required.push(param.name);
    }
  });

  return {
    toolName: feature.name.toLowerCase().replace(/\s+/g, "_"),
    aiDescription: feature.description,
    inputSchema,
    outputDescription:
      feature.returnDescription || `Returns ${feature.returnType}`,
    category: "utility",
  };
}

/**
 * Validates that a feature is properly configured for AI tool usage
 */
export function validateAIToolFeature(feature: Feature): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!feature.exposeAITool) {
    errors.push("Feature must have exposeAITool set to true");
  }

  if (!feature.description || feature.description.length < 10) {
    errors.push(
      "AI tools require a detailed description (minimum 10 characters)",
    );
  }

  if (!feature.returnDescription && feature.returnType !== "void") {
    warnings.push(
      "AI tools should have returnDescription for better AI understanding",
    );
  }

  if (feature.parameters.some((p) => !p.description)) {
    warnings.push(
      "All parameters should have descriptions for better AI integration",
    );
  }

  if (feature.name.length > 50) {
    warnings.push(
      "Tool name should be concise for better AI usage (recommended under 50 characters)",
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * AI Tool execution wrapper with enhanced error handling
 */
export class AIToolRunner {
  /**
   * Execute an AI tool feature with proper error handling and logging
   */
  static async executeAITool(
    feature: Feature,
    context: RunContext,
    args: Record<string, unknown>,
  ): Promise<{
    success: boolean;
    result?: unknown;
    error?: string;
    metadata: {
      executionTime: number;
      toolName: string;
      inputSize: number;
      timestamp: string;
    };
  }> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    try {
      // Validate that feature is configured as AI tool
      const validation = validateAIToolFeature(feature);
      if (!validation.isValid) {
        throw new Error(
          `AI Tool validation failed: ${validation.errors.join(", ")}`,
        );
      }

      // Execute the feature
      const result = await feature.run(context, args);
      const executionTime = Date.now() - startTime;

      return {
        success: true,
        result,
        metadata: {
          executionTime,
          toolName: feature.name,
          inputSize: JSON.stringify(args).length,
          timestamp,
        },
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
        metadata: {
          executionTime,
          toolName: feature.name,
          inputSize: JSON.stringify(args).length,
          timestamp,
        },
      };
    }
  }
}

/**
 * AI Tool registry for managing available tools
 */
export class AIToolRegistry {
  private static tools = new Map<string, Feature>();

  /**
   * Register a feature as an AI tool
   */
  static register(feature: Feature): void {
    if (!feature.exposeAITool) {
      throw new Error(
        `Feature ${feature.name} is not configured as an AI tool`,
      );
    }

    const validation = validateAIToolFeature(feature);
    if (!validation.isValid) {
      throw new Error(
        `Cannot register invalid AI tool: ${validation.errors.join(", ")}`,
      );
    }

    this.tools.set(feature.uuid, feature);
  }

  /**
   * Get all registered AI tools
   */
  static getAllTools(): Feature[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get AI tool by UUID
   */
  static getTool(uuid: string): Feature | undefined {
    return this.tools.get(uuid);
  }

  /**
   * Get AI tool metadata for all registered tools
   */
  static getToolsMetadata(): AIToolMetadata[] {
    return Array.from(this.tools.values())
      .map((feature) => featureToAITool(feature))
      .filter((metadata): metadata is AIToolMetadata => metadata !== null);
  }

  /**
   * Search tools by category
   */
  static getToolsByCategory(category: AIToolMetadata["category"]): Feature[] {
    return this.getAllTools().filter((tool) => {
      const metadata = featureToAITool(tool);
      return metadata?.category === category;
    });
  }

  /**
   * Clear all registered tools (mainly for testing)
   */
  static clear(): void {
    this.tools.clear();
  }
}

/**
 * Backward compatibility alias for MCP
 * @deprecated Use AIToolRegistry instead
 */
export const MCPRegistry = AIToolRegistry;

/**
 * Backward compatibility alias for MCP
 * @deprecated Use AIToolMetadata instead
 */
export type MCPMetadata = AIToolMetadata;

/**
 * Backward compatibility alias for MCP
 * @deprecated Use featureToAITool instead
 */
export const featureToMCP = featureToAITool;
