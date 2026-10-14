import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { patchZibberflint, patchZibberflintBotAccess } from "./zibberflint.mjs";
import { patchCorvinictus } from "./corvinictus.mjs";
import { patchDiscordKeywords } from "./discord-keywords.mjs";
import { lincolnBotChannels, patchLincolnBotAccess } from "./lincoln-bot-access.mjs";

test("combined bot guard restricts Lincoln to six channels and explicit triggers", () => {
  const start = readFileSync(new URL("./start.mjs", import.meta.url), "utf8");
  const fn = start.slice(start.indexOf("function patchDiscordBotAllowlist()"), start.indexOf("function patchDiscordRespectAutoThread()"));
  const guard = new Function("return " + fn.match(/const replacement = (`[^`]+`);/)[1])();
  const fixture = guard + '\n        const wasMentioned = chatType === "channel" && hasBotMention(message);\n    const conversationId = await this.createConversationForAgent(config3.agentId, buildDiscordConversationSummary(msg));';
  const existing = patchDiscordKeywords(patchCorvinictus(patchZibberflintBotAccess(patchZibberflint(fixture))));
  const patched = patchLincolnBotAccess(existing);
  assert.equal(patchLincolnBotAccess(patched), patched);
  assert.equal(patchDiscordKeywords(patchCorvinictus(patchZibberflintBotAccess(patchZibberflint(patched)))), patched);
  assert.throws(() => patchLincolnBotAccess("changed runtime"));
  const body = patched.slice(0, patched.indexOf("// Zibberflint triggers v2"));
  const run = new Function("message", "config3", "client", "process", "console", "hasBotMention", body + "\nreturn true;");
  const check = (content, options = {}) => run({
    content, channelId: options.channel ?? lincolnBotChannels[0],
    guildId: options.dm ? null : "guild", author: { id: options.self ? "self" : "other", bot: options.bot ?? true },
  }, { accountId: options.account ?? "lincoln" }, { user: { id: "self" } },
  { env: { DISCORD_ACCOUNT_ID: "lincoln", LETTA_DISCORD_REPLY_TO_BOT_IDS: "other" } },
  { log() {} }, () => options.mention ?? false);
  for (const channel of lincolnBotChannels) {
    for (const name of ["Lincoln", "LINCOLN", "Lincoln's", "Lincoln’s", "@lincoln"]) assert.equal(check(name, { channel }), true);
    assert.equal(check("hello", { channel, mention: true }), true);
    for (const name of ["hello", "Lincolnshire", "abrahamlincoln"]) assert.equal(check(name, { channel }), undefined);
    assert.equal(check("Lincoln", { channel, self: true }), undefined);
    assert.equal(check("Lincoln", { channel, dm: true }), undefined);
  }
  for (const channel of ["outside", "1486986160327753780", "child-thread"]) {
    assert.equal(check("Lincoln", { channel, mention: true }), undefined);
  }
  assert.equal(check("hello", { bot: false, channel: "outside" }), true);
  for (const account of ["zibberflint", "corvinictus"]) {
    assert.equal(check("hello", { account }), true);
    assert.equal(check("Lincoln", { account, dm: true }), undefined);
  }
});
