import type {
  CallToolRequest,
  CallToolResult,
  GetPromptRequest,
  GetPromptResult,
  InitializeRequest,
  InitializeResult,
  ListPromptsRequest,
  ListPromptsResult,
  ListResourcesRequest,
  ListResourcesResult,
  ListToolsRequest,
  ListToolsResult,
  ReadResourceRequest,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import { Transport } from "./transport";

export class RemoteClient {
  private transport: Transport;

  constructor(serverUrl: string, token?: string) {
    this.transport = new Transport(serverUrl, token);
  }

  async initialize(request: InitializeRequest): Promise<InitializeResult> {
    return this.transport.request("initialize", request);
  }

  async listTools(request: ListToolsRequest): Promise<ListToolsResult> {
    return this.transport.request("tools/list", request);
  }

  async callTool(request: CallToolRequest): Promise<CallToolResult> {
    return this.transport.request("tools/call", request);
  }

  async listResources(
    request: ListResourcesRequest,
  ): Promise<ListResourcesResult> {
    return this.transport.request("resources/list", request);
  }

  async readResource(
    request: ReadResourceRequest,
  ): Promise<ReadResourceResult> {
    return this.transport.request("resources/read", request);
  }

  async listPrompts(request: ListPromptsRequest): Promise<ListPromptsResult> {
    return this.transport.request("prompts/list", request);
  }

  async getPrompt(request: GetPromptRequest): Promise<GetPromptResult> {
    return this.transport.request("prompts/get", request);
  }

  async subscribe(
    channel: string,
    onData: (data: unknown) => void,
  ): Promise<void> {
    return this.transport.subscribe(channel, onData);
  }

  async unsubscribe(channel: string): Promise<void> {
    return this.transport.unsubscribe(channel);
  }
}
