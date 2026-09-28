export const zibbAccountId = "zibberflint";
export const zibbAgentId = "agent-59a098ee-3d30-4e9f-b811-fc3ddd98b7aa";
export const zibbConversationId = "conv-50e495b0-61bc-4ead-b2af-5b34047ac031";
export const zibbPrivateChannelConversationId = "conv-1c5ce938-d755-44f5-9d39-81b1d106f3c4";
export const zibbDmConversationId = "conv-3da5d408-013b-48e6-b2ac-1b022e8f4170";
export const zibbChannels = ["1421576309582336090", "1421970395669729351", "1477335744073961563", "1484472784741728387"];

export function addZibberflint(accounts, routes, token) {
  if (!token) return;
  const timestamp = new Date().toISOString();
  accounts.accounts.push({
    channel: "discord", accountId: zibbAccountId, enabled: true, token,
    agentId: zibbAgentId, displayName: "ZIbberflint",
    defaultPermissionMode: "standard", dmPolicy: "allowlist",
    allowedUsers: ["730173882153173163"],
    allowed_channels: Object.fromEntries(zibbChannels.map(id => [id, "mention-only"])),
    auto_thread_on_mention: false, acknowledge_message_reaction: false,
    inbound_debounce_ms: 0, transcribe_voice: false,
    createdAt: timestamp, updatedAt: timestamp,
  });
  routes.routes.push(...zibbChannels.map(chatId => ({
    accountId: zibbAccountId, chatId, chatType: "channel", threadId: null,
    agentId: zibbAgentId,
    conversationId: chatId === "1484472784741728387" ? zibbPrivateChannelConversationId : zibbConversationId,
    enabled: true,
    createdAt: timestamp, updatedAt: timestamp,
  })));
}

// Applied to the pinned Letta 0.27.0 bundle, alongside the existing runtime fixes.
export function patchZibberflint(source) {
  const marker = "// Zibberflint triggers v2";
  if (source.includes(marker)) return source;
  const oldRouting = `    const conversationId = config3.accountId === "${zibbAccountId}"
      ? "${zibbConversationId}"
      : await this.createConversationForAgent(config3.agentId, buildDiscordConversationSummary(msg));`;
  const newRouting = `    const conversationId = config3.accountId === "${zibbAccountId}"
      ? (msg.chatType === "direct" ? "${zibbDmConversationId}"
        : (msg.parentChannelId ?? msg.chatId) === "1484472784741728387" ? "${zibbPrivateChannelConversationId}" : "${zibbConversationId}")
      : await this.createConversationForAgent(config3.agentId, buildDiscordConversationSummary(msg));`;
  if (source.includes("// Zibberflint triggers v1")) {
    if (source.split(oldRouting).length !== 2) throw new Error("ZIbberflint v1 routing upgrade target missing or ambiguous.");
    return source.replace(oldRouting, newRouting).replace("// Zibberflint triggers v1", marker);
  }
  const changes = [
    ['        const wasMentioned = chatType === "channel" && hasBotMention(message);',
`        ${marker}
        let wasMentioned = chatType === "channel" && hasBotMention(message);
        if (config3.accountId === "${zibbAccountId}" && chatType === "channel") {
          const parentId = message.channel.parentId ?? null;
          if (!isDiscordGuildChannelAllowed({ channelId: message.channelId, parentChannelId: parentId, isThread, allowedChannels: config3.allowedChannels })) return;
          wasMentioned = wasMentioned || /\\bzibb\\b/i.test(content);
          if (!wasMentioned && message.reference?.messageId) {
            try {
              const original = await message.fetchReference();
              wasMentioned = Boolean(client?.user && original.author.id === client.user.id);
            } catch (error) {
              console.warn("[ZIbberflint] Could not resolve reply reference:", error.message);
            }
          }
          if (!wasMentioned) return;
        }`],
    ['    const conversationId = await this.createConversationForAgent(config3.agentId, buildDiscordConversationSummary(msg));',
newRouting],
  ];
  for (const [needle, replacement] of changes) {
    if (source.split(needle).length !== 2) throw new Error("ZIbberflint runtime patch target missing or ambiguous; check pinned Letta version.");
    source = source.replace(needle, replacement);
  }
  return source;
}
