const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActivityType
} = require("discord.js");

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ANNOUNCEMENT_CHANNEL_ID = process.env.ANNOUNCEMENT_CHANNEL_ID;
const ROBLOX_UNIVERSE_ID = process.env.ROBLOX_UNIVERSE_ID || "7498394551";
const PING_ROLE_ID = process.env.PING_ROLE_ID || "";
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 300000);

if (!DISCORD_TOKEN || !ANNOUNCEMENT_CHANNEL_ID) {
  console.error("Missing DISCORD_TOKEN or ANNOUNCEMENT_CHANNEL_ID.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

let previous = null;
let firstCheck = true;
let checking = false;

async function getRobloxGame() {
  const url =
    `https://games.roblox.com/v1/games?universeIds=${encodeURIComponent(ROBLOX_UNIVERSE_ID)}`;

  const response = await fetch(url, {
    headers: { "User-Agent": "Reset-Teletubbies-Update-Bot/1.0" }
  });

  if (!response.ok) {
    throw new Error(`Roblox API returned HTTP ${response.status}`);
  }

  const json = await response.json();
  const game = json.data?.[0];

  if (!game) {
    throw new Error("Roblox game was not found.");
  }

  return game;
}

async function getThumbnail(universeId) {
  const url =
    `https://thumbnails.roblox.com/v1/games/icons?universeIds=${encodeURIComponent(universeId)}&size=512x512&format=Png&isCircular=false`;

  const response = await fetch(url);

  if (!response.ok) return null;

  const json = await response.json();
  return json.data?.[0]?.imageUrl || null;
}

function getChanges(oldGame, newGame) {
  if (!oldGame) return [];

  const changes = [];

  if (oldGame.name !== newGame.name) {
    changes.push(`**Name:** ${oldGame.name} → ${newGame.name}`);
  }

  if (oldGame.description !== newGame.description) {
    changes.push("**Description:** Changed");
  }

  if (oldGame.updated !== newGame.updated) {
    changes.push("**Date/Time:** Game updated");
  }

  if (oldGame.rootPlaceId !== newGame.rootPlaceId) {
    changes.push(`**Place:** ${oldGame.rootPlaceId} → ${newGame.rootPlaceId}`);
  }

  return changes;
}

async function sendAnnouncement(game, changes, thumbnailUrl) {
  const channel = await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID);

  if (!channel || !channel.isTextBased()) {
    throw new Error("Announcement channel could not be used.");
  }

  const isMajorUpdate = changes.some(change =>
    change.includes("Date/Time") || change.includes("Name")
  );

  const ping = isMajorUpdate && PING_ROLE_ID
    ? `<@&${PING_ROLE_ID}>`
    : "";

  const embed = new EmbedBuilder()
    .setTitle("🚨 Reset's Teletubbies 1997 Update Detected!")
    .setDescription(
      changes.length
        ? changes.join("\n")
        : "A change was detected in the Roblox game."
    )
    .addFields(
      {
        name: "🎮 Game",
        value: `[Reset's Teletubbies 1997](https://www.roblox.com/games/129724410007188/Resets-Teletubbies-1997)`
      },
      {
        name: "🆔 Universe ID",
        value: ROBLOX_UNIVERSE_ID,
        inline: true
      },
      {
        name: "🕐 Roblox Updated",
        value: game.updated ? `<t:${Math.floor(new Date(game.updated).getTime() / 1000)}:F>` : "Unknown",
        inline: true
      }
    )
    .setTimestamp();

  if (thumbnailUrl) {
    embed.setThumbnail(thumbnailUrl);
  }

  await channel.send({
    content: ping || undefined,
    embeds: [embed]
  });
}

async function checkForUpdate() {
  if (checking) return;
  checking = true;

  try {
    const game = await getRobloxGame();
    const thumbnail = await getThumbnail(ROBLOX_UNIVERSE_ID);

    if (firstCheck) {
      previous = { ...game, thumbnail };
      firstCheck = false;
      console.log(`Watching: ${game.name}`);
      console.log(`Current Roblox updated time: ${game.updated}`);
      return;
    }

    const changes = getChanges(previous, game);

    if (thumbnail !== previous.thumbnail) {
      changes.push("**Thumbnail:** Changed");
    }

    if (changes.length > 0) {
      console.log("Update detected:", changes);

      await sendAnnouncement(game, changes, thumbnail);

      previous = { ...game, thumbnail };
    } else {
      previous = { ...game, thumbnail };
    }
  } catch (error) {
    console.error("Update check failed:", error.message);
  } finally {
    checking = false;
  }
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  client.user.setActivity("Reset's Teletubbies 1997", {
    type: ActivityType.Watching
  });

  await checkForUpdate();

  setInterval(checkForUpdate, POLL_INTERVAL_MS);
});

client.login(DISCORD_TOKEN).catch(error => {
  console.error("Discord login failed:", error.message);
  process.exit(1);
});