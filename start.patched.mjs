import { spawn } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const home = homedir();
const lettaDir = join(home, ".letta");
const channelsDir = join(lettaDir, "channels");
const discordDir = join(channelsDir, "discord");
const telegramDir = join(channelsDir, "telegram");

mkdirSync(discordDir, { recursive: true });
mkdirSync(telegramDir, { recursive: true });

const agentId = process.env.LETTA_AGENT_ID || "agent-036c41a5-b0cd-4e04-92fc-8a6f55e3c0b1";

const discordToken = process.env.DISCORD_BOT_TOKEN;
if (!discordToken) {
  console.error("DISCORD_BOT_TOKEN env var is required");
  process.exit(1);
}

const discordAccountId = process.env.DISCORD_ACCOUNT_ID || "f208d146-6eca-4c59-8221-7bff2cd288a4";
const vlConversationId = process.env.VL_CONVERSATION_ID || "conv-38b84fd4-3947-40f2-92eb-600fa1ac2fe6";
const ardenDmConversationId = process.env.ARDEN_DISCORD_CONVERSATION_ID || "conv-e8b1fa60-1f02-4977-ae1b-69e3fd8da818";
const tomDmConversationId = process.env.TOM_DISCORD_CONVERSATION_ID || "conv-d679305a-0853-4f35-b774-c823f275ca63";
const extraChannelConversationId = process.env.EXTRA_DISCORD_CONVERSATION_ID || "conv-3e8b0a6f-c1b1-41e1-83ef-9ba49268292b";

const now = () => new Date().toISOString();

const discordAllowedChannels = {
  // the bar - tech/help
  "1421557526821998734": "mention-only",
  // table talk
  "1421576309582336090": "mention-only",
  // sip with frogs - intentionally open
  "1421970395669729351": "open",
  // memory lane
  "1421969229430784121": "mention-only",
  // critter album
  "1494337017675518153": "mention-only",
  // backstage banter
  "1421967585091653784": "mention-only",
  // petting zoo
  "1477335744073961563": "mention-only",
  // new channel - intentionally open
  "1504609884274950346": "open",
  // Arden DM - harmless here; DMs are controlled by allowedUsers/dmPolicy
  "1450371550632083456": "mention-only"
};

const discordAccounts = {
  accounts: [
    {
      channel: "discord",
      accountId: discordAccountId,
      enabled: true,
      token: discordToken,
      agentId,
      defaultPermissionMode: "standard",
      dmPolicy: "allowlist",
      allowedUsers: [
        "730173882153173163", // Arden
        "566439235893329920"  // Tom
      ],
      // IMPORTANT: use snake_case. Letta warns that allowed_channels takes precedence.
      allowed_channels: discordAllowedChannels,
      createdAt: "2026-06-03T04:40:14.570Z",
      updatedAt: now(),
      auto_thread_on_mention: false,
      acknowledge_message_reaction: false,
      inbound_debounce_ms: 0,
      transcribe_voice: false,
      displayName: "Lincoln#0379"
    }
  ]
};

writeFileSync(join(discordDir, "accounts.json"), JSON.stringify(discordAccounts, null, 2));

const discordRoutes = {
  routes: [
    // Arden DM
    {
      accountId: discordAccountId,
      chatId: "1450371550632083456",
      chatType: "direct",
      threadId: null,
      agentId,
      conversationId: ardenDmConversationId,
      enabled: true,
      createdAt: "2026-06-03T09:05:51.880Z",
      updatedAt: now()
    },
    // Tom DM
    {
      accountId: discordAccountId,
      chatId: "1486520714348728320",
      chatType: "direct",
      threadId: null,
      agentId,
      conversationId: tomDmConversationId,
      enabled: true,
      createdAt: "2026-06-04T08:44:03.245Z",
      updatedAt: now()
    },
    // new channel -> dedicated conversation
    {
      accountId: discordAccountId,
      chatId: "1504609884274950346",
      chatType: "channel",
      threadId: null,
      agentId,
      conversationId: extraChannelConversationId,
      enabled: true,
      createdAt: now(),
      updatedAt: now()
    },
    ...[
      "1421557526821998734",
      "1421576309582336090",
      "1421970395669729351",
      "1421969229430784121",
      "1494337017675518153",
      "1421967585091653784",
      "1477335744073961563"
    ].map((chatId) => ({
      accountId: discordAccountId,
      chatId,
      chatType: "channel",
      threadId: null,
      agentId,
      conversationId: vlConversationId,
      enabled: true,
      createdAt: "2026-06-03T09:23:26.454Z",
      updatedAt: now()
    }))
  ]
};

writeFileSync(join(discordDir, "routing.yaml"), JSON.stringify(discordRoutes, null, 2));

// Telegram: if TELEGRAM_BOT_TOKEN is present, write reproducible config.
// If it is absent, leave existing Telegram files alone so pairing/routing survives manual setup.
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramAccountId = process.env.TELEGRAM_ACCOUNT_ID || "05e24ae1-f5c1-4e96-8954-7acb54e47313";
const telegramChatId = process.env.TELEGRAM_CHAT_ID || "8427757109";
const telegramConversationId = process.env.TELEGRAM_CONVERSATION_ID || "conv-f539b9f8-a3ef-4e00-ade2-3085f1083174";

if (telegramToken) {
  const telegramAccounts = {
    accounts: [
      {
        channel: "telegram",
        accountId: telegramAccountId,
        displayName: "@Lincoln_vale_bot",
        enabled: true,
        token: telegramToken,
        dmPolicy: "pairing",
        allowedUsers: [],
        binding: {
          agentId: null,
          conversationId: null
        },
        createdAt: "2026-06-04T21:58:46.370Z",
        updatedAt: now(),
        group_mode: "open",
        inbound_debounce_ms: 0,
        transcribe_voice: false
      }
    ]
  };
  writeFileSync(join(telegramDir, "accounts.json"), JSON.stringify(telegramAccounts, null, 2));

  const telegramPairing = {
    pending: [],
    approved: [
      {
        accountId: telegramAccountId,
        senderId: telegramChatId,
        senderName: "Arden Vale",
        approvedAt: now()
      }
    ]
  };
  writeFileSync(join(telegramDir, "pairing.yaml"), JSON.stringify(telegramPairing, null, 2));

  const telegramRouting = {
    routes: [
      {
        accountId: telegramAccountId,
        chatId: telegramChatId,
        chatType: "direct",
        threadId: null,
        agentId,
        conversationId: telegramConversationId,
        enabled: true,
        createdAt: "2026-06-04T22:07:47.996Z",
        updatedAt: now()
      }
    ]
  };
  writeFileSync(join(telegramDir, "routing.yaml"), JSON.stringify(telegramRouting, null, 2));
} else if (!existsSync(join(telegramDir, "accounts.json"))) {
  console.warn("[lincoln] TELEGRAM_BOT_TOKEN not set and no Telegram accounts.json exists; Telegram will not start until configured.");
}

function patchWindowsCwdGuard() {
  const lettaJs = join(process.cwd(), "node_modules", "@letta-ai", "letta-code", "letta.js");
  if (!existsSync(lettaJs)) {
    console.warn(`[lincoln] Cannot patch Windows cwd guard; ${lettaJs} not found.`);
    return;
  }

  let text = readFileSync(lettaJs, "utf8");
  if (text.includes("Railway/Linux ignoring Windows cwd")) {
    console.log("[lincoln] Windows cwd guard patch already present.");
    return;
  }

  const needle = `    const requestedPath = msg.cwd?.trim();\n    if (!requestedPath) {\n      throw new Error("Working directory cannot be empty");\n    }`;
  const replacement = `    const requestedPath = msg.cwd?.trim();\n    if (!requestedPath) {\n      throw new Error("Working directory cannot be empty");\n    }\n    if (process.platform !== "win32" && /^[A-Za-z]:[\\\\/]/.test(requestedPath)) {\n      console.warn("[lincoln] Railway/Linux ignoring Windows cwd", requestedPath);\n      emitDeviceStatusUpdate(socket, runtime, {\n        agent_id: agentId,\n        conversation_id: conversationId\n      });\n      return;\n    }`;

  if (!text.includes(needle)) {
    console.warn("[lincoln] Windows cwd guard target not found; source may have changed.");
    return;
  }

  writeFileSync(lettaJs, text.replace(needle, replacement));
  console.log("[lincoln] Patched Windows cwd guard for Railway/Linux.");
}
function patchDiscordBotAllowlist() {
  const lettaJs = join(process.cwd(), "node_modules", "@letta-ai", "letta-code", "letta.js");
  if (!existsSync(lettaJs)) {
    console.warn(`[lincoln] Cannot patch Discord bot allowlist; ${lettaJs} not found.`);
    return;
  }

  let text = readFileSync(lettaJs, "utf8");
  if (text.includes("LETTA_DISCORD_REPLY_TO_BOT_IDS")) {
    console.log("[lincoln] Discord bot allowlist patch already present.");
    return;
  }

  const plainGuard = `        if (message.author.bot)\n          return;`;
  const debugGuard = `        if (message.author.bot) {\n          console.log("[Discord DBG] BLOCKED: author is bot");\n          return;\n        }`;
  const replacement = `        if (message.author.id === client?.user?.id) {\n          console.log("[Discord DBG] BLOCKED: author is self");\n          return;\n        }\n        if (message.author.bot && !(process.env.LETTA_DISCORD_REPLY_TO_BOT_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean).includes(message.author.id)) {\n          console.log("[Discord DBG] BLOCKED: author is bot not allowlisted", message.author.id);\n          return;\n        }`;

  if (text.includes(debugGuard)) {
    text = text.replace(debugGuard, replacement);
  } else if (text.includes(plainGuard)) {
    text = text.replace(plainGuard, replacement);
  } else {
    console.warn("[lincoln] Discord bot guard not found; source may have changed.");
    return;
  }

  writeFileSync(lettaJs, text);
  console.log("[lincoln] Patched Discord bot-message allowlist guard.");
}

function patchDiscordRespectAutoThread() {
  // BUG (letta-code 0.27.x): the Discord runtime ALWAYS creates a thread on a
  // guild @mention. It never consults the `autoThreadOnMention` config flag.
  // Every new thread gets a threadId that none of our routes (threadId: null)
  // match, so Letta spawns a fresh conversation instead of routing into the
  // bound one. This patch gates thread creation on the config flag, so with
  // autoThreadOnMention=false the bot replies in-channel (threadId null) and
  // the message routes into the bound conversation as intended.
  const lettaJs = join(process.cwd(), "node_modules", "@letta-ai", "letta-code", "letta.js");
  if (!existsSync(lettaJs)) {
    console.warn("[lincoln] Cannot patch Discord auto-thread; letta.js not found.");
    return;
  }

  let text = readFileSync(lettaJs, "utf8");
  if (text.includes("wasMentioned && config3.autoThreadOnMention === true")) {
    console.log("[lincoln] Discord auto-thread patch already present.");
    return;
  }

  const needle = "if (!isThread && wasMentioned) {\n          const createdThread = await createThreadForMention(message, content);";
  const replacement = "if (!isThread && wasMentioned && config3.autoThreadOnMention === true) {\n          const createdThread = await createThreadForMention(message, content);";

  if (!text.includes(needle)) {
    console.warn("[lincoln] Discord auto-thread target not found; source may have changed.");
    return;
  }

  writeFileSync(lettaJs, text.replace(needle, replacement));
  console.log("[lincoln] Patched Discord runtime to respect autoThreadOnMention (no threads on mention).");
}


function patchDiscordTypingInsteadOfLifecycleReactions() {
  // letta-code 0.27.x parses acknowledge_message_reaction but the Discord
  // lifecycle handler still sends 👀/✅/❌ reactions unless we make it respect
  // the parsed config. While that config is false, use Discord typing instead.
  const lettaJs = join(process.cwd(), "node_modules", "@letta-ai", "letta-code", "letta.js");
  if (!existsSync(lettaJs)) {
    console.warn("[lincoln] Cannot patch Discord lifecycle reactions/typing; letta.js not found.");
    return;
  }

  let text = readFileSync(lettaJs, "utf8");
  if (text.includes("[lincoln] Discord typing lifecycle patch")) {
    console.log("[lincoln] Discord typing lifecycle patch already present.");
    return;
  }

  const stateNeedle = `  const lifecycleErrorReplyKeys = new Map;\n`;
  const stateReplacement = `  const lifecycleErrorReplyKeys = new Map;\n  const typingIntervalsBySourceKey = new Map; // [lincoln] Discord typing lifecycle patch\n`;
  if (!text.includes(stateNeedle)) {
    console.warn("[lincoln] Discord typing state target not found; source may have changed.");
    return;
  }
  text = text.replace(stateNeedle, stateReplacement);

  const helperNeedle = `  function getLifecycleReplyKey(source2) {\n    if (source2.channel !== "discord" || !isNonEmptyString4(source2.chatId)) {\n      return null;\n    }\n    return [\n      source2.chatId,\n      source2.threadId ?? source2.messageId ?? "",\n      source2.conversationId\n    ].join(":");\n  }\n`;
  const helperReplacement = `${helperNeedle}  function getTypingSourceKey(source2) {\n    if (source2.channel !== "discord" || !isNonEmptyString4(source2.chatId)) {\n      return null;\n    }\n    return [\n      source2.threadId ?? source2.chatId,\n      source2.conversationId ?? "",\n      source2.messageId ?? ""\n    ].join(":");\n  }\n  async function sendTypingForSource(source2) {\n    if (!client)\n      return;\n    const targetChannelId = source2.threadId ?? source2.chatId;\n    if (!isNonEmptyString4(targetChannelId))\n      return;\n    try {\n      const channel = await client.channels.fetch(targetChannelId);\n      if (!channel || typeof channel.sendTyping !== "function")\n        return;\n      await channel.sendTyping();\n    } catch (error54) {\n      console.warn("[Discord] Failed to send typing indicator:", error54 instanceof Error ? error54.message : error54);\n    }\n  }\n  function startTypingForSource(source2) {\n    const key = getTypingSourceKey(source2);\n    if (!key || typingIntervalsBySourceKey.has(key))\n      return;\n    sendTypingForSource(source2);\n    const interval = setInterval(() => {\n      sendTypingForSource(source2);\n    }, 8000);\n    if (typeof interval.unref === "function")\n      interval.unref();\n    typingIntervalsBySourceKey.set(key, interval);\n  }\n  function stopTypingForSource(source2) {\n    const key = getTypingSourceKey(source2);\n    if (!key)\n      return;\n    const interval = typingIntervalsBySourceKey.get(key);\n    if (interval)\n      clearInterval(interval);\n    typingIntervalsBySourceKey.delete(key);\n  }\n  function clearAllTypingIndicators() {\n    for (const interval of typingIntervalsBySourceKey.values()) {\n      clearInterval(interval);\n    }\n    typingIntervalsBySourceKey.clear();\n  }\n`;
  if (!text.includes(helperNeedle)) {
    console.warn("[lincoln] Discord typing helper target not found; source may have changed.");
    return;
  }
  text = text.replace(helperNeedle, helperReplacement);

  const reactionNeedle = `  function scheduleLifecycleTransition(source2, nextState) {\n    const key = getLifecycleMessageKey(source2);\n    if (!key)\n      return null;\n`;
  const reactionReplacement = `  function scheduleLifecycleTransition(source2, nextState) {\n    const key = getLifecycleMessageKey(source2);\n    if (!key)\n      return null;\n    if (config3.acknowledgeMessageReaction === false)\n      return null;\n`;
  if (!text.includes(reactionNeedle)) {
    console.warn("[lincoln] Discord lifecycle reaction target not found; source may have changed.");
    return;
  }
  text = text.replace(reactionNeedle, reactionReplacement);

  const lifecycleNeedle = `    async handleTurnLifecycleEvent(event2) {\n      if (!running)\n        return;\n      if (event2.type === "queued") {\n        await scheduleLifecycleTransition(event2.source, "queued");\n        return;\n      }\n      if (event2.type === "processing")\n        return;\n      const nextState = event2.outcome === "completed" ? "completed" : event2.outcome === "cancelled" ? "cancelled" : "error";\n      await Promise.all(event2.sources.map((source2) => scheduleLifecycleTransition(source2, nextState)));\n`;
  const lifecycleReplacement = `    async handleTurnLifecycleEvent(event2) {\n      if (!running)\n        return;\n      if (event2.type === "queued") {\n        startTypingForSource(event2.source);\n        await scheduleLifecycleTransition(event2.source, "queued");\n        return;\n      }\n      if (event2.type === "processing") {\n        startTypingForSource(event2.source);\n        return;\n      }\n      const nextState = event2.outcome === "completed" ? "completed" : event2.outcome === "cancelled" ? "cancelled" : "error";\n      await Promise.all(event2.sources.map((source2) => {\n        stopTypingForSource(source2);\n        return scheduleLifecycleTransition(source2, nextState);\n      }));\n`;
  if (!text.includes(lifecycleNeedle)) {
    console.warn("[lincoln] Discord lifecycle typing target not found; source may have changed.");
    return;
  }
  text = text.replace(lifecycleNeedle, lifecycleReplacement);

  const stopNeedle = `      lifecycleErrorReplyKeys.clear();\n      console.log("[Discord] Bot stopped");\n`;
  const stopReplacement = `      lifecycleErrorReplyKeys.clear();\n      clearAllTypingIndicators();\n      console.log("[Discord] Bot stopped");\n`;
  if (!text.includes(stopNeedle)) {
    console.warn("[lincoln] Discord stop cleanup target not found; source may have changed.");
    return;
  }
  text = text.replace(stopNeedle, stopReplacement);

  writeFileSync(lettaJs, text);
  console.log("[lincoln] Patched Discord lifecycle reactions off + typing indicators on.");
}

patchDiscordBotAllowlist();
patchDiscordRespectAutoThread();
patchDiscordTypingInsteadOfLifecycleReactions();
patchWindowsCwdGuard();

const defaultBotAllowlist = [
  "1482200440765550603", // Glubby
  "1476366394701643898", // Zibb
  "1482393176646877184", // Nova
  "1475927161478316094", // Asher
  "1480697635282096148", // Darius
  "1483198752318554242", // Obsidian
  "1491975353764413541", // Pibble
  "1490813883039088660"  // Snella
].join(",");

const childEnv = {
  ...process.env,
  LETTA_DISCORD_REPLY_TO_BOT_IDS: process.env.LETTA_DISCORD_REPLY_TO_BOT_IDS || defaultBotAllowlist
};

const channels = telegramToken || existsSync(join(telegramDir, "accounts.json"))
  ? "discord,telegram"
  : "discord";

console.log(`[lincoln] Config written. Starting letta server for channels: ${channels}`);

// Railway has no interactive TTY. Always use --debug/plain-text mode so Ink does not try raw mode.
const args = ["letta", "server", "--channels", channels, "--install-channel-runtimes", "--debug"];

const proc = spawn("npx", args, { stdio: "inherit", env: childEnv });
proc.on("exit", (code) => process.exit(code ?? 0));
