# Lincoln Discord Listener — Railway Deployment

One process. One bot token. No haunted duplicates.

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
both `git` and `curl` through Nixpacks' runtime packages.

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
