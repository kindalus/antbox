import { Node, FolderNode, FileNode } from "/domain/nodes/node.ts";
import { SmartFolderNode } from "./smart_folder_node.ts";
export class NodeFactory {
  static fromMimetype(
    mimetype: string
  ): Node | FileNode | SmartFolderNode | FolderNode {
    switch (mimetype) {
      case Node.FOLDER_MIMETYPE:
        return new FolderNode();
      case Node.SMART_FOLDER_MIMETYPE:
        return new SmartFolderNode();
      case Node.META_NODE_MIMETYPE:
        return new Node();
      default:
        return new FileNode();
    }
  }

  static fromJson(
    json: unknown
  ): Node | FileNode | SmartFolderNode | FolderNode {
    const node = Object.assign(
      NodeFactory.fromMimetype((json as { mimetype: string }).mimetype),
      json
    );

    return node;
  }

  static composeSmartFolder(...p: Partial<SmartFolderNode>[]): SmartFolderNode {
    return Object.assign(new SmartFolderNode(), ...p);
  }

  static composeFolder(...p: Partial<FolderNode>[]): FolderNode {
    return Object.assign(new FolderNode(), ...p);
  }

  static composeNode(...p: Partial<Node>[]): Node {
    const mimetype = p.find((n) => n.mimetype)?.mimetype;
    return Object.assign(NodeFactory.fromMimetype(mimetype!), ...p);
  }
}
