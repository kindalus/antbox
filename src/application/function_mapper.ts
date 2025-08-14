import { FunctionDTO } from "application/function_dto.ts";
import { FunctionNode } from "domain/functions/function_node.ts";

export function nodeToFunction(node: FunctionNode): FunctionDTO {
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
