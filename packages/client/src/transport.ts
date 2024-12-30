import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { SendNotificationT } from "@modelcontextprotocol/sdk/types.js";

export class Transport {
  private serverUrl: string;
  private token?: string;
  private subscriptions = new Map<string, EventSource>();
  private server: Server;

  constructor(serverUrl: string, token?: string) {
    this.serverUrl = serverUrl;
    this.token = token;

    this.server = new Server(
      {
        name: "rcp-transport",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: { listChanged: true },
          resources: {
            subscribe: true,
            listChanged: true,
          },
          prompts: { listChanged: true },
          logging: {},
        },
      },
    );
  }

  async request<T>(method: string, params?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.serverUrl}/${method}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ params }),
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.statusText}`);
    }

    return response.json();
  }

  async notification(notification: SendNotificationT): Promise<void> {
    return this.server.notification(notification);
  }

  async subscribe(
    channel: string,
    onData: (data: unknown) => void,
  ): Promise<void> {
    const url = new URL(`${this.serverUrl}/subscribe/${channel}`);
    if (this.token) {
      url.searchParams.set("token", this.token);
    }

    const es = new EventSource(url.toString());

    es.onmessage = (event) => {
      onData(JSON.parse(event.data));
    };

    this.subscriptions.set(channel, es);
  }

  async unsubscribe(channel: string): Promise<void> {
    const es = this.subscriptions.get(channel);
    if (es) {
      es.close();
      this.subscriptions.delete(channel);
    }
  }
}
