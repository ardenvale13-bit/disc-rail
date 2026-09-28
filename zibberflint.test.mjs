import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { addZibberflint, patchZibberflint, zibbConversationId, zibbPrivateChannelConversationId, zibbDmConversationId } from "./zibberflint.mjs";

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
