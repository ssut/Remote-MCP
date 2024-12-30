import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  CancelledNotificationSchema,
  GetPromptRequestSchema,
  InitializeRequestSchema,
  InitializeResultSchema,
  LATEST_PROTOCOL_VERSION,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  LoggingMessageNotificationSchema,
  ProgressNotificationSchema,
  PromptListChangedNotificationSchema,
  ReadResourceRequestSchema,
  ResourceListChangedNotificationSchema,
  ResourceUpdatedNotificationSchema,
  SetLevelRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { AppRouter } from "@rcp/server";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { z } from "zod";

export interface MCPClientOptions {
  name: string;
  version: string;
  remoteUrl: string;
  authToken?: string;
  onError?: (error: Error) => void;
}

export class MCPClient {
  private server: Server;
  private trpc: ReturnType<typeof createTRPCClient<AppRouter>>;
  private options: MCPClientOptions;

  constructor(options: MCPClientOptions) {
    this.options = options;

    // Initialize tRPC client
    this.trpc = createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: options.remoteUrl,
          headers: options.authToken
            ? {
                Authorization: `Bearer ${options.authToken}`,
              }
            : undefined,
        }),
      ],
    });

    // Initialize MCP Server
    this.server = new Server(
      {
        name: options.name,
        version: options.version,
      },
      {
        capabilities: {
          tools: {
            listChanged: true,
          },
          resources: {
            subscribe: true,
            listChanged: true,
          },
          prompts: {
            listChanged: true,
          },
          logging: {},
        },
      },
    );
  }

  private async setupHandlers() {
    // Initialize handler
    this.server.setRequestHandler(InitializeRequestSchema, async (request) => {
      try {
        const result = await this.trpc.initialize.mutate(request.params);
        return result;
      } catch (error) {
        this.options.onError?.(error as Error);
        throw error;
      }
    });

    // Tools handlers
    this.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
      try {
        return this.trpc["tools/list"].query(request.params);
      } catch (error) {
        this.options.onError?.(error as Error);
        throw error;
      }
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        return this.trpc["tools/call"].mutate(request.params);
      } catch (error) {
        this.options.onError?.(error as Error);
        throw error;
      }
    });

    // Resources handlers
    this.server.setRequestHandler(
      ListResourcesRequestSchema,
      async (request) => {
        try {
          return this.trpc["resources/list"].query(request.params);
        } catch (error) {
          this.options.onError?.(error as Error);
          throw error;
        }
      },
    );

    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        try {
          return this.trpc["resources/read"].query(request.params);
        } catch (error) {
          this.options.onError?.(error as Error);
          throw error;
        }
      },
    );

    // Resource subscription handlers
    this.server.setRequestHandler(SubscribeRequestSchema, async (request) => {
      try {
        return this.trpc["resources/subscribe"].mutate(request.params);
      } catch (error) {
        this.options.onError?.(error as Error);
        throw error;
      }
    });

    this.server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
      try {
        return this.trpc["resources/unsubscribe"].mutate(request.params);
      } catch (error) {
        this.options.onError?.(error as Error);
        throw error;
      }
    });

    // Prompts handlers
    this.server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
      try {
        return this.trpc["prompts/list"].query(request.params);
      } catch (error) {
        this.options.onError?.(error as Error);
        throw error;
      }
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      try {
        return this.trpc["prompts/get"].query(request.params);
      } catch (error) {
        this.options.onError?.(error as Error);
        throw error;
      }
    });

    // Logging handler
    this.server.setRequestHandler(SetLevelRequestSchema, async (request) => {
      try {
        return this.trpc["logging/setLevel"].mutate(request.params);
      } catch (error) {
        this.options.onError?.(error as Error);
        throw error;
      }
    });

    // Set up subscriptions and notifications
    // Resources list changes
    if (this.server.capabilities?.resources?.listChanged) {
      this.trpc["notifications/resources/list_changed"].subscribe(undefined, {
        onData: () => {
          this.server.notification(ResourceListChangedNotificationSchema, {});
        },
      });
    }

    // Resource updates
    if (this.server.capabilities?.resources?.subscribe) {
      this.trpc["notifications/resources/updated"].subscribe(undefined, {
        onData: (data: { uri: string }) => {
          this.server.notification(ResourceUpdatedNotificationSchema, {
            uri: data.uri,
          });
        },
      });
    }

    // Tool list changes
    if (this.server.capabilities?.tools?.listChanged) {
      this.trpc["notifications/tools/list_changed"].subscribe(undefined, {
        onData: () => {
          this.server.notification(ToolListChangedNotificationSchema, {});
        },
      });
    }

    // Prompt list changes
    if (this.server.capabilities?.prompts?.listChanged) {
      this.trpc["notifications/prompts/list_changed"].subscribe(undefined, {
        onData: () => {
          this.server.notification(PromptListChangedNotificationSchema, {});
        },
      });
    }

    // Progress notifications
    this.trpc["notifications/progress"].subscribe(undefined, {
      onData: (data: {
        progressToken: string | number;
        progress?: number;
        total?: number;
      }) => {
        this.server.notification(ProgressNotificationSchema, {
          progressToken: data.progressToken,
          progress: data.progress,
          total: data.total,
        });
      },
    });

    // Logging messages
    if (this.server.capabilities?.logging) {
      this.trpc["notifications/logging/message"].subscribe(undefined, {
        onData: (data: {
          level: string;
          logger: string;
          data: Record<string, unknown>;
        }) => {
          this.server.notification(LoggingMessageNotificationSchema, {
            level: data.level,
            logger: data.logger,
            data: data.data,
          });
        },
      });
    }
  }

  async start() {
    await this.setupHandlers();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error(`RCP MCP Client (${this.options.name}) running on stdio`);
  }
}

// Export the RemoteClient for direct API usage
export { RemoteClient } from "./client";
