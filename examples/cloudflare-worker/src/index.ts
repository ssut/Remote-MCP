import { MCPRouter } from '@remote-mcp/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { z } from 'zod';

const mcpRouter = new MCPRouter({
  name: 'example-cloudflare-worker',
  version: '1.0.0',
  capabilities: {
    logging: {},
  },
});

mcpRouter.addTool(
  'current-time',
  {
    description:
      'Get the current time in the requested format. Supported formats are "iso" and "epoch".',
    schema: z.object({
      format: z.enum(['iso', 'epoch']),
    }),
  },
  async ({ format }) => {
    const now = new Date();

    let result = '';
    switch (format) {
      case 'iso':
        result = now.toISOString();
        break;
      case 'epoch':
        result = `${now.getTime()}`;
        break;
    }

    return {
      content: [{ type: 'text', text: result }],
    };
  },
);

export default {
  async fetch(request: Request): Promise<Response> {
    return fetchRequestHandler({
      endpoint: '/',
      req: request,
      router: mcpRouter.createTRPCRouter(),
      createContext: () => ({}),
    });
  },
};
