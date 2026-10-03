# Lincoln Discord Listener — Railway Deployment

One process, with separate Discord accounts for Lincoln and ZIbberflint.

## ZIbberflint

Set `ZIBB_DISCORD_BOT_TOKEN` in this existing Railway service's Variables tab
to enable ZIbberflint. Keep Lincoln's `DISCORD_BOT_TOKEN` unchanged.
The Letta API key must have access to both agents.

Invite the new bot to the server and grant View Channel, Send Messages,
Read Message History, and Send Messages in Threads where needed. Enable
Message Content Intent in the Discord Developer Portal for plain-word triggers.

ZIbberflint uses agent `agent-59a098ee-3d30-4e9f-b811-fc3ddd98b7aa` and
conversation `conv-50e495b0-61bc-4ead-b2af-5b34047ac031` in the three shared channels.
Channel `1484472784741728387` uses `conv-1c5ce938-d755-44f5-9d39-81b1d106f3c4`.
Arden's DMs use `conv-3da5d408-013b-48e6-b2ac-1b022e8f4170`.
Only Arden (Discord user `730173882153173163`) is allowed to DM this bot.
The bot's own DM channel is discovered on the first message.

In the configured channels, triggers are @mentions, replies to this bot
(even with the reply ping disabled), or the whole word `Zibb`, case-insensitive.
Unaddressed thread messages are ignored too. Any bot can trigger ZIbberflint
in an allowed server channel by @mentioning him, replying to his message
(including without a ping), or using the whole word `Zibb` or `Zibberflint`
(case-insensitive). His own messages are ignored, and bot DMs remain blocked.
Lincoln retains his existing bot allowlist. The runtime patch is checked against pinned Letta 0.27.0 and
fails startup if its expected source targets change.

After deploying, verify each trigger and a DM in Discord. Local tests do not
verify the token, Discord permissions, or Letta access.

## Railway Environment Variables

Set these in your Railway service settings:

| Variable | Value |
|----------|-------|
| `LETTA_API_KEY` | Your Letta API key (from app.letta.com → settings) |

## Railway Volume

Mount a volume at `/root/.letta` so channel config persists across redeploys.

The service also rebuilds its channel configuration from environment variables
and keeps canonical agent memory in Letta's remote git repository. A volume is
still recommended for local extension state, channel runtime caches, and easier
restarts.

## MemFS Runtime Requirements

Letta's git-backed memory requires the `git` executable at runtime. Railway's
default Node image does not include it, so `nixpacks.toml` explicitly installs
both `git` and `curl` through Nixpacks' runtime packages. It also provides the
Python/C++ build toolchain required when `node-pty` has to compile during npm
installation.

`start.mjs` fails fast if git is unavailable instead of silently starting with
an inaccessible memory filesystem. It also copies trusted extensions from this
repository's `extensions/` directory into `~/.letta/extensions/` before Letta
starts, making the MemFS synchronization repair reproducible after redeploys.

The bundled `memfs-sync-repair` extension:

- compares git-backed memory files with attached Letta API blocks by hash;
- synchronizes safe one-sided changes;
- stores the last common signature in attached block metadata so conflict
  detection survives an ephemeral Railway rebuild;
- establishes a first baseline automatically only when both sides already
  match;
- reports rather than overwriting ambiguous two-sided conflicts.

## First Deploy Setup

Once deployed, open Railway shell and run:

```bash
npx letta channels configure discord
```

Answer the prompts:
- Bot token: your Discord bot token
- DM policy: allowlist
- Auto-create thread on mention: **N**

Then add your channel route:

```bash
npx letta channels route add \
  --channel discord \
  --chat-id YOUR_DISCORD_CHANNEL_ID \
  --agent agent-036c41a5-b0cd-4e04-92fc-8a6f55e3c0b1 \
  --conversation conv-39a160fa-e44c-4eea-b626-03c79170db48
```

Then restart the service.

## Kill Local Listeners First (Windows)

```powershell
pm2 stop all; pm2 delete all; pm2 kill
```
