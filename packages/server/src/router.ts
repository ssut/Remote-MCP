import { EventEmitter, on } from 'node:events';
import { ConsoleLogger, LogLevel, type Logger } from './logger.js';

import {
  type BlobResourceContents,
  CallToolRequestSchema,
  type CallToolResult,
  CallToolResultSchema,
  GetPromptRequestSchema,
  GetPromptResultSchema,
  type Implementation,
  type InitializeRequest,
  InitializeRequestSchema,
  type InitializeResult,
  InitializeResultSchema,
  LATEST_PROTOCOL_VERSION,
  ListPromptsRequestSchema,
  ListPromptsResultSchema,
  ListResourcesRequestSchema,
  ListResourcesResultSchema,
  ListToolsRequestSchema,
  ListToolsResultSchema,
  type Prompt,
  type PromptMessage,
  ReadResourceRequestSchema,
  ReadResourceResultSchema,
  type Resource,
  type ServerCapabilities,
  type ServerNotification,
  SubscribeRequestSchema,
  type Tool,
  UnsubscribeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { initTRPC } from '@trpc/server';
import { ZodError, type z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export type ToolHandler<T> = (args: T) => Promise<CallToolResult>;
export type ResourceHandler = () => Promise<Resource[]>;
export type ResourceContentHandler = () => Promise<BlobResourceContents[]>;
export type PromptHandler = (
  args: Record<string, string>,
) => Promise<PromptMessage[]>;

export interface ToolDefinition<T> {
  description: string;
  schema: z.ZodType<T>;
  middlewares?: Middleware[];
}

export interface ResourceDefinition {
  name: string;
  description?: string;
  mimeType?: string;
  subscribe?: boolean;
  listHandler: ResourceHandler;
  readHandler: ResourceContentHandler;
  middlewares?: Middleware[];
}

export interface PromptDefinition {
  description?: string;
  arguments?: {
    name: string;
    description?: string;
    required?: boolean;
  }[];
  middlewares?: Middleware[];
}

export interface MCPRouterOptions {
  name: string;
  version: string;
  capabilities?: Partial<ServerCapabilities>;
  logger?: Logger;
  logLevel?: LogLevel;
}

export type Middleware = (
  request: unknown,
  next: (modifiedRequest: unknown) => Promise<unknown>,
) => Promise<unknown>;

interface Events {
  notification: (notification: ServerNotification) => void;

  resourceListChanged: () => void;
  resourceUpdated: (uri: string) => void;
  toolListChanged: () => void;
  promptListChanged: () => void;
  rootsListChanged: () => void;
}

export class MCPRouter {
  private logger: Logger;

  private tools = new Map<
    string,
    {
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      definition: ToolDefinition<any>;
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      handler: ToolHandler<any>;
    }
  >();

  private resources = new Map<string, ResourceDefinition>();

  private prompts = new Map<
    string,
    {
      definition: PromptDefinition;
      handler: PromptHandler;
    }
  >();

  private subscriptions = new Map<string, Set<string>>();
  private implementation: Implementation;
  private capabilities: ServerCapabilities;
  private events = new EventEmitter();

  constructor(options: MCPRouterOptions) {
    this.logger =
      options.logger ||
      new ConsoleLogger({
        level: options.logLevel || LogLevel.INFO,
        prefix: options.name,
      });

    this.implementation = {
      name: options.name,
      version: options.version,
    };

    this.capabilities = {
      tools: options.capabilities?.tools ?? {
        listChanged: false,
      },
      resources: options.capabilities?.resources ?? {
        subscribe: false,
        listChanged: false,
      },
      prompts: options.capabilities?.prompts ?? {
        listChanged: false,
      },
      logging: options.capabilities?.logging,
      experimental: options.capabilities?.experimental,
    };

    this.logger.debug('MCPRouter initialized', {
      name: options.name,
      version: options.version,
      capabilities: this.capabilities,
    });
  }

  private emit<T extends keyof Events>(
    event: T,
    ...args: Parameters<Events[T]>
  ): void {
    this.events.emit(event, ...args);
  }

  private _emitNotification(notification: ServerNotification) {
    this.emit('notification', notification);
  }

  private _emitResourceListChanged() {
    this._emitNotification({
      method: 'notifications/resources/list_changed',
      params: {},
    });
  }

  private _emitResourceUpdated(uri: string) {
    this._emitNotification({
      method: 'notifications/resources/updated',
      params: { uri },
    });
  }

  private _emitToolListChanged() {
    this._emitNotification({
      method: 'notifications/tools/list_changed',
      params: {},
    });
  }

  private _emitPromptListChanged() {
    this._emitNotification({
      method: 'notifications/prompts/list_changed',
      params: {},
    });
  }

  addTool<T>(
    name: string,
    definition: ToolDefinition<T>,
    handler: ToolHandler<T>,
  ) {
    this.logger.debug('Adding tool', { name, definition });

    this.tools.set(name, { definition, handler });
    this._emitToolListChanged();
    return this;
  }

  async listTools(): Promise<Tool[]> {
    this.logger.debug('Listing resources');

    const tools = Array.from(this.tools.entries()).map(
      ([name, { definition }]) => {
        const schema = {
          ...zodToJsonSchema(definition.schema),
          $schema: undefined,
        };
        return {
          name,
          description: definition.description,
          inputSchema: {
            type: 'object',
            properties: schema,
          },
        } satisfies Tool;
      },
    );

    return tools;
  }

  async callTool(name: string, args: unknown): Promise<CallToolResult> {
    this.logger.debug('Calling tool', { name, args });

    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    const { definition, handler } = tool;

    const validatedArgs = definition.schema.parse(args);
    this.logger.debug('Tool args validated', { validatedArgs });

    let result = validatedArgs;
    if (definition.middlewares) {
      for (const middleware of definition.middlewares) {
        result = await middleware(result, async (modified) => modified);
      }
    }

    return handler(result);
  }

  addResource(uri: string, definition: ResourceDefinition) {
    this.resources.set(uri, definition);
    this._emitResourceListChanged();

    return this;
  }

  async listResources(): Promise<Resource[]> {
    const resources: Resource[] = [];

    for (const [uri, def] of this.resources) {
      const items = await def.listHandler();
      resources.push(
        ...items.map((item) => ({
          ...item,
          uri,
          name: def.name,
          description: def.description,
          mimeType: def.mimeType,
        })),
      );
    }

    return resources;
  }

  async readResource(uri: string): Promise<BlobResourceContents[]> {
    const resource = this.resources.get(uri);
    if (!resource) {
      throw new Error(`Resource not found: ${uri}`);
    }

    let result = { uri };
    if (resource.middlewares) {
      for (const middleware of resource.middlewares) {
        result = (await middleware(result, async (modified) => modified)) as {
          uri: string;
        };
      }
    }

    return resource.readHandler();
  }

  async subscribeToResource(uri: string): Promise<void> {
    if (!this.capabilities.resources?.subscribe) {
      throw new Error('Resource subscription not supported');
    }

    const resource = this.resources.get(uri);
    if (!resource) {
      throw new Error(`Resource not found: ${uri}`);
    }

    if (!resource.subscribe) {
      throw new Error(`Resource ${uri} does not support subscriptions`);
    }

    if (!this.subscriptions.has(uri)) {
      this.subscriptions.set(uri, new Set());
    }

    // biome-ignore lint/style/noNonNullAssertion: <explanation>
    this.subscriptions.get(uri)!.add(uri);
  }

  async unsubscribeFromResource(uri: string): Promise<void> {
    const subscribers = this.subscriptions.get(uri);
    if (subscribers) {
      subscribers.delete(uri);
      if (subscribers.size === 0) {
        this.subscriptions.delete(uri);
      }
    }
  }

  // Prompt methods
  addPrompt(
    name: string,
    definition: PromptDefinition,
    handler: PromptHandler,
  ) {
    this.prompts.set(name, { definition, handler });
    this._emitPromptListChanged();

    return this;
  }

  async listPrompts(): Promise<Prompt[]> {
    return Array.from(this.prompts.entries()).map(([name, { definition }]) => ({
      name,
      description: definition.description,
      arguments: definition.arguments,
    }));
  }

  async getPrompt(
    name: string,
    args: Record<string, string> = {},
  ): Promise<PromptMessage[]> {
    this.logger.debug('Getting prompt', { name, args });

    const prompt = this.prompts.get(name);
    if (!prompt) {
      const error = `Prompt not found: ${name}`;
      this.logger.error(error);
      throw new Error(error);
    }

    const { definition, handler } = prompt;

    // Validate required arguments
    if (definition.arguments) {
      for (const arg of definition.arguments) {
        if (arg.required && !(arg.name in args)) {
          const error = `Missing required argument: ${arg.name}`;
          this.logger.error(error, { name, args });
          throw new Error(error);
        }
      }
    }

    // Apply middlewares
    let modifiedArgs = args;
    if (definition.middlewares) {
      for (const middleware of definition.middlewares) {
        modifiedArgs = (await middleware(
          modifiedArgs,
          async (modified) => modified,
        )) as Record<string, string>;
      }

      this.logger.debug('Prompt middleware applied', { modifiedArgs });
    }

    const messages = await handler(modifiedArgs);
    this.logger.debug('Prompt executed successfully', {
      name,
      messageCount: messages.length,
    });
    return messages;
  }

  // Initialize handler
  async initialize(request: InitializeRequest): Promise<InitializeResult> {
    this.logger.debug('Initializing', { request });

    return {
      id: 'RemoteMCP',
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: this.capabilities,
      serverInfo: this.implementation,
    };
  }

  // Create tRPC router
  createTRPCRouter() {
    const t = initTRPC.create({
      errorFormatter({ type, path, input, shape, error }) {
        return {
          ...shape,
          data: {
            ...shape.data,
            zodError:
              error.code === 'BAD_REQUEST' && error.cause instanceof ZodError
                ? error.cause.flatten()
                : null,
          },
        };
      },
    });
    const router = t.router;
    const publicProcedure = t.procedure;
    const events = this.events;

    const appRouter = router({
      ping: publicProcedure.query(() => 'pong'),

      initialize: publicProcedure
        .input(InitializeRequestSchema)
        .output(InitializeResultSchema)
        .mutation(async ({ input }) => {
          const { params } = { params: input };
          return this.initialize(params);
        }),

      'tools/list': publicProcedure
        .input(ListToolsRequestSchema)
        .output(ListToolsResultSchema)
        .query(async ({ input }) => ({
          tools: await this.listTools(),
          // ...(input.params?.cursor && { nextCursor: input.params?.cursor }),
        })),

      'tools/call': publicProcedure
        .input(CallToolRequestSchema)
        .output(CallToolResultSchema)
        .mutation(async ({ input }) =>
          this.callTool(input.params.name, input.params.arguments),
        ),

      // Resources endpoints
      'resources/list': publicProcedure
        .input(ListResourcesRequestSchema)
        .output(ListResourcesResultSchema)
        .query(async ({ input }) => ({
          resources: await this.listResources(),
        })),

      'resources/read': publicProcedure
        .input(ReadResourceRequestSchema)
        .output(ReadResourceResultSchema)
        .query(async ({ input }) => ({
          contents: await this.readResource(input.params.uri),
        })),

      'resources/subscribe': publicProcedure
        .input(SubscribeRequestSchema)
        .mutation(async ({ input }) => {
          await this.subscribeToResource(input.params.uri);
          return {};
        }),

      'resources/unsubscribe': publicProcedure
        .input(UnsubscribeRequestSchema)
        .mutation(async ({ input }) => {
          await this.unsubscribeFromResource(input.params.uri);
          return {};
        }),

      // Prompts endpoints
      'prompts/list': publicProcedure
        .input(ListPromptsRequestSchema)
        .output(ListPromptsResultSchema)
        .query(async ({ input }) => ({
          prompts: await this.listPrompts(),
          // ...(input?.cursor && { nextCursor: input.cursor }),
        })),

      'prompts/get': publicProcedure
        .input(GetPromptRequestSchema)
        .output(GetPromptResultSchema)
        .query(async ({ input }) => ({
          messages: await this.getPrompt(
            input.params.name,
            input.params.arguments,
          ),
        })),

      'notifications/stream': publicProcedure.subscription(async function* () {
        try {
          for await (const event of on(events, 'notification', {
            signal: undefined,
          })) {
            yield* event;
          }
        } finally {
        }
      }),
    });

    return appRouter;
  }
}

interface Events {
  resourceListChanged: () => void;
  resourceUpdated: (uri: string) => void;
  toolListChanged: () => void;
  promptListChanged: () => void;
  rootsListChanged: () => void;
}
