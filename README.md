# Lincoln Discord Listener — Railway Deployment

One process. One bot token. No haunted duplicates.

## Railway Environment Variables

Set these in your Railway service settings:

| Variable | Value |
|----------|-------|
| `LETTA_API_KEY` | Your Letta API key (from app.letta.com → settings) |

## Railway Volume

Mount a volume at `/root/.letta` so channel config persists across redeploys.

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
