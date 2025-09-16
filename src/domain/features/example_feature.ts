import { Feature, FeatureParameter } from "domain/features/feature.ts";
import { RunContext } from "domain/features/feature_run_context.ts";

/**
 * Example Feature that demonstrates how to create a new feature.
 * This feature processes text input and returns a formatted response.
 */
const exampleFeature: Feature = {
  uuid: "example-feature-001",
  name: "Text Processor",
  description:
    "Processes text input and returns formatted output with metadata",

  // Exposure settings
  exposeAction: true,
  exposeExtension: true,
  exposeAITool: true,

  // Execution settings
  runOnCreates: false,
  runOnUpdates: false,
  runManually: true,

  // Security and permissions
  runAs: undefined,
  groupsAllowed: [],

  // Filters - empty means can run on any node
  filters: [],

  // Parameters definition
  parameters: [
    {
      name: "text",
      type: "string",
      required: true,
      description: "The text to process",
    },
    {
      name: "format",
      type: "string",
      required: false,
      description: "Output format: 'uppercase', 'lowercase', or 'title'",
      defaultValue: "title",
    },
    {
      name: "includeMetadata",
      type: "boolean",
      required: false,
      description: "Whether to include metadata in the response",
      defaultValue: true,
    },
  ],

  // Return type configuration
  returnType: "object",
  returnDescription: "Processed text with optional metadata",
  returnContentType: "application/json",

  // Main execution function
  async run(ctx: RunContext, args: Record<string, unknown>): Promise<unknown> {
    const text = args.text as string;
    const format = (args.format as string) || "title";
    const includeMetadata = (args.includeMetadata as boolean) ?? true;

    if (!text) {
      throw new Error("Text parameter is required");
    }

    let processedText: string;

    switch (format) {
      case "uppercase":
        processedText = text.toUpperCase();
        break;
      case "lowercase":
        processedText = text.toLowerCase();
        break;
      case "title":
        processedText = text.replace(
          /\w\S*/g,
          (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase(),
        );
        break;
      default:
        processedText = text;
    }

    const result: any = {
      processedText,
    };

    if (includeMetadata) {
      result.metadata = {
        originalLength: text.length,
        processedLength: processedText.length,
        format: format,
        timestamp: new Date().toISOString(),
        user: ctx.authenticationContext.user?.uuid || "anonymous",
      };
    }

    return result;
  },
};

export default exampleFeature;
