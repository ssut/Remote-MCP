import type {
  CallToolResult,
  Implementation,
  InitializeRequest,
  InitializeResult,
  Prompt,
  PromptMessage,
  Resource,
  ResourceContents,
  ServerCapabilities,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
  InitializeRequestSchema,
  LATEST_PROTOCOL_VERSION,
} from "@modelcontextprotocol/sdk/types.js";
import {
  type inferRouterInputs,
  type inferRouterOutputs,
  initTRPC,
} from "@trpc/server";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export type ToolHandler<T> = (args: T) => Promise<CallToolResult>;
export type ResourceHandler = () => Promise<Resource[]>;
export type ResourceContentHandler = () => Promise<ResourceContents[]>;
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
}

export type Middleware = (
  request: unknown,
  next: (modifiedRequest: unknown) => Promise<unknown>,
) => Promise<unknown>;

export class MCPRouter {
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

  constructor(options: MCPRouterOptions) {
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
  }

  // Tool methods
  addTool<T>(
    name: string,
    definition: ToolDefinition<T>,
    handler: ToolHandler<T>,
  ) {
    this.tools.set(name, { definition, handler });
    return this;
  }

  async listTools(): Promise<Tool[]> {
    return Array.from(this.tools.entries()).map(([name, { definition }]) => {
      const schema = zodToJsonSchema(definition.schema);
      return {
        name,
        description: definition.description,
        inputSchema: {
          type: "object",
          properties: schema,
        },
      };
    });
  }

  async callTool(name: string, args: unknown): Promise<CallToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    const { definition, handler } = tool;

    // Parse and validate arguments
    const validatedArgs = definition.schema.parse(args);

    // Apply middlewares
    let result = validatedArgs;
    if (definition.middlewares) {
      for (const middleware of definition.middlewares) {
        result = await middleware(result, async (modified) => modified);
      }
    }

    // Call handler
    return handler(result);
  }

  // Resource methods
  addResource(uri: string, definition: ResourceDefinition) {
    this.resources.set(uri, definition);
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

  async readResource(uri: string): Promise<ResourceContents[]> {
    const resource = this.resources.get(uri);
    if (!resource) {
      throw new Error(`Resource not found: ${uri}`);
    }

    // Apply middlewares
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
      throw new Error("Resource subscription not supported");
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
    const prompt = this.prompts.get(name);
    if (!prompt) {
      throw new Error(`Prompt not found: ${name}`);
    }

    const { definition, handler } = prompt;

    // Validate required arguments
    if (definition.arguments) {
      for (const arg of definition.arguments) {
        if (arg.required && !(arg.name in args)) {
          throw new Error(`Missing required argument: ${arg.name}`);
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
    }

    return handler(modifiedArgs);
  }

  // Initialize handler
  async initialize(request: InitializeRequest): Promise<InitializeResult> {
    return {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: this.capabilities,
      serverInfo: this.implementation,
    };
  }

  // Create tRPC router
  createTRPCRouter() {
    const t = initTRPC.create();
    const router = t.router;
    const publicProcedure = t.procedure;

    return router({
      // Initialize endpoint
      initialize: publicProcedure
        .input(InitializeRequestSchema)
        .mutation(async ({ input }) => {
          const { params } = { params: input };
          return this.initialize(params);
        }),

      // Tools endpoints
      "tools/list": publicProcedure
        .input(
          z
            .object({
              cursor: z.string().optional(),
              limit: z.number().optional(),
            })
            .optional(),
        )
        .query(async ({ input }) => ({
          tools: await this.listTools(),
          ...(input?.cursor && { nextCursor: input.cursor }),
        })),

      "tools/call": publicProcedure
        .input(
          z.object({
            name: z.string(),
            arguments: z.record(z.unknown()).optional(),
          }),
        )
        .mutation(async ({ input }) =>
          this.callTool(input.name, input.arguments),
        ),

      // Resources endpoints
      "resources/list": publicProcedure
        .input(
          z
            .object({
              cursor: z.string().optional(),
              limit: z.number().optional(),
            })
            .optional(),
        )
        .query(async ({ input }) => ({
          resources: await this.listResources(),
          ...(input?.cursor && { nextCursor: input.cursor }),
        })),

      "resources/read": publicProcedure
        .input(
          z.object({
            uri: z.string(),
          }),
        )
        .query(async ({ input }) => ({
          contents: await this.readResource(input.uri),
        })),

      "resources/subscribe": publicProcedure
        .input(
          z.object({
            uri: z.string(),
          }),
        )
        .mutation(async ({ input }) => {
          await this.subscribeToResource(input.uri);
          return {};
        }),

      "resources/unsubscribe": publicProcedure
        .input(
          z.object({
            uri: z.string(),
          }),
        )
        .mutation(async ({ input }) => {
          await this.unsubscribeFromResource(input.uri);
          return {};
        }),

      // Prompts endpoints
      "prompts/list": publicProcedure
        .input(
          z
            .object({
              cursor: z.string().optional(),
              limit: z.number().optional(),
            })
            .optional(),
        )
        .query(async ({ input }) => ({
          prompts: await this.listPrompts(),
          ...(input?.cursor && { nextCursor: input.cursor }),
        })),

      "prompts/get": publicProcedure
        .input(
          z.object({
            name: z.string(),
            arguments: z.record(z.string()).optional(),
          }),
        )
        .query(async ({ input }) => ({
          messages: await this.getPrompt(input.name, input.arguments),
        })),

      // If logging is enabled
      ...(this.capabilities.logging && {
        "logging/setLevel": publicProcedure
          .input(
            z.object({
              level: z.enum([
                "debug",
                "info",
                "notice",
                "warning",
                "error",
                "critical",
                "alert",
                "emergency",
              ]),
            }),
          )
          .mutation(async ({ input }) => {
            // Use input parameter to avoid unused variable warning
            console.log(input.level);
            return {};
          }),
      }),
    });
  }
}
