# AI Agents

Antbox comes with a powerful AI agent framework that allows you to create and interact with
conversational AI agents. These agents can be used to answer questions, search for information, and
perform actions on your behalf.

## Creating an Agent

To create an agent, you need to send a POST request to the `/agents` endpoint with the agent's
configuration.

Here is an example of how to create a simple agent:

```json
{
	"title": "My First Agent",
	"model": "default",
	"systemInstructions": "You are a helpful assistant."
}
```

This will create a new agent that uses the default AI model and has a simple system instruction.

### Agent Configuration

Here are some of the most important agent configuration properties:

- `title`: The title of the agent.
- `model`: The AI model to use. You can use the `default` model, or you can configure your own
  models.
- `systemInstructions`: The instructions that are given to the agent to define its personality and
  behavior.
- `useTools`: Whether the agent is allowed to use AI tools.
- `tools`: A list of the AI tools that the agent is allowed to use.

## Chatting with an Agent

Once you have created an agent, you can chat with it by sending a POST request to the
`/agents/{uuid}/-/chat` endpoint.

Here is an example of how to chat with an agent:

```json
{
	"text": "Hello, who are you?"
}
```

The agent will respond with a message based on its system instructions.

## Retrieval-Augmented Generation (RAG)

The RAG service allows you to ground your agents in your own content. When you use the RAG service,
the agent will search for relevant information in the repository before answering your question.

To use the RAG service, you can send a POST request to the `/agents/rag/-/chat` endpoint.

Here is an example of how to use the RAG service:

```json
{
	"text": "What is Antbox?"
}
```

The RAG service will search for documents that contain the word "Antbox" and then use those
documents to generate a response.

### Scoped RAG

You can also scope the RAG service to a specific folder. This is useful if you want to create a
chatbot that can only answer questions about a specific topic.

To scope the RAG service, you can pass the `parent` parameter in the request body:

```json
{
	"text": "What is this document about?",
	"parent": "<folder-uuid>"
}
```

This will cause the RAG service to only search for documents within the specified folder.
