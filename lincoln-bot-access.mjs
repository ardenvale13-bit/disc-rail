export const lincolnBotChannels = [
  "1421576309582336090", "1421970395669729351", "1421969229430784121",
  "1421967585091653784", "1477335744073961563", "1421972753338339418",
];

// Apply after Zibb/Corvi patches; also upgrades previously patched bundles.
export function patchLincolnBotAccess(source) {
  const marker = "/* Lincoln scoped bot triggers v1 */";
  if (source.includes(marker)) return source;
  const needle = 'if (message.author.bot && (/* Zibberflint all-bot access v2 */';
  if (source.split(needle).length !== 2) {
    throw new Error("Lincoln bot-access patch target missing or ambiguous.");
  }
  return source.replace(needle, `if (message.author.bot && (${marker}
          config3.accountId === (process.env.DISCORD_ACCOUNT_ID || "f208d146-6eca-4c59-8221-7bff2cd288a4")
          ? !(message.guildId && ${JSON.stringify(lincolnBotChannels)}.includes(message.channelId)
            && (hasBotMention(message) || /\\blincoln\\b/i.test(message.content ?? "")))
          : /* Zibberflint all-bot access v2 */`);
}
