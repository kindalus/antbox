/**
 * Compatibility layer for backward compatibility with Skills
 *
 * This module provides type aliases and re-exports to ensure that existing
 * code using Skills continues to work while the migration to Features happens.
 */

// Re-export Feature types as Skill types for backward compatibility
export {
  Feature as Skill,
  FeatureMetadata as SkillMetadata,
  featureToNodeMetadata as skillToNodeMetadata,
  fileToFeature as fileToFunction,
} from "./feature.ts";

export {
  FeatureNode as SkillNode,
  FeatureParameter as SkillParameter,
} from "./feature_node.ts";

export { FeatureNotFoundError as SkillNotFoundError } from "./feature_not_found_error.ts";

export { RunContext } from "./feature_run_context.ts";

// Import original skill types to maintain type compatibility
import { Skill as OriginalSkill } from "domain/skills/skill.ts";
import { SkillNode as OriginalSkillNode } from "domain/skills/skill_node.ts";
import { Feature } from "./feature.ts";
import { FeatureNode } from "./feature_node.ts";

/**
 * Type guard to check if a value is a legacy Skill
 */
export function isLegacySkill(value: any): value is OriginalSkill {
  return (
    value &&
    typeof value === "object" &&
    typeof value.run === "function" &&
    typeof value.uuid === "string" &&
    typeof value.name === "string"
  );
}

/**
 * Type guard to check if a value is a modern Feature
 */
export function isModernFeature(value: any): value is Feature {
  return (
    value &&
    typeof value === "object" &&
    typeof value.run === "function" &&
    typeof value.uuid === "string" &&
    typeof value.name === "string"
  );
}

/**
 * Type guard to check if a node is a legacy SkillNode
 */
export function isLegacySkillNode(node: any): node is OriginalSkillNode {
  return node && node.mimetype === "application/vnd.antbox.skill";
}

/**
 * Type guard to check if a node is a modern FeatureNode
 */
export function isModernFeatureNode(node: any): node is FeatureNode {
  return node && node.mimetype === "application/vnd.antbox.feature";
}

/**
 * Union type that accepts both legacy Skills and modern Features
 */
export type SkillOrFeature = OriginalSkill | Feature;

/**
 * Union type that accepts both legacy SkillNodes and modern FeatureNodes
 */
export type SkillNodeOrFeatureNode = OriginalSkillNode | FeatureNode;

/**
 * Utility function to normalize a Skill or Feature to the modern Feature interface
 */
export function normalizeToFeature(skillOrFeature: SkillOrFeature): Feature {
  if (isModernFeature(skillOrFeature)) {
    return skillOrFeature;
  }

  // Convert legacy skill to feature format
  return {
    uuid: skillOrFeature.uuid,
    name: skillOrFeature.name,
    description: skillOrFeature.description,
    exposeAction: skillOrFeature.exposeAction,
    runOnCreates: skillOrFeature.runOnCreates,
    runOnUpdates: skillOrFeature.runOnUpdates,
    runManually: skillOrFeature.runManually,
    filters: skillOrFeature.filters,
    exposeExtension: skillOrFeature.exposeExtension,
    exposeAITool: skillOrFeature.exposeAITool,
    runAs: skillOrFeature.runAs,
    groupsAllowed: skillOrFeature.groupsAllowed,
    parameters: skillOrFeature.parameters,
    returnType: skillOrFeature.returnType,
    returnDescription: skillOrFeature.returnDescription,
    returnContentType: skillOrFeature.returnContentType,
    run: skillOrFeature.run,
  };
}

/**
 * Utility function to get the appropriate mimetype for a skill or feature
 */
export function getMimetype(skillOrFeature: SkillOrFeature): string {
  if (isModernFeature(skillOrFeature)) {
    return "application/vnd.antbox.feature";
  }
  return "application/vnd.antbox.skill";
}

/**
 * Utility function to get the appropriate folder UUID for a skill or feature
 */
export function getFolderUuid(skillOrFeature: SkillOrFeature): string {
  if (isModernFeature(skillOrFeature)) {
    return "--features--";
  }
  return "--skills--";
}

/**
 * Deprecation warnings for legacy skill usage
 */
export class SkillDeprecationWarnings {
  private static warnedFunctions = new Set<string>();

  static warnSkillUsage(functionName: string, skillName?: string) {
    const warningKey = `${functionName}:${skillName || "unknown"}`;
    if (!this.warnedFunctions.has(warningKey)) {
      console.warn(
        `[DEPRECATED] Using legacy Skill interface for ${skillName || "unnamed skill"}. ` +
          `Please migrate to Feature interface. Function: ${functionName}`,
      );
      this.warnedFunctions.add(warningKey);
    }
  }

  static warnSkillNodeUsage(nodeName?: string) {
    const warningKey = `skillnode:${nodeName || "unknown"}`;
    if (!this.warnedFunctions.has(warningKey)) {
      console.warn(
        `[DEPRECATED] Using legacy SkillNode for ${nodeName || "unnamed node"}. ` +
          `Please migrate to FeatureNode.`,
      );
      this.warnedFunctions.add(warningKey);
    }
  }
}

/**
 * Wrapper functions that provide backward compatibility with deprecation warnings
 */
export function createCompatibleSkill(skillOrFeature: SkillOrFeature): Feature {
  if (isLegacySkill(skillOrFeature)) {
    SkillDeprecationWarnings.warnSkillUsage(
      "createCompatibleSkill",
      skillOrFeature.name,
    );
  }
  return normalizeToFeature(skillOrFeature);
}

/**
 * Configuration for backward compatibility behavior
 */
export interface CompatibilityConfig {
  /** Whether to show deprecation warnings */
  showDeprecationWarnings: boolean;
  /** Whether to allow legacy skill execution */
  allowLegacySkills: boolean;
  /** Whether to automatically migrate skills to features */
  autoMigrate: boolean;
}

/**
 * Global compatibility configuration
 */
let compatibilityConfig: CompatibilityConfig = {
  showDeprecationWarnings: true,
  allowLegacySkills: true,
  autoMigrate: false,
};

/**
 * Configure backward compatibility behavior
 */
export function configureCompatibility(config: Partial<CompatibilityConfig>) {
  compatibilityConfig = { ...compatibilityConfig, ...config };
}

/**
 * Get current compatibility configuration
 */
export function getCompatibilityConfig(): CompatibilityConfig {
  return { ...compatibilityConfig };
}
