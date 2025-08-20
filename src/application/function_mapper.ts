import { FunctionDTO } from "application/function_dto.ts";
import { FunctionNode as SkillNode } from "domain/skills/skill_node.ts";

export function nodeToFunction(node: SkillNode): FunctionDTO {
  return {
    id: node.uuid,
    name: node.title,
    description: node.description || "",
    exposeAction: node.exposeAction || false,
    runOnCreates: node.runOnCreates || false,
    runOnUpdates: node.runOnUpdates || false,
    runManually: node.runManually || false,
    filters: node.filters || [],
    exposeMCP: node.exposeMCP || false,
    exposeExtension: node.exposeExtension || false,
    runAs: node.runAs,
    groupsAllowed: node.groupsAllowed || [],
    parameters: node.parameters || [],
    returnType: node.returnType || "void",
    returnDescription: node.returnDescription,
    returnContentType: node.returnContentType,
  };
}
