import { RemoteMCPClient } from "./client";

const client = new RemoteMCPClient({
  remoteUrl: process.env.REMOTE_URL || "http://localhost:9512",
});

void client.start();
