import { LogLevel, MCPRouter } from '@remote-mcp/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { createBunServeHandler } from 'trpc-bun-adapter';

import { z } from 'zod';

// Create router instance
const mcpRouter = new MCPRouter({
  logLevel: LogLevel.DEBUG,
  name: 'example-server',
  version: '1.0.0',
  capabilities: {
    //   tools: {
    //     listChanged: true,
    //   },
    //   resources: {
    //     subscribe: true,
    //     listChanged: true,
    //   },
    //   prompts: {
    //     listChanged: true,
    //   },
    logging: {},
  },
});

// Add example tool
mcpRouter.addTool(
  'calculator',
  {
    description:
      'Perform basic calculations. Add, subtract, multiply, divide. Invoke this every time you need to perform a calculation instead of your calculation.',
    schema: z.object({
      operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
      a: z.string(),
      b: z.string(),
    }),
  },
  async (args) => {
    const a = Number(args.a);
    const b = Number(args.b);

    let result: number;
    switch (args.operation) {
      case 'add':
        result = a + b;
        break;
      case 'subtract':
        result = a - b;
        break;
      case 'multiply':
        result = a * b;
        break;
      case 'divide':
        if (b === 0) throw new Error('Division by zero');
        result = a / b;
        break;
    }

    return {
      content: [{ type: 'text', text: `${result}` }],
    };
  },
);

const appRouter = mcpRouter.createTRPCRouter();

Bun.serve(
  createBunServeHandler(
    {
      router: appRouter,
    },
    {
      port: Number(process.env.PORT || 9512),
    },
  ),
);
