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
import type { AppRouter } from "@remote-mcp/server";
import { createTRPCClient, httpBatchLink, httpLink } from "@trpc/client";

import type { z } from "zod";

export interface RemoteMCPClientOptions {
  remoteUrl: string;
  authToken?: string;
  onError?: (method: string, error: Error) => void;
}

export class RemoteMCPClient {
  public readonly server: Server;
  public readonly trpc: ReturnType<typeof createTRPCClient<AppRouter>>;
  private readonly options: RemoteMCPClientOptions;

  constructor(options: RemoteMCPClientOptions) {
    this.trpc = createTRPCClient<AppRouter>({
      links: [
        httpLink({
          url: options.remoteUrl,
          headers: options.authToken
            ? {
                Authorization: `Bearer ${options.authToken}`,
              }
            : undefined,
        }),
      ],
    });

    this.server = new Server(
      {
        name: "Remote MCP Client",
        version: "1.0.0",
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

    this.options = {
      onError: (method, error) => {
        this.server.sendLoggingMessage({
          level: "error",
          data: `${method}: error.message`,
        });
      },
      ...options,
    };
  }

  private async setupHandlers() {
    this.server.setRequestHandler(InitializeRequestSchema, async (request) => {
      try {
        return await this.trpc.initialize.mutate(request);
      } catch (error) {
        this.options.onError?.(request.method, error as Error);
      }
    });

    this.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
      try {
        return await this.trpc["tools/list"].query(request);
      } catch (error) {
        this.options.onError?.(request.method, error as Error);
      }
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        return await this.trpc["tools/call"].mutate(request);
      } catch (error) {
        this.options.onError?.(request.method, error as Error);
      }
    });

    this.server.setRequestHandler(
      ListResourcesRequestSchema,
      async (request) => {
        try {
          return await this.trpc["resources/list"].query(request);
        } catch (error) {
          this.options.onError?.(request.method, error as Error);
        }
      },
    );

    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        try {
          return await this.trpc["resources/read"].query(request);
        } catch (error) {
          this.options.onError?.(request.method, error as Error);
        }
      },
    );

    this.server.setRequestHandler(SubscribeRequestSchema, async (request) => {
      try {
        return await this.trpc["resources/subscribe"].mutate(request);
      } catch (error) {
        this.options.onError?.(request.method, error as Error);
      }
    });

    this.server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
      try {
        return await this.trpc["resources/unsubscribe"].mutate(request);
      } catch (error) {
        this.options.onError?.(request.method, error as Error);
      }
    });

    // Prompts handlers
    this.server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
      try {
        return await this.trpc["prompts/list"].query(request);
      } catch (error) {
        this.options.onError?.(request.method, error as Error);
      }
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      try {
        return await this.trpc["prompts/get"].query(request);
      } catch (error) {
        this.options.onError?.(request.method, error as Error);
      }
    });

    // if (this.server.capabilities?.resources?.listChanged) {
    //   this.trpc["notifications/resources/list_changed"].subscribe(undefined, {
    //     onData: () => {
    //       this.server.notification(ResourceListChangedNotificationSchema, {});
    //     },
    //   });
    // }

    // if (this.server.capabilities?.resources?.subscribe) {
    //   this.trpc["notifications/resources/updated"].subscribe(undefined, {
    //     onData: (data: { uri: string }) => {
    //       this.server.notification(ResourceUpdatedNotificationSchema, {
    //         uri: data.uri,
    //       });
    //     },
    //   });
    // }

    // if (this.server.capabilities?.tools?.listChanged) {
    //   this.trpc["notifications/tools/list_changed"].subscribe(undefined, {
    //     onData: () => {
    //       this.server.notification(ToolListChangedNotificationSchema, {});
    //     },
    //   });
    // }

    // if (this.server.capabilities?.prompts?.listChanged) {
    //   this.trpc["notifications/prompts/list_changed"].subscribe(undefined, {
    //     onData: () => {
    //       this.server.notification(PromptListChangedNotificationSchema, {});
    //     },
    //   });
    // }

    // this.trpc["notifications/progress"].subscribe(undefined, {
    //   onData: (data: {
    //     progressToken: string | number;
    //     progress?: number;
    //     total?: number;
    //   }) => {
    //     this.server.notification(ProgressNotificationSchema, {
    //       progressToken: data.progressToken,
    //       progress: data.progress,
    //       total: data.total,
    //     });
    //   },
    // });

    // if (this.server.capabilities?.logging) {
    //   this.trpc["notifications/logging/message"].subscribe(undefined, {
    //     onData: (data: {
    //       level: string;
    //       logger: string;
    //       data: Record<string, unknown>;
    //     }) => {
    //       this.server.notification(LoggingMessageNotificationSchema, {
    //         level: data.level,
    //         logger: data.logger,
    //         data: data.data,
    //       });
    //     },
    //   });
    // }
  }

  async start() {
    this.setupHandlers();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
