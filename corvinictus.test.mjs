import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { addCorvinictus, patchCorvinictus, corviDmConversationId, corviPublicConversationId } from "./corvinictus.mjs";
import { patchZibberflint, patchZibberflintBotAccess, zibbChannels, zibbDmConversationId } from "./zibberflint.mjs";

test("optional Corvi account and five explicit routes", () => {
  const accounts = { accounts: [] }, routes = { routes: [] };
  addCorvinictus(accounts, routes);
  assert.equal(accounts.accounts.length, 0);
  addCorvinictus(accounts, routes, "test-token");
  assert.deepEqual(accounts.accounts[0].allowedUsers, ["730173882153173163"]);
  assert.deepEqual(Object.keys(accounts.accounts[0].allowed_channels), zibbChannels);
  assert.equal(routes.routes.length, 5);
  assert.equal(routes.routes.find(r => r.chatId === "1476388996446814338").conversationId, corviDmConversationId);
  assert.ok(routes.routes.filter(r => r.chatType === "channel").every(r => r.conversationId === corviPublicConversationId));
});

test("combined runtime triggers, routing, and repeat startup", async () => {
  const source = readFileSync(process.env.LETTA_TEST_BUNDLE, "utf8");
  const start = readFileSync(new URL("./start.mjs", import.meta.url), "utf8");
  const allowlist = start.slice(start.indexOf("function patchDiscordBotAllowlist()"), start.indexOf("function patchDiscordRespectAutoThread()"));
  const guard = new Function("return " + allowlist.match(/const replacement = (`[^`]+`);/)[1])();
  const zibb = patchZibberflintBotAccess(patchZibberflint(source.replace('        if (message.author.bot)\n          return;', guard)));
  const patched = patchCorvinictus(zibb);
  assert.equal(patchCorvinictus(patchZibberflintBotAccess(patchZibberflint(patched))), patched);
  assert.throws(() => patchCorvinictus(source));
  const first = patched.indexOf('        if (message.author.id === client?.user?.id)');
  const body = patched.slice(first, patched.indexOf('        if (chatType === "direct")', first));
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const run = new AsyncFunction("message", "config3", "client", "process", "console", "resolveDiscordChatType", "isThreadMessage", "hasBotMention", "isDiscordGuildChannelAllowed", body + "\nreturn wasMentioned;");
  const check = (content, { accountId = "corvinictus", bot = true, id = "any-bot", allowed = true, mention = false, reply, guildId = "guild", thread = false } = {}) => run(
    { content, author: { id, bot }, guildId, channel: {}, channelId: "channel", reference: reply ? { messageId: "msg" } : undefined, fetchReference: async () => ({ author: { id: reply } }) },
    { accountId }, { user: { id: "self" } }, { env: { LETTA_DISCORD_REPLY_TO_BOT_IDS: "old-bot" } }, { log() {}, warn() {} }, guild => guild ? "channel" : "direct", () => thread, () => mention, () => allowed);
  for (const bot of [true, false]) {
    for (const name of ["Corvi", "CORVINICTUS"]) assert.equal(await check(`hey ${name}!`, { bot }), true);
    assert.equal(await check("hello", { bot, mention: true }), true);
    assert.equal(await check("hello", { bot, reply: "self" }), true);
    assert.equal(await check("hello", { bot, reply: "someone-else" }), undefined);
    assert.equal(await check("corviness", { bot }), undefined);
    assert.equal(await check("hello", { bot, thread: true }), undefined);
  }
  assert.equal(await check("Corvi", { allowed: false }), undefined);
  assert.equal(await check("Corvi", { id: "self" }), undefined);
  assert.equal(await check("Corvi", { guildId: null }), undefined);
  assert.equal(await check("Zibb", { accountId: "zibberflint" }), true);
  assert.equal(await check("Corvi", { accountId: "zibberflint" }), undefined);
  assert.equal(await check("hello", { accountId: "lincoln", mention: true }), undefined);
  assert.equal(await check("hello", { accountId: "lincoln", id: "old-bot", mention: true }), true);
  const routingStart = patched.indexOf('    const conversationId = config3.accountId === "corvinictus"');
  const routing = patched.slice(routingStart, patched.indexOf(';', routingStart) + 1);
  const resolve = new AsyncFunction("config3", "msg", routing + "\nreturn conversationId;");
  assert.equal(await resolve({ accountId: "corvinictus" }, { chatType: "direct" }), corviDmConversationId);
  assert.equal(await resolve({ accountId: "corvinictus" }, { chatType: "channel" }), corviPublicConversationId);
  assert.equal(await resolve({ accountId: "zibberflint" }, { chatType: "direct" }), zibbDmConversationId);
});
