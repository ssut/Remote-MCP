import { MCPRouter } from "@rcp/server";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { z } from "zod";

// Create router instance
const mcpRouter = new MCPRouter({
  name: "example-server",
  version: "1.0.0",
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
});

// Add example tool
mcpRouter.addTool(
  "calculator",
  {
    description: "Perform basic calculations",
    schema: z.object({
      operation: z.enum(["add", "subtract", "multiply", "divide"]),
      a: z.number(),
      b: z.number(),
    }),
  },
  async (args) => {
    const { operation, a, b } = args;
    let result: number;

    switch (operation) {
      case "add":
        result = a + b;
        break;
      case "subtract":
        result = a - b;
        break;
      case "multiply":
        result = a * b;
        break;
      case "divide":
        if (b === 0) throw new Error("Division by zero");
        result = a / b;
        break;
    }

    return {
      content: [{ type: "text", text: `${result}` }],
    };
  },
);

// Create tRPC router
const trpcRouter = mcpRouter.createTRPCRouter();

// Create HTTP server
const server = createHTTPServer({
  router: trpcRouter,
  createContext: () => ({}),
});

// Start server
const port = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 9512;
server.listen(port);
console.log(`Server running at http://localhost:${port}`);

// Handle process signals
process.on("SIGINT", () => {
  console.log("Shutting down...");
  process.exit(0);
});
