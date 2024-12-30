# Remote-MCP: Remote Model Context Protocol

**A type-safe solution for remote MCP communication, enabling bidirectional data flow.**

<img src="https://github.com/user-attachments/assets/b06d7081-7748-4fc7-b972-e1c5e03245dd" width="400">

> *Note: This project is currently under active development and is considered experimental. Expect breaking changes and potential issues.*

This library provides type-safe communication with [Model Context Protocol](https://modelcontextprotocol.org/) services over HTTP. It's designed for remote access and centralized management of model contexts.

## Key Features

*   **Type Safety:** End-to-end type safety for all MCP interactions.
*   **Bidirectional:** Supports bidirectional data exchange between the MCP server and the remote implementation.
*   **Remote Access:** Enables network connections to a remote MCP implementation for centralized management.
*   **Simple Integration:** Easy to integrate with any MCP client.

## Getting Started

### Installation

```bash
npm install @remote-mcp/client
```

### Client Usage (as a Local MCP Server)

```typescript
import { RemoteMCPClient } from "@remote-mcp/client";

const client = new RemoteMCPClient({
  remoteUrl: "http://localhost:9512",
  onError: (method, error) => console.error(`Error in ${method}:`, error)
});

void client.start();
```

#### Server Usage (Remote MCP Implementation)

```typescript
import { MCPRouter, LogLevel } from "@remote-mcp/server";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { createBunServeHandler } from "trpc-bun-adapter";

import { z } from "zod";

// Create router instance
const mcpRouter = new MCPRouter({
  logLevel: LogLevel.DEBUG,
  name: "example-server",
  version: "1.0.0",
  capabilities: {
    logging: {},
  },
});

// Add example tool
mcpRouter.addTool(
  "calculator",
  {
    description:
      "Perform basic calculations. Add, subtract, multiply, divide. Invoke this every time you need to perform a calculation.",
    schema: z.object({
      operation: z.enum(["add", "subtract", "multiply", "divide"]),
      a: z.string(),
      b: z.string(),
    }),
  },
  async (args) => {
    const a = Number(args.a);
    const b = Number(args.b);

    let result: number;
    switch (args.operation) {
      case "add":
        result = Number(a) + b;
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

const appRouter = mcpRouter.createTRPCRouter();

// Example using trpc-bun-adapter
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
```

Then you can see like the following in your MCP client:

<img src="https://github.com/user-attachments/assets/86cf500e-b937-47fc-9ac1-db106ab7a6a3" width="450">

## Packages

This repository contains:

*   `@remote-mcp/client`: Client library acting as a local MCP server, connecting to a remote implementation.
*   `@remote-mcp/server`: Server library for creating remotely accessible MCP services (used as the remote implementation).

## Contribute

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Disclaimer

This library is a complementary extension, not part of the official MCP specification, built upon existing MCP concepts.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## References

*   [Model Context Protocol](https://modelcontextprotocol.org/)
