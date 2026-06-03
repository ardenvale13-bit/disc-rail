import { execSync, spawn } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const home = homedir();
const lettaDir = join(home, ".letta");
const channelDir = join(lettaDir, "channels", "discord");

// Create dirs
mkdirSync(channelDir, { recursive: true });

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error("DISCORD_BOT_TOKEN env var is required");
  process.exit(1);
}

const agentId = process.env.LETTA_AGENT_ID || "agent-036c41a5-b0cd-4e04-92fc-8a6f55e3c0b1";
const accountId = "f208d146-6eca-4c59-8221-7bff2cd288a4";

// Write accounts.json
const accounts = {
  accounts: [
    {
      channel: "discord",
      accountId,
      enabled: true,
      token,
      agentId,
      defaultPermissionMode: "standard",
      dmPolicy: "allowlist",
      allowedUsers: [
        "730173882153173163",
        "566439235893329920"
      ],
      allowedChannels: {
        "1510571292183494666": "open",
        "1437597602022424587": "open"
      },
      createdAt: "2026-06-03T04:40:14.570Z",
      updatedAt: new Date().toISOString(),
      auto_thread_on_mention: false,
      acknowledge_message_reaction: false,
      inbound_debounce_ms: 0,
      transcribe_voice: false
    }
  ]
};

writeFileSync(
  join(channelDir, "accounts.json"),
  JSON.stringify(accounts, null, 2)
);

// Write routing.yaml
const routing = {
  routes: [
    {
      accountId,
      chatId: "1510571292183494666",
      chatType: "channel",
      threadId: null,
      agentId,
      conversationId: "conv-a6c3ef0e-76d0-4767-8c39-3f1f0dba540f",
      enabled: true,
      createdAt: "2026-06-03T04:40:55.946Z",
      updatedAt: new Date().toISOString()
    },
    {
      accountId,
      chatId: "1437597602022424587",
      chatType: "channel",
      threadId: null,
      agentId,
      conversationId: "conv-d3e7b107-926d-4ad8-b985-dbbfbc42e98e",
      enabled: true,
      createdAt: "2026-06-03T05:27:21.191Z",
      updatedAt: new Date().toISOString()
    },
    {
      accountId,
      chatId: "1450371550632083456",
      chatType: "direct",
      threadId: null,
      agentId,
      conversationId: "conv-fccc0b19-3ace-4691-aa14-6833153fc8c5",
      enabled: true,
      createdAt: "2026-06-03T05:26:11.794Z",
      updatedAt: new Date().toISOString()
    }
  ]
};

writeFileSync(
  join(channelDir, "routing.yaml"),
  JSON.stringify(routing, null, 2)
);

console.log("[lincoln] Config written. Starting letta server...");

// Start letta server
const proc = spawn(
  "npx",
  ["letta", "server", "--channels", "discord", "--install-channel-runtimes"],
  { stdio: "inherit" }
);

proc.on("exit", (code) => process.exit(code ?? 0));
