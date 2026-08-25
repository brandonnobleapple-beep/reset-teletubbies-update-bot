const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActivityType
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ANNOUNCEMENT_CHANNEL_ID = process.env.ANNOUNCEMENT_CHANNEL_ID;
const ROBLOX_UNIVERSE_ID = process.env.ROBLOX_UNIVERSE_ID || "7498394551";
const PING_ROLE_ID = process.env.PING_ROLE_ID || "";
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 300000);

const STATE_FILE = path.join(__dirname, "game-state.json");

const ROBLOX_GAME_URL =
  "https://www.roblox.com/games/129724410007188/Resets-Teletubbies-1997";

if (!DISCORD_TOKEN || !ANNOUNCEMENT_CHANNEL_ID) {
  console.error("❌ Missing DISCORD_TOKEN or ANNOUNCEMENT_CHANNEL_ID.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

let previous = null;
let checking = false;

// --------------------------------------------------
// Persistent state
// --------------------------------------------------

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return null;
    }

    const data = fs.readFileSync(STATE_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("⚠️ Could not load saved game state:", error.message);
    return null;
  }
}

function saveState(game, thumbnail) {
  try {
    const state = {
      game,
      thumbnail,
      savedAt: new Date().toISOString()
    };

    fs.writeFileSync(
      STATE_FILE,
      JSON.stringify(state, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("⚠️ Could not save game state:", error.message);
  }
}

// --------------------------------------------------
// Roblox API
// --------------------------------------------------

async function getRobloxGame() {
  const url =
    `https://games.roblox.com/v1/games?universeIds=${encodeURIComponent(
      ROBLOX_UNIVERSE_ID
    )}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Reset-Teletubbies-Update-Bot/2.0"
    }
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
    `https://thumbnails.roblox.com/v1/games/icons?universeIds=${encodeURIComponent(
      universeId
    )}&size=512x512&format=Png&isCircular=false`;

  const response = await fetch(url);

  if (!response.ok) {
    return null;
  }

  const json = await response.json();

  return json.data?.[0]?.imageUrl || null;
}

// --------------------------------------------------
// Change detection
// --------------------------------------------------

function getChanges(oldGame, newGame, oldThumbnail, newThumbnail) {
  const changes = [];

  if (!oldGame) {
    return changes;
  }

  if (oldGame.name !== newGame.name) {
    changes.push({
      type: "name",
      title: "📝 Name Changed",
      value: `**Before:** ${oldGame.name}\n**After:** ${newGame.name}`
    });
  }

  if (oldGame.description !== newGame.description) {
    changes.push({
      type: "description",
      title: "📄 Description Changed",
      value: "The game's description has been updated."
    });
  }

  if (oldGame.updated !== newGame.updated) {
    changes.push({
      type: "updated",
      title: "🕐 Game Updated",
      value: "Roblox reports that the game was updated."
    });
  }

  if (oldGame.rootPlaceId !== newGame.rootPlaceId) {
    changes.push({
      type: "place",
      title: "🎮 Place Changed",
      value: `**Before:** ${oldGame.rootPlaceId}\n**After:** ${newGame.rootPlaceId}`
    });
  }

  if (oldGame.playing !== newGame.playing) {
    changes.push({
      type: "players",
      title: "👥 Player Count Changed",
      value: `**Before:** ${oldGame.playing}\n**After:** ${newGame.playing}`
    });
  }

  if (oldGame.visits !== newGame.visits) {
    changes.push({
      type: "visits",
      title: "📈 Visit Count Changed",
      value: `**Before:** ${oldGame.visits.toLocaleString()}\n**After:** ${newGame.visits.toLocaleString()}`
    });
  }

  if (oldThumbnail !== newThumbnail) {
    changes.push({
      type: "thumbnail",
      title: "🖼️ Thumbnail Changed",
      value: "The game's thumbnail has been updated."
    });
  }

  return changes;
}

// --------------------------------------------------
// Announcement
// --------------------------------------------------

async function sendAnnouncement(game, changes, thumbnailUrl) {
  const channel = await client.channels.fetch(
    ANNOUNCEMENT_CHANNEL_ID
  );

  if (!channel || !channel.isTextBased()) {
    throw new Error("Announcement channel could not be used.");
  }

  const isMajorUpdate = changes.some(change =>
    ["updated", "name", "description", "place"].includes(change.type)
  );

  const ping =
    isMajorUpdate && PING_ROLE_ID
      ? `<@&${PING_ROLE_ID}>`
      : "";

  const changeText = changes
    .map(change => `**${change.title}**\n${change.value}`)
    .join("\n\n");

  const updatedTimestamp = game.updated
    ? Math.floor(new Date(game.updated).getTime() / 1000)
    : null;

  const embed = new EmbedBuilder()
    .setTitle("🚨 Reset's Teletubbies 1997 — Update Detected!")
    .setDescription(
      `A change has been detected in **Reset's Teletubbies 1997**.\n\n${changeText}`
    )
    .addFields(
      {
        name: "🎮 Game",
        value: `[Reset's Teletubbies 1997](${ROBLOX_GAME_URL})`,
        inline: true
      },
      {
        name: "🆔 Universe ID",
        value: ROBLOX_UNIVERSE_ID,
        inline: true
      },
      {
        name: "🕐 Roblox Updated",
        value: updatedTimestamp
          ? `<t:${updatedTimestamp}:F>\n(<t:${updatedTimestamp}:R>)`
          : "Unknown",
        inline: false
      }
    )
    .setFooter({
      text: "Reset's Teletubbies 1997 Update Monitor"
    })
    .setTimestamp();

  if (thumbnailUrl) {
    embed.setThumbnail(thumbnailUrl);
  }

  await channel.send({
    content: ping || undefined,
    embeds: [embed]
  });

  console.log("📢 Announcement posted to Discord.");
}

// --------------------------------------------------
// Update checker
// --------------------------------------------------

async function checkForUpdate() {
  if (checking) {
    return;
  }

  checking = true;

  try {
    const game = await getRobloxGame();
    const thumbnail = await getThumbnail(ROBLOX_UNIVERSE_ID);

    // Load saved state if we haven't already.
    if (!previous) {
      const savedState = loadState();

      if (savedState?.game) {
        previous = savedState.game;
      }

      if (savedState?.thumbnail) {
        previous.thumbnail = savedState.thumbnail;
      }
    }

    // First-ever check.
    if (!previous) {
      previous = {
        ...game,
        thumbnail
      };

      saveState(game, thumbnail);

      console.log(`👀 Watching: ${game.name}`);
      console.log(`🕐 Current Roblox updated time: ${game.updated}`);
      console.log("💾 Initial game state saved.");

      return;
    }

    const oldThumbnail = previous.thumbnail || null;

    const changes = getChanges(
      previous,
      game,
      oldThumbnail,
      thumbnail
    );

    if (changes.length > 0) {
      console.log("🚨 UPDATE DETECTED!");

      for (const change of changes) {
        console.log(`   ${change.title}`);
      }

      await sendAnnouncement(
        game,
        changes,
        thumbnail
      );

      previous = {
        ...game,
        thumbnail
      };

      saveState(game, thumbnail);

      console.log("💾 New game state saved.");
    } else {
      previous = {
        ...game,
        thumbnail
      };

      saveState(game, thumbnail);

      console.log(
        `✅ No changes detected. Next check in ${
          POLL_INTERVAL_MS / 1000
        } seconds.`
      );
    }
  } catch (error) {
    console.error(
      "❌ Update check failed:",
      error.message
    );
  } finally {
    checking = false;
  }
}

// --------------------------------------------------
// Discord startup
// --------------------------------------------------

client.once("ready", async () => {
  console.log(
    `✅ Logged in as ${client.user.tag}`
  );

  client.user.setActivity(
    "Reset's Teletubbies 1997",
    {
      type: ActivityType.Watching
    }
  );

  await checkForUpdate();

  setInterval(
    checkForUpdate,
    POLL_INTERVAL_MS
  );
});

// --------------------------------------------------
// Discord login
// --------------------------------------------------

client.login(DISCORD_TOKEN).catch(error => {
  console.error(
    "❌ Discord login failed:",
    error.message
  );

  process.exit(1);
});
