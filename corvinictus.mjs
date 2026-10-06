import { zibbChannels } from "./zibberflint.mjs";

export const corviAgentId = "agent-d98016b0-8c8d-4803-a164-c4a63d500a08";
export const corviDmConversationId = "conv-ed3ddce1-8cb8-4e7f-bf0b-d79f48fc7709";
export const corviPublicConversationId = "conv-b3d34eb8-ab7c-4251-8b2b-5d268fc39a6b";

export function addCorvinictus(accounts, routes, token) {
  if (!token) return;
  const timestamp = new Date().toISOString();
  accounts.accounts.push({
    channel: "discord", accountId: "corvinictus", enabled: true, token,
    agentId: corviAgentId, displayName: "Corvinictus",
    defaultPermissionMode: "standard", dmPolicy: "allowlist",
    allowedUsers: ["730173882153173163"],
    allowed_channels: Object.fromEntries(zibbChannels.map(id => [id, "mention-only"])),
    auto_thread_on_mention: false, acknowledge_message_reaction: false,
    inbound_debounce_ms: 0, transcribe_voice: false,
    createdAt: timestamp, updatedAt: timestamp,
  });
  for (const chatId of [...zibbChannels, "1476388996446814338"]) {
    const direct = chatId === "1476388996446814338";
    routes.routes.push({
      accountId: "corvinictus", chatId, chatType: direct ? "direct" : "channel",
      threadId: null, agentId: corviAgentId,
      conversationId: direct ? corviDmConversationId : corviPublicConversationId,
      enabled: true, createdAt: timestamp, updatedAt: timestamp,
    });
  }
}

// Runs after the existing Zibb patches, including when only Corvi is enabled.
export function patchCorvinictus(source) {
  const marker = "// Corvinictus triggers v1";
  if (source.includes(marker)) return source.replaceAll("conv-02a38876-5c19-4ce0-a63b-ddeeb2bfed94", corviDmConversationId);
  const mention = '        let wasMentioned = chatType === "channel" && hasBotMention(message);';
  const changes = [
    ['/* Zibberflint all-bot access v2 */ config3.accountId === "zibberflint"',
     '/* Zibberflint all-bot access v2 */ ["zibberflint", "corvinictus"].includes(config3.accountId)'],
    [mention, `${mention}
        ${marker}
        if (config3.accountId === "corvinictus" && chatType === "channel") {
          if (!isDiscordGuildChannelAllowed({ channelId: message.channelId, parentChannelId: message.channel.parentId ?? null, isThread, allowedChannels: config3.allowedChannels })) return;
          wasMentioned = wasMentioned || /\\b(?:corvi|corvinictus)\\b/i.test(content);
          if (!wasMentioned && message.reference?.messageId) {
            try {
              const original = await message.fetchReference();
              wasMentioned = Boolean(client?.user && original.author.id === client.user.id);
            } catch (error) {
              console.warn("[Corvinictus] Could not resolve reply reference:", error.message);
            }
          }
          if (!wasMentioned) return;
        }`],
    ['    const conversationId = config3.accountId === "zibberflint"',
     `    const conversationId = config3.accountId === "corvinictus"
      ? (msg.chatType === "direct" ? "${corviDmConversationId}" : "${corviPublicConversationId}")
      : config3.accountId === "zibberflint"`],
  ];
  for (const [needle, replacement] of changes) {
    if (source.split(needle).length !== 2) throw new Error("Corvinictus patch target missing or ambiguous; check pinned Letta version.");
    source = source.replace(needle, replacement);
  }
  return source;
}
