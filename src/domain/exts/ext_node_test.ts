import { assertEquals, assertInstanceOf } from "@std/assert";
import { ValidationError } from "../../shared/validation_error.ts";
import { Folders } from "../nodes/folders.ts";
import { Nodes } from "../nodes/nodes.ts";
import { ExtNode } from "./ext_node.ts";

Deno.test("ExtNode constructor should initialize", () => {
    const extNode = ExtNode.create({ title: "ExtNode", owner: "user@domain.com" })
    
    assertEquals(extNode.right.title, "ExtNode")
    assertEquals(extNode.right.owner, "user@domain.com")
    assertEquals(extNode.right.mimetype, Nodes.EXT_MIMETYPE)
    assertEquals(extNode.right.parent, Folders.EXT_FOLDER_UUID)
})

Deno.test("ExtNode constructor should throw error if owner is missing", () => {
    const extNode = ExtNode.create({ title:"ExtNode" })

    assertEquals(extNode.isLeft(), true)
    assertEquals((extNode.value as ValidationError).message, "Node.owner is required")
})

Deno.test("ExtNode constructor should throw error if title is missing", () => {
    const extNode = ExtNode.create({ title:"", owner: "user@domain.com" })

    assertEquals(extNode.isLeft(), true)
    assertEquals((extNode.value as ValidationError).message, "Node.title is required")
})

Deno.test("ExtNode update should modify title", () => {
    const extNode = ExtNode.create({title: "ExtNode title", owner:"user@domain.com"})

    const result = extNode.right.update({ title: "ExtNode title custom" })

    assertEquals(result.isRight(), true)
    assertEquals(extNode.right.title, "ExtNode title custom")
})

Deno.test("ExtNode update should mopdify description", () => {
    const extNode = ExtNode.create({ 
        title: "ExtNode", 
        owner:"user@domain.com", 
        description: "Ext complete"
    })

    const result = extNode.right.update({ description: "Ext complete successfully" })
    
    assertEquals(result.isRight(), true)
    assertEquals(extNode.right.description, "Ext complete successfully")
})

Deno.test("ExtNode update should not modify parent", () => {
    const extNode = ExtNode.create({ title:"ExtNode", owner:"user@domain.com" })

    const result = extNode.right.update({ parent:"--root--" })

    assertEquals(result.isLeft(), true)
    assertInstanceOf(result.value, ValidationError)
    assertEquals(result.value.errors[0].message, "Invalid ExtNode Parent: --root--")
})

Deno.test("ExtNode update should not modify mimetype", () => {
    const extNode = ExtNode.create({ title: "ExNode", owner: "user@gmail.com" })

    extNode.right.update({ mimetype: "image/jpg" }) 
    assertEquals(extNode.right.mimetype, Nodes.EXT_MIMETYPE)
})