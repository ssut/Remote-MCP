# Remote-MCP: Remote Model Context Protocol

[![smithery badge](https://smithery.ai/badge/@remote-mcp/client)](https://smithery.ai/community/pack/remote-mcp)

A **type-safe, bidirectional and simple** solution for **remote MCP communication**, allowing remote access and centralized management of model contexts.

![preview](https://github.com/user-attachments/assets/a16804b9-8378-493c-8ca8-f61839458cde)


## Architecture

```mermaid
%%{init: {"flowchart": {"htmlLabels": false}} }%%
graph TD
    %% Modern, Bright Color Styling with white text
    classDef client fill:#22c55e,stroke:#059669,stroke-width:2px,color:#ffffff
    classDef gateway fill:#06b6d4,stroke:#0891b2,stroke-width:2px,color:#ffffff
    classDef backend fill:#f97316,stroke:#ea580c,stroke-width:2px,color:#ffffff
    classDef resource fill:#8b5cf6,stroke:#7c3aed,stroke-width:2px,color:#ffffff
    classDef server fill:#06b6d4,stroke:#0891b2,stroke-width:2px,color:#ffffff

    linkStyle default stroke:#64748b,stroke-width:1.5px,stroke-dasharray: 5 5

    %% Current MCP Setup (Multiple Local Servers)
    subgraph Current["Current Setup (Local)"]
        direction LR
        subgraph ClientGroup["Client"]
            A[Client]:::client
        end

        subgraph Servers["Local MCP Servers"]
            direction TB
            B1["Local MCP Server (DB)"]:::server -->|"DB Access"| C1[DB]:::resource
            B2["Local MCP Server (API 1)"]:::server -->|"API Access"| C2["Web API 1"]:::resource
            B3["Local MCP Server (API 2)"]:::server -->|"API Access"| C3["Web API 2"]:::resource
        end

        A -->|"MCP Protocol"| B1
        A -->|"MCP Protocol"| B2
        A -->|"MCP Protocol"| B3
    end

    %% Vertical separator
    Current --> Proposed

    %% Proposed MCP Architecture (Decoupled)
    subgraph Proposed["Proposed Architecture (Remote)"]
        direction LR
        D[Client/Host]:::client -->|"MCP Protocol"| E["Local MCP Server (@remote-mcp/client)"]:::server
        E <-->|"tRPC(HTTP)"| F["Remote MCP Server (@remote-mcp/server)"]:::backend

        %% Separated Resources
        F -->|"DB Access"| G1[DB]:::resource
        F -->|"API Access"| G2["Web API 1"]:::resource
        F -->|"API Access"| G3["Web API 2"]:::resource
    end
```

## Why I Made This (Now)

Yes, I know that the official MCP roadmap includes remote MCP support in the first quarter of 2025. However, the need for remote access was *immediate* for me, and likely for many others. This library was created to bridge that gap, providing a way to connect to a remote MCP server from a local MCP client *right now*, without waiting for future official implementations.

Note: I don't want this to be a sophisticated or overcomplicated thing. This way **just works right now**.

## Getting Started

> *Note: This project is currently under active development and is considered experimental. Expect breaking changes and potential issues.*

## Client Usage

### Installing via Smithery

To install Remote MCP Client for Claude Desktop automatically via [Smithery](https://smithery.ai/protocol/@remote-mcp/client):

```bash
npx @smithery/cli install @remote-mcp/client --client claude
```

### Use Publicly Published Package

Just put the following code in your MCP client settings, in here I'm using Claude as an example:

```json
{
  "mcpServers": {
    "remote-mcp": {
      "command": "npx",
      "args": ["-y", "@remote-mcp/client"],
      "env": {
        "REMOTE_MCP_URL": "http://localhost:9512",
        "HTTP_HEADER__Authorization": "Bearer <token>"
      }
    }
  }
}
```

### Code Your Own Local MCP Server

Install requirements:

```sh
$ npm install @remote-mcp/client @trpc/client@next zod
```

then write your own code like the following:

```ts
import { RemoteMCPClient } from "@remote-mcp/client";

const client = new RemoteMCPClient({
  remoteUrl: "http://localhost:9512",

  onError: (method, error) => console.error(`Error in ${method}:`, error)
});

void client.start();
```

## Server Usage (Remote MCP Implementation)

You can see some examples in the `examples` directory.

- [Cloudflare Workers](examples/cloudflare-workers)
- [Standalone Node.js](examples/simple-server)

### Code Your Own Remote MCP Server

After `npm install @remote-mcp/server`, you can your own remote MCP server like the following:

```typescript
import { MCPRouter, LogLevel } from "@remote-mcp/server";
import { createHTTPServer } from '@trpc/server/adapters/standalone';

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

void createHTTPServer({
  router: appRouter,
  createContext: () => ({}),
}).listen(Number(process.env.PORT || 9512));
```

Then you can see like the following in your MCP client:

<img src="https://github.com/user-attachments/assets/86cf500e-b937-47fc-9ac1-db106ab7a6a3" width="450">

## Packages

This repository contains:

*   `@remote-mcp/client`: Client library acting as a local MCP server, connecting to a remote implementation.
*   `@remote-mcp/server`: Server library for creating remotely accessible MCP services (used as the remote implementation).

## Roadmap

### Core Features

- [x] Basic *Type-safe* Client/Server Communication
  - [x] Basic MCP Command Support
  - [x] Basic MCP Tool Support
  - [x] Basic MCP Prompt Support
  - [ ] Crash-Safe Handling (WIP, top priority)
- [ ] Complete Event Subscription System
  - [ ] Resource change notifications
  - [ ] Tool/Prompt list change notifications
- [ ] HTTP Header Support
  - [x] Custom Headers
  - [ ] Authentication Middleware
- [ ] Basic error handling improvements
- [ ] Basic middleware support

### Framework Support

- [ ] Nest.js Integration (`@remote-mcp/nestjs`)

### Advanced Features

- [ ] Bidirectional communication
  - [ ] Server-to-client requests
  - [ ] Resource sharing between server/client
- [ ] Basic monitoring & logging

## Contribute

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Disclaimer

This library is a complementary extension, not part of the official MCP specification, built upon existing MCP concepts.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## References

*   [Model Context Protocol](https://modelcontextprotocol.org/)
