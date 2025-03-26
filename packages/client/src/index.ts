#!/usr/bin/env node

import { RemoteMCPClient } from './client.js';

export { RemoteMCPClient } from './client.js';
export default RemoteMCPClient;

const client = new RemoteMCPClient({
  remoteUrl: process.env.REMOTE_MCP_URL || 'http://localhost:9512',
  headers: Object.keys(process.env)
    .filter((key) => key.startsWith('HTTP_HEADER_'))
    .reduce(
      (headers, key) => {
        const headerKey = key
          .substring('HTTP_HEADER_'.length)
          .toLowerCase()
          .replace(/_/g, '-');
        const headerValue = process.env[key] || '';
        headers[headerKey] = headerValue;
        return headers;
      },
      {} as Record<string, string>,
    ),
});

void client.start();
