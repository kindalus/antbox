# Features (formerly Skills)

This module contains the implementation of Features, which are the core extensible functionality units in the Antbox system. Features were previously called "Skills" but have been renamed to be more intuitive and better reflect their purpose.

## What are Features?

Features are JavaScript functions that expose new functionalities to the Antbox system. They can be:

- **Actions**: Execute operations on specific nodes
- **Extensions**: Provide functionality through browser extensions
- **AI Tools**: Expose functionality for AI model integration
- **Direct Features**: Run standalone functionality

## Feature Structure

A Feature must implement the `Feature` interface:

```typescript
export interface Feature {
  uuid: string;
  name: string;
  description: string;
  exposeAction: boolean;
  runOnCreates: boolean;
  runOnUpdates: boolean;
  runManually: boolean;
  filters: NodeFilter[];
  exposeExtension: boolean;
  exposeAITool: boolean;
  runAs?: string;
  groupsAllowed: string[];
  parameters: FeatureParameter[];
  returnType:
    | "string"
    | "number"
    | "boolean"
    | "array"
    | "object"
    | "file"
    | "void";
  returnDescription?: string;
  returnContentType?: string;

  run(ctx: RunContext, args: Record<string, unknown>): Promise<unknown>;
}
```

## Migration from Skills

### Backward Compatibility

The system maintains backward compatibility with existing Skills:

- Skills continue to work with the `application/vnd.antbox.skill` mimetype
- New Features use the `application/vnd.antbox.feature` mimetype
- Both Skills and Features folders are supported (`--skills--` and `--features--`)

### Key Changes

1. **Terminology**: `Skill` → `Feature`, `SkillNode` → `FeatureNode`, etc.
2. **Folder**: New features should be placed in the Features folder
3. **Imports**: Update imports from `domain/skills/` to `domain/features/`

### Migration Path

To migrate existing skills to features:

1. Update imports:

   ```typescript
   // Old
   import { Skill } from "domain/skills/skill.ts";

   // New
   import { Feature } from "domain/features/feature.ts";
   ```

2. Rename interfaces and types:

   ```typescript
   // Old
   export interface MySkill extends Skill {}

   // New
   export interface MyFeature extends Feature {}
   ```

3. Update function names:

   ```typescript
   // Old
   fileToFunction();
   skillToNodeMetadata();

   // New
   fileToFeature();
   featureToNodeMetadata();
   ```

## File Organization

- `feature.ts` - Core Feature interface and utilities
- `feature_node.ts` - FeatureNode class and FeatureParameter interface
- `feature_run_context.ts` - Runtime context for feature execution
- `feature_not_found_error.ts` - Error handling
- `action.ts` - Action-specific functionality
- `ext.ts` - Extension-specific functionality
- `ai_tool.ts` - AI tool-specific functionality

## Example Feature

```typescript
import { Feature, FeatureParameter } from "domain/features/feature.ts";

const myFeature: Feature = {
  uuid: "my-feature-uuid",
  name: "My Feature",
  description: "Does something useful",
  exposeAction: true,
  runOnCreates: false,
  runOnUpdates: false,
  runManually: true,
  filters: [],
  exposeExtension: false,
  exposeAITool: true,
  groupsAllowed: [],
  parameters: [
    {
      name: "input",
      type: "string",
      required: true,
      description: "Input parameter",
    },
  ],
  returnType: "string",

  async run(ctx, args) {
    return `Processed: ${args.input}`;
  },
};

export default myFeature;
```

## Usage Guide

### When to Use Features

Features are ideal for:

- **Data Processing**: Transform or analyze content
- **External API Integration**: Connect to third-party services
- **Automation**: Perform repetitive tasks automatically
- **Content Generation**: Create new content based on inputs
- **Validation**: Check data integrity or format compliance

### Feature Types

#### 1. Actions (`exposeAction: true`)

Use when you need to operate on specific nodes in the system:

```typescript
// Good for: file processing, node manipulation, bulk operations
exposeAction: true,
runOnCreates: true, // Auto-run when nodes are created
filters: [{ field: "mimetype", operator: "equals", value: "text/plain" }]
```

#### 2. Extensions (`exposeExtension: true`)

Use for browser-based functionality:

```typescript
// Good for: UI enhancements, browser automation, user interactions
exposeExtension: true,
runManually: true,
parameters: [/* user input parameters */]
```

#### 3. AI Tools (`exposeAITool: true`)

Use for AI model integration:

```typescript
// Good for: AI assistant capabilities, data analysis, content generation
exposeAITool: true,
returnType: "string", // or appropriate type for AI consumption
returnDescription: "Detailed description for AI models"
```

### Best Practices

1. **Naming**: Use descriptive names that clearly indicate the feature's purpose
2. **Parameters**: Always provide descriptions and set appropriate defaults
3. **Error Handling**: Include proper error handling in your `run()` method
4. **Return Types**: Match return type with actual returned data structure
5. **Security**: Use `groupsAllowed` to restrict access when needed
6. **Filters**: Be specific with filters to avoid unnecessary executions

### Testing Features

Create test cases for your features:

```typescript
// test_example_feature.ts
import exampleFeature from "./example_feature.ts";
import { RunContext } from "./feature_run_context.ts";

const mockContext: RunContext = {
  authenticationContext: { user: { uuid: "test-user" } },
  nodeService: mockNodeService,
};

const result = await exampleFeature.run(mockContext, {
  text: "hello world",
  format: "title",
});

console.assert(result.processedText === "Hello World");
```

### Migration Checklist

When migrating from Skills to Features:

- [ ] Update all import statements
- [ ] Rename interface implementations
- [ ] Update function calls (`fileToFunction` → `fileToFeature`)
- [ ] Test functionality with new Feature interface
- [ ] Update any documentation or comments
- [ ] Consider using new Features folder for organization

## AI Tool Integration

Features can be exposed as AI Tools for integration with AI systems. This replaces the previous MCP (Model Context Protocol) terminology with more intuitive "AI Tool" naming.

### Creating AI Tools

To create a feature that works with AI systems:

```typescript
import { Feature, AIToolMetadata } from "domain/features/feature.ts";

const myAITool: Feature = {
  uuid: "ai-content-generator-001",
  name: "Content Generator",
  description:
    "Generates content based on prompts and parameters for AI consumption",

  // AI Tool specific settings
  exposeAITool: true, // Makes this available to AI systems
  exposeAction: false,
  exposeExtension: false,

  parameters: [
    {
      name: "prompt",
      type: "string",
      required: true,
      description: "The content generation prompt",
    },
    {
      name: "style",
      type: "string",
      required: false,
      description: "Writing style: 'formal', 'casual', 'technical'",
      defaultValue: "formal",
    },
  ],

  returnType: "object",
  returnDescription: "Generated content with metadata for AI processing",

  async run(ctx, args) {
    return {
      content: `Generated content for: ${args.prompt}`,
      style: args.style,
      metadata: {
        wordCount: 150,
        readabilityScore: 85,
      },
    };
  },
};
```

### AI Tool Registry

Register and manage AI tools:

```typescript
import {
  AIToolRegistry,
  validateAIToolFeature,
} from "domain/features/ai_tool.ts";

// Register a tool
AIToolRegistry.register(myAITool);

// Get all AI tools
const allTools = AIToolRegistry.getAllTools();

// Get tools by category
const dataTools = AIToolRegistry.getToolsByCategory("data-analysis");

// Validate AI tool configuration
const validation = validateAIToolFeature(myAITool);
if (!validation.isValid) {
  console.error("AI tool validation errors:", validation.errors);
}
```

### AI Tool Execution

Execute AI tools with enhanced error handling:

```typescript
import { AIToolRunner } from "domain/features/ai_tool.ts";

const result = await AIToolRunner.executeAITool(myAITool, context, {
  prompt: "Write a summary",
});

if (result.success) {
  console.log("Result:", result.result);
  console.log("Execution time:", result.metadata.executionTime);
} else {
  console.error("Error:", result.error);
}
```

### Best Practices for AI Tools

1. **Detailed Descriptions**: Provide comprehensive descriptions for AI understanding
2. **Structured Output**: Return well-structured data that AI models can easily process
3. **Parameter Documentation**: Document all parameters with clear descriptions
4. **Error Handling**: Implement robust error handling for AI consumption
5. **Metadata**: Include relevant metadata in responses

## Migration Utilities

The `migration_utils.ts` file provides comprehensive tools to help with the Skills to Features migration:

### Automated Migration

```typescript
import { SkillToFeatureMigration } from "domain/features/migration_utils.ts";

// Convert a skill to feature
const feature = SkillToFeatureMigration.skillToFeature(existingSkill);

// Generate migration report
const report = SkillToFeatureMigration.generateMigrationReport(existingSkill);
console.log(`Effort: ${report.estimatedEffort}`);
console.log(`Warnings: ${report.warnings.length}`);
```

### Batch Migration Analysis

For large codebases with many skills:

```typescript
import { BatchMigrationUtils } from "domain/features/migration_utils.ts";

// Analyze all skills
const analysis = BatchMigrationUtils.analyzeSkillsForMigration(allSkills);

// Generate migration plan
const plan = BatchMigrationUtils.generateMigrationPlan(allSkills);
console.log(`Total estimated time: ${plan.totalEstimatedTime}`);
```

### Migration Script Generation

Automatically generate migration template code:

```typescript
const script = SkillToFeatureMigration.generateMigrationScript(skill);
// Outputs a complete TypeScript file template
```

### Validation

Ensure migrations maintain compatibility:

```typescript
const validation = SkillToFeatureMigration.validateMigration(
  originalSkill,
  migratedFeature,
);

if (!validation.isValid) {
  console.error("Migration errors:", validation.errors);
}
```
