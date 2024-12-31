import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  InitializeRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { AppRouter } from '@remote-mcp/server';
import {
  type CreateTRPCClient,
  createTRPCClient,
  httpBatchLink,
} from '@trpc/client';

export interface RemoteMCPClientOptions {
  remoteUrl: string;
  headers?: Record<string, string>;
  onError?: (method: string, error: Error) => void;
}

export class RemoteMCPClient {
  public readonly server: Server;
  public readonly trpc: CreateTRPCClient<AppRouter>;
  private readonly options: RemoteMCPClientOptions;

  constructor(options: RemoteMCPClientOptions) {
    this.trpc = createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: options.remoteUrl,
          headers: options.headers,
        }),
      ],
    });

    this.server = new Server(
      {
        name: 'Remote MCP Client',
        version: '1.0.0',
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
          level: 'error',
          data: `${method}: ${error.message}`,
        });
      },
      ...options,
    };
  }

  /** @TODO implement */
  private async setupNotificationHandler() {}

  private async setupHandlers() {
    this.server.setRequestHandler(InitializeRequestSchema, async (request) => {
      try {
        const response = await this.trpc.initialize.mutate(request);
        if (response.capabilities && response.capabilities) {
          // await this.setupNotificationHandler();
        }

        return response;
      } catch (error) {
        this.options.onError?.(request.method, error as Error);
        throw error;
      }
    });

    this.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
      try {
        return await this.trpc['tools/list'].query(request);
      } catch (error) {
        this.options.onError?.(request.method, error as Error);
        throw error;
      }
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        return await this.trpc['tools/call'].mutate(request);
      } catch (error) {
        this.options.onError?.(request.method, error as Error);
        throw error;
      }
    });

    this.server.setRequestHandler(
      ListResourcesRequestSchema,
      async (request) => {
        try {
          return await this.trpc['resources/list'].query(request);
        } catch (error) {
          this.options.onError?.(request.method, error as Error);
          throw error;
        }
      },
    );

    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        try {
          return await this.trpc['resources/read'].query(request);
        } catch (error) {
          this.options.onError?.(request.method, error as Error);
          throw error;
        }
      },
    );

    this.server.setRequestHandler(SubscribeRequestSchema, async (request) => {
      try {
        return await this.trpc['resources/subscribe'].mutate(request);
      } catch (error) {
        this.options.onError?.(request.method, error as Error);
        throw error;
      }
    });

    this.server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
      try {
        return await this.trpc['resources/unsubscribe'].mutate(request);
      } catch (error) {
        this.options.onError?.(request.method, error as Error);
        throw error;
      }
    });

    // Prompts handlers
    this.server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
      try {
        return await this.trpc['prompts/list'].query(request);
      } catch (error) {
        this.options.onError?.(request.method, error as Error);
        throw error;
      }
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      try {
        return await this.trpc['prompts/get'].query(request);
      } catch (error) {
        this.options.onError?.(request.method, error as Error);
        throw error;
      }
    });
  }

  async start() {
    this.setupHandlers();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
