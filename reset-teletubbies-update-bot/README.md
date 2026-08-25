# Reset's Teletubbies 1997 Update Bot

A small Discord bot dedicated to the `#announcements` channel in a Reset's Teletubbies 1997 server.

## What it watches

- Roblox game update date/time
- Game name changes
- Game description changes
- Game thumbnail changes
- Place ID changes

## Default game

- Universe ID: `7498394551`
- Place ID: `129724410007188`

## Discord setup

The bot needs permission to:

- View the announcement channel
- Send Messages
- Embed Links
- Mention the configured update role (only if you want major-update pings)

## Environment variables

`DISCORD_TOKEN`
Your Discord bot token.

`ANNOUNCEMENT_CHANNEL_ID`
The ID of your server's `#announcements` channel.

`ROBLOX_UNIVERSE_ID`
Defaults to `7498394551`.

`PING_ROLE_ID`
Optional. If set, the bot pings this role for major updates.

`POLL_INTERVAL_MS`
Defaults to 300000 (5 minutes).

## Important behavior

The first Roblox check only establishes the current baseline. It does not send an announcement for the existing game state.

After that, detected changes create an announcement embed.

This bot is intentionally separate from a general-purpose Discord bot or HawkWatch, so the announcements channel can have one dedicated update bot.
