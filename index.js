const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActivityType
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const http = require("http");

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ANNOUNCEMENT_CHANNEL_ID = process.env.ANNOUNCEMENT_CHANNEL_ID;
const ROBLOX_UNIVERSE_ID = process.env.ROBLOX_UNIVERSE_ID || "7498394551";
const PING_ROLE_ID = process.env.PING_ROLE_ID || "";
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 300000);
const UPDATE_VOICE_CHANNEL_ID = process.env.UPDATE_VOICE_CHANNEL_ID || "";
const STATE_FILE = path.join(__dirname, "game-state.json");

const ROBLOX_GAME_URL = "https://www.roblox.com/games/129724410007188/Resets-Teletubbies-1997";

if (!DISCORD_TOKEN || !ANNOUNCEMENT_CHANNEL_ID) {
  console.error("❌ Missing DISCORD_TOKEN or ANNOUNCEMENT_CHANNEL_ID.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

let previous = null;
let checking = false;
let updateTimer = null;
let watchdogTimer = null;
let lastSuccessfulCheck = Date.now();

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Reset's Teletubbies 1997 bot is online.\n");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Health server listening on port ${PORT}`);
});

process.on("uncaughtException", error => {
  console.error("🚨 UNCAUGHT EXCEPTION:", error);
});

process.on("unhandledRejection", error => {
  console.error("🚨 UNHANDLED PROMISE REJECTION:", error);
});

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch (error) {
    console.error("⚠️ Could not load saved state:", error.message);
    return null;
  }
}

function saveState(game, thumbnail) {
  try {
    const state = {
      game,
      thumbnail,
      lastAnnouncedUpdated: game.updated || null,
      savedAt: new Date().toISOString()
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (error) {
    console.error("⚠️ Could not save state:", error.message);
  }
}

async function getRobloxGame() {
  const url = `https://games.roblox.com/v1/games?universeIds=${encodeURIComponent(ROBLOX_UNIVERSE_ID)}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "Reset-Teletubbies-Update-Bot/4.0" }
  });

  if (!response.ok) {
    throw new Error(`Roblox API returned HTTP ${response.status}`);
  }

  const json = await response.json();
  const game = json.data?.[0];

  if (!game) throw new Error("Roblox game was not found.");
  return game;
}

async function getThumbnail(universeId) {
  const url = `https://thumbnails.roblox.com/v1/games/icons?universeIds=${encodeURIComponent(universeId)}&size=512x512&format=Png&isCircular=false`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const json = await response.json();
  return json.data?.[0]?.imageUrl || null;
}

function getChanges(oldGame, newGame, oldThumbnail, newThumbnail) {
  const changes = [];
  if (!oldGame) return changes;

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
      title: "🕐 Roblox Game Updated",
      value: "Roblox reports that the game has been updated."
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

async function sendShutdownAnnouncement(game, changes, thumbnailUrl) {
  const channel = await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID);

  if (!channel || !channel.isTextBased()) {
    throw new Error("Announcement channel could not be used.");
  }

  const updatedTimestamp = game.updated
    ? Math.floor(new Date(game.updated).getTime() / 1000)
    : null;

  const ping = PING_ROLE_ID ? `<@&${PING_ROLE_ID}>` : "";
  const changeText = changes
    .map(change => `${change.title}\n${change.value}`)
    .join("\n\n");

  const embed = new EmbedBuilder()
    .setTitle("🔴 SERVER SHUTDOWN — Roblox Update Detected")
    .setDescription(
      "🦁🐻 **Reset's Teletubbies 1997 has been updated!**\n\n" +
      "The Roblox game/server may be temporarily unavailable while the new update is being released.\n\n" +
      "### 📋 Changes Detected\n" +
      changeText
    )
    .addFields(
      {
        name: "🕐 Roblox Updated",
        value: updatedTimestamp
          ? `<t:${updatedTimestamp}:F>\n(<t:${updatedTimestamp}:R>)`
          : "Unknown",
        inline: true
      },
      {
        name: "🆔 Universe ID",
        value: ROBLOX_UNIVERSE_ID,
        inline: true
      },
      {
        name: "🎮 Game",
        value: `[Play Reset's Teletubbies 1997](${ROBLOX_GAME_URL})`
      }
    )
    .setFooter({ text: "Reset's Teletubbies 1997 Update Monitor" })
    .setTimestamp();

  if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);

  await channel.send({ content: ping, embeds: [embed] });
  console.log("🔴 Shutdown/update announcement posted.");
}

async function checkForUpdate() {
  if (checking) return;
  checking = true;

  try {
    const game = await getRobloxGame();
    const thumbnail = await getThumbnail(ROBLOX_UNIVERSE_ID);
    lastSuccessfulCheck = Date.now();

    if (!previous) {
      const savedState = loadState();
      if (savedState?.game) {
        previous = {
          ...savedState.game,
          thumbnail: savedState.thumbnail
        };
      }
    }

    if (!previous) {
      previous = { ...game, thumbnail };
      saveState(game, thumbnail);
      console.log(`👀 Watching: ${game.name}`);
      console.log(`🕐 Current Roblox updated time: ${game.updated}`);
      console.log("💾 Initial state saved. No announcement sent.");
      return;
    }

    const oldThumbnail = previous.thumbnail || null;
    const changes = getChanges(previous, game, oldThumbnail, thumbnail);
    const updateTimestampChanged = previous.updated !== game.updated;

    if (updateTimestampChanged && game.updated) {
      console.log("🚨 NEW ROBLOX UPDATE DETECTED!");

      try {
        await sendShutdownAnnouncement(game, changes, thumbnail);
      } catch (error) {
        console.error("❌ Could not send announcement:", error.message);
      }

      console.log("🔊 Voice channel update step reached.");
      console.log("🔊 Voice channel ID configured:", Boolean(UPDATE_VOICE_CHANNEL_ID));

      if (UPDATE_VOICE_CHANNEL_ID) {
        try {
          console.log("🔊 Fetching voice channel...");
          const voiceChannel = await client.channels.fetch(UPDATE_VOICE_CHANNEL_ID);
          console.log("🔊 Channel found:", voiceChannel ? voiceChannel.name : "NO CHANNEL");

          if (!voiceChannel) {
            console.error("❌ Discord returned no channel.");
          } else if (!voiceChannel.isVoiceBased()) {
            console.error("❌ The configured channel is not a voice channel.");
          } else {
            await voiceChannel.setName("🆕 Reset's Teletubbies");
            console.log("🔊 Updated Reset's Teletubbies voice channel.");
          }
        } catch (error) {
          console.error("❌ Could not update voice channel:", error.message);
        }
      }

      previous = { ...game, thumbnail };
      saveState(game, thumbnail);
      console.log(`💾 Recorded update timestamp: ${game.updated}`);
      console.log("⏸️ Duplicate announcements suppressed until the next Roblox update.");
      return;
    }

    if (changes.length > 0) {
      console.log("ℹ️ Non-update Roblox data changed:");
      for (const change of changes) console.log(`   ${change.title}`);
    }

    previous = { ...game, thumbnail };
    saveState(game, thumbnail);
    console.log("✅ No new Roblox update detected.");
  } catch (error) {
    console.error("❌ Update check failed:", error.message);
  } finally {
    checking = false;
  }
}

function startMonitoring() {
  if (updateTimer) clearInterval(updateTimer);

  updateTimer = setInterval(() => {
    checkForUpdate().catch(error => {
      console.error("🚨 Monitoring loop error:", error);
    });
  }, POLL_INTERVAL_MS);

  console.log(`⏱️ Monitoring every ${POLL_INTERVAL_MS / 1000} seconds.`);
}

client.on("ready", () => {
  console.log(`💓 Discord connection ready: ${client.user.tag}`);
});

client.on("reconnecting", () => {
  console.log("🔌 Discord reconnecting...");
});

client.on("resume", () => {
  console.log("🔄 Discord connection resumed.");
});

client.on("disconnect", () => {
  console.warn("⚠️ Discord disconnected. Discord.js will attempt to reconnect.");
});

function startWatchdog() {
  if (watchdogTimer) clearInterval(watchdogTimer);

  watchdogTimer = setInterval(() => {
    const minutesSinceCheck = (Date.now() - lastSuccessfulCheck) / 60000;

    console.log(
      `💓 Watchdog: Discord ${client.isReady() ? "CONNECTED" : "NOT READY"} | Last Roblox check ${minutesSinceCheck.toFixed(1)} min ago`
    );

    if (minutesSinceCheck > Math.max(10, (POLL_INTERVAL_MS / 60000) * 3)) {
      console.warn("⚠️ Roblox monitor may be stalled. Running recovery check...");
      checkForUpdate().catch(error => {
        console.error("❌ Recovery check failed:", error.message);
      });
    }
  }, 60000);

  console.log("💓 Watchdog started.");
}

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  client.user.setActivity("Reset's Teletubbies 1997", {
    type: ActivityType.Watching
  });

  await checkForUpdate();
  startMonitoring();
  startWatchdog();
});

async function startDiscord() {
  try {
    console.log("🔌 Connecting to Discord...");
    await client.login(DISCORD_TOKEN);
    console.log("✅ Discord login successful.");
  } catch (error) {
    console.error("❌ Discord login failed:", error.message);
    process.exit(1);
  }
}

startDiscord();
