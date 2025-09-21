# Builtin Features Migration Guide

This document describes the migration of builtin actions to the new Feature-based architecture in Antbox.

## Overview

The builtin functionality has been migrated from the old `builtin_actions` directory to `builtin_features`, updating all implementations to conform to the new `Feature` interface. This enables these features to be exposed as both actions and AI tools.

## Changes Made

### Directory Structure
- **Before**: `src/application/builtin_actions/`
- **After**: `src/application/builtin_features/`

### Feature Interface Compliance

All builtin features now properly implement the `Feature` interface from `domain/features/feature.ts`:

```typescript
interface Feature {
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
  returnType: string;
  returnDescription?: string;
  returnContentType?: string;
  run(ctx: RunContext, args: Record<string, unknown>): Promise<unknown>;
}
```

## Updated Features

### 1. Copy to Folder (`copy_to_folder`)
- **Description**: Copy nodes to a target folder
- **Parameters**:
  - `to` (string): Target folder UUID
  - `uuids` (array): Node UUIDs to copy
- **AI Tool**: ✅ Enabled
- **Action**: ✅ Enabled

### 2. Move to Folder (`move_to_folder`)
- **Description**: Move nodes to a target folder
- **Parameters**:
  - `to` (string): Target folder UUID
  - `uuids` (array): Node UUIDs to move
- **AI Tool**: ✅ Enabled
- **Action**: ✅ Enabled

### 3. Delete All (`delete_all`)
- **Description**: Delete all selected nodes
- **Parameters**:
  - `uuids` (array): Node UUIDs to delete
- **Filters**: Excludes system mimetypes
- **AI Tool**: ✅ Enabled
- **Action**: ✅ Enabled

### 4. Move Up (`move_up`)
- **Description**: Move nodes one level up in folder hierarchy
- **Parameters**:
  - `uuids` (array): Node UUIDs to move up
- **Filters**: Excludes system folders (root, actions, aspects, etc.)
- **AI Tool**: ✅ Enabled
- **Action**: ✅ Enabled

## Key Improvements

### 1. Unified Interface
All features now use the same `Feature` interface, ensuring consistency across the system.

### 2. AI Tool Integration
Features are automatically exposed as AI tools with proper parameter definitions:
- Type-safe parameter handling
- Clear descriptions for AI consumption
- Structured return types

### 3. Better Error Handling
- Features throw exceptions instead of returning error objects
- More descriptive error messages
- Consistent error handling patterns

### 4. Parameter Standardization
- All parameters passed as single `args` object
- Type-safe parameter extraction
- Required parameter validation

### 5. Enhanced Metadata
- Proper return type specifications
- Detailed parameter descriptions
- Clear feature descriptions

## Migration Benefits

1. **Consistency**: All features follow the same interface pattern
2. **AI Integration**: Automatic exposure as AI tools for LLM consumption
3. **Type Safety**: Better TypeScript support and validation
4. **Extensibility**: Easier to add new features following the same pattern
5. **Documentation**: Self-documenting through parameter definitions

## Backward Compatibility

- Legacy `builtinActions` export maintained for backward compatibility
- Existing feature service integration preserved
- No breaking changes to external APIs

## Usage Examples

### As Action
```javascript
// Execute copy_to_folder action
await featureService.runFeature(ctx, 'copy_to_folder', {
  uuids: ['uuid1', 'uuid2'],
  to: 'target-folder-uuid'
});
```

### As AI Tool
The features are automatically available to AI agents through the MCP (Model Context Protocol) integration, allowing natural language requests like:
- "Copy these documents to the reports folder"
- "Move all PDFs up one level"
- "Delete the selected files"

## Future Enhancements

With this new architecture, it's easier to:
1. Add new builtin features
2. Expose features through different interfaces
3. Add parameter validation and type checking
4. Generate API documentation automatically
5. Integrate with external AI systems
