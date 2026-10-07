// Apply after the existing account patches so cached and fresh bundles agree.
export function patchDiscordKeywords(source) {
  const marker = "// Discord keyword triggers v1";
  if (source.includes(marker)) return source;
  const needle = '        let wasMentioned = chatType === "channel" && hasBotMention(message);';
  if (source.split(needle).length !== 2) throw new Error("Discord keyword patch target missing or ambiguous.");
  return source.replace(needle, `${needle}
        ${marker}
        if (chatType === "channel") {
          const keywordPattern = config3.accountId === "zibberflint"
            ? /\\b(?:zibb|zibberflint|sock|socks|sporchlet|sporchlets)\\b/i
            : config3.accountId === "corvinictus"
              ? /\\b(?:corvi|corvinictus|grudge|purple|glow|sporchlet|sporchlets)\\b/i
              : config3.accountId === (process.env.DISCORD_ACCOUNT_ID || "f208d146-6eca-4c59-8221-7bff2cd288a4")
                ? /\\blincoln\\b/i : null;
          if (keywordPattern && keywordPattern.test(content)) wasMentioned = true;
        }`);
}
