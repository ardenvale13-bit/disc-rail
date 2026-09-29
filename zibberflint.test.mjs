import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { addZibberflint, patchZibberflint, patchZibberflintBotAccess, zibbConversationId, zibbPrivateChannelConversationId, zibbDmConversationId } from "./zibberflint.mjs";

test("optional account, separate routes, and restricted DMs", () => {
  const accounts = { accounts: [{ accountId: "lincoln" }] }, routes = { routes: [] };
  addZibberflint(accounts, routes, undefined);
  assert.equal(accounts.accounts.length, 1);
  addZibberflint(accounts, routes, "test-token");
  assert.equal(accounts.accounts.length, 2);
  assert.deepEqual(accounts.accounts[1].allowedUsers, ["730173882153173163"]);
  assert.equal(routes.routes.length, 4);
  assert.equal(routes.routes.find(route => route.chatId === "1484472784741728387").conversationId, zibbPrivateChannelConversationId);
  assert.ok(routes.routes.filter(route => route.chatId !== "1484472784741728387").every(route => route.conversationId === zibbConversationId));
});

test("single bot requires Zibb's name; Lincoln and humans retain their policies", async () => {
  const source = readFileSync(process.env.LETTA_TEST_BUNDLE, "utf8");
  const start = readFileSync(new URL("./start.mjs", import.meta.url), "utf8");
  const allowlistFunction = start.slice(start.indexOf("function patchDiscordBotAllowlist()"), start.indexOf("function patchDiscordRespectAutoThread()"));
  const literal = allowlistFunction.match(/const replacement = (`[^`]+`);/)[1];
  const guard = new Function("return " + literal)();
  const base = patchZibberflint(source.replace('        if (message.author.bot)\n          return;', guard));
  const patched = patchZibberflintBotAccess(base);
  assert.equal(patchZibberflintBotAccess(patched), patched);
  assert.throws(() => patchZibberflintBotAccess(source));
  const first = patched.indexOf('        if (message.author.id === client?.user?.id)');
  const body = patched.slice(first, patched.indexOf('        if (chatType === "direct")', first));
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const run = new AsyncFunction("message", "config3", "client", "process", "console", "resolveDiscordChatType", "isThreadMessage", "hasBotMention", "isDiscordGuildChannelAllowed", body + "\nreturn wasMentioned;");
  const check = (content, { id = "1438668481716289700", bot = true, accountId = "zibberflint", allowed = true, mention = false, guildId = "guild", reply = false } = {}) => run(
    { content, author: { id, bot }, guildId, channel: {}, channelId: "channel", reference: reply ? { messageId: "msg" } : undefined, fetchReference: async () => ({ author: { id: "self" } }) },
    { accountId }, { user: { id: "self" } }, { env: { LETTA_DISCORD_REPLY_TO_BOT_IDS: "old-bot" } }, { log() {}, warn() {} }, guild => guild ? "channel" : "direct", () => false, () => mention, () => allowed);
  assert.equal(await check("hello ZIBB!"), true);
  assert.equal(await check("Zibberflint, hello"), true);
  assert.equal(await check("zibble"), undefined);
  assert.equal(await check("hello", { mention: true, reply: true }), undefined);
  assert.equal(await check("Zibb", { id: "old-bot" }), undefined);
  assert.equal(await check("Zibb", { id: "self" }), undefined);
  assert.equal(await check("Zibb", { allowed: false }), undefined);
  assert.equal(await check("Zibb", { guildId: null }), undefined);
  assert.equal(await check("Zibb", { accountId: "lincoln", mention: true }), undefined);
  assert.equal(await check("hello", { accountId: "lincoln", id: "old-bot", mention: true }), true);
  assert.equal(await check("hello", { bot: false, mention: true }), true);
  assert.equal(await check("hello", { bot: false, reply: true }), true);
});

test("pinned runtime patch and actual trigger behavior", async () => {
  const source = readFileSync(process.env.LETTA_TEST_BUNDLE, "utf8");
  const patched = patchZibberflint(source);
  assert.equal(patchZibberflint(patched), patched);
  assert.throws(() => patchZibberflint("unexpected version"));
  const block = patched.slice(patched.indexOf("        // Zibberflint triggers v2"), patched.indexOf('        if (chatType === "direct")', patched.indexOf("// Zibberflint triggers v2")));
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const routingStart = patched.indexOf('    const conversationId = config3.accountId === "zibberflint"');
  const routing = patched.slice(routingStart, patched.indexOf(';', routingStart) + 1);
  const resolve = new AsyncFunction("config3", "msg", routing + "\nreturn conversationId;");
  assert.equal(await resolve({ accountId: "zibberflint" }, { chatType: "direct" }), zibbDmConversationId);
  assert.equal(await resolve({ accountId: "zibberflint" }, { chatType: "channel", chatId: "1484472784741728387" }), zibbPrivateChannelConversationId);
  assert.equal(await resolve({ accountId: "zibberflint" }, { chatType: "channel", chatId: "1421576309582336090" }), zibbConversationId);
  const v1 = patched.replace("// Zibberflint triggers v2", "// Zibberflint triggers v1").replace(routing, `    const conversationId = config3.accountId === "zibberflint"
      ? "${zibbConversationId}"
      : await this.createConversationForAgent(config3.agentId, buildDiscordConversationSummary(msg));`);
  assert.equal(patchZibberflint(v1), patched);
  const run = new AsyncFunction("message", "config3", "chatType", "content", "isThread", "hasBotMention", "isDiscordGuildChannelAllowed", "client", block + "\nreturn wasMentioned;");
  const trigger = (content, { mention = false, reply, allowed = true, thread = false, accountId = "zibberflint" } = {}) => run({ channelId: "one", channel: {}, reference: reply ? { messageId: "two" } : undefined, fetchReference: async () => ({ author: { id: reply } }) }, { accountId }, "channel", content, thread, () => mention, () => allowed, { user: { id: "zibb-bot" } });
  assert.equal(await trigger("hey ZIBB, hello"), true);
  assert.equal(await trigger("Zibb's idea"), true);
  assert.equal(await trigger("zibble"), undefined);
  assert.equal(await trigger("hello", { mention: true }), true);
  assert.equal(await trigger("hello", { reply: "zibb-bot" }), true);
  assert.equal(await trigger("hello", { reply: "someone-else" }), undefined);
  assert.equal(await trigger("Zibb", { allowed: false }), undefined);
  assert.equal(await trigger("hello", { thread: true }), undefined);
  assert.equal(await trigger("Zibb", { accountId: "lincoln" }), false);
});
