# DIVO — Discord Voice Companion

A Discord bot that sits in your voice channel and talks back when you talk to it. Say its name ("Divo, …") and it answers out loud. Keep talking right after it replies and it treats that as a follow-up.

Speech-to-text and AI replies run on [Groq](https://console.groq.com) (free tier). The voice runs locally with [Kokoro](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX). Architecture and contributor notes: [AGENTS.md](AGENTS.md).

## Commands

| Command | What it does |
|---|---|
| `/join` | Joins the voice channel you're in and starts listening |
| `/leave` | Leaves the voice channel |
| `/voice type:Female\|Male` | Picks the bot's voice for this server |
| `/persona set description:…` | Gives the bot a custom personality, e.g. "a sarcastic pirate who loves bad puns" (max 1000 characters) |
| `/persona show` | Shows the current personality |
| `/persona reset` | Goes back to the default personality (`BOT_PERSONA` in `.env`) |

`/voice` and `/persona` are saved per server in `data/guild-settings.json`. They take effect from the bot's next reply, even mid-conversation.

## 1. Create the Discord bot (once)

1. Go to <https://discord.com/developers/applications> → **New Application** → name it (e.g. DIVO).
2. **Bot** tab → **Reset Token** → copy it. This is `DISCORD_TOKEN`; keep it secret. No privileged intents are needed.
3. **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot permissions: `View Channels`, `Connect`, `Speak`
   - Open the generated URL and add the bot to your server.
4. In Discord: **User Settings → Advanced → Developer Mode** on. Then right-click your server → **Copy Server ID**. This is `DISCORD_DEV_GUILD_ID`; it makes slash commands appear instantly.

Tip: create a second application (e.g. "DIVO Dev") for local testing. Two copies of the bot running with the **same** token would both answer every command.

## 2. Get a Groq API key (once)

<https://console.groq.com/keys> → **Create API Key**. This is `GROQ_API_KEY`.

## 3. Run it locally

Needs **Node.js 22.12+** (`node -v`).

```bash
npm install
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
# fill in DISCORD_TOKEN, GROQ_API_KEY, DISCORD_DEV_GUILD_ID in .env

npm run doctor                # checks audio libs, Groq key + models, Discord login
npm run dev                   # starts the bot with auto-reload
```

The first start downloads the voice model (~300 MB). Wait for `Text-to-speech ready` in the logs.

### Test checklist

1. Join a voice channel and run `/join`.
2. Say **"Divo, tell me a fun fact."** In the logs you should see `Heard … addressed: "name"`, then `Replied …`, and hear the answer.
3. Right after it answers, say **"Another one."** without the name. It should answer (`addressed: "follow-up"`).
4. Talk to a friend without the name. It should log `Heard` but stay quiet.
5. Start talking while it's answering you. It should stop (`Interrupted by speaker`).
6. Run `/voice type:Male`, then talk to it again. It should answer in a male voice.
7. Run `/persona set description:A grumpy pirate`, then talk to it. It should answer in character. `/persona reset` undoes it.
8. Everyone leaves the channel. The bot should leave on its own.

If background noise shows up as fake lines, or real speech gets ignored, run with `LOG_LEVEL=debug` to see which segments are dropped. Then adjust `STT_MAX_NO_SPEECH_PROB` in `.env` (lower is stricter).

## 4. Run it on a server (Docker)

Stop the local bot first, or use a different bot token on the server. The server needs Docker with the Compose plugin and outbound UDP (Discord voice).

```bash
cd ~/servers
git clone https://github.com/MHibriziF/DIVO---Discord-Voice-Companion.git divo
cd divo
cp .env.example .env
nano .env                                # same values as local
chmod 600 .env
```

### 4.1 Check the setup and the CPU speed (one-off)

The `build` stage of the image has the dev tools, so the check scripts can run there:

```bash
docker build --target build -t divo-tools .
docker run --rm --env-file .env divo-tools npm run doctor      # everything should say OK
docker run --rm divo-tools npm run bench:tts                   # how fast can this CPU speak?
```

`bench:tts` prints how long Kokoro takes compared with the length of the speech:
- **good** (under 0.5x real time): keep `KOKORO_DTYPE=fp32`, or use `q4` for extra speed.
- **usable** (0.5–1x): set `KOKORO_DTYPE=q4` in `.env`. Expect short pauses between sentences.
- **too slow** (over 1x): the server's CPU can't keep up. A hosted voice (e.g. Cloudflare Workers AI) would be needed.

### 4.2 Start it

```bash
docker compose up -d --build
docker compose logs -f                   # wait for "Text-to-speech ready" and "Logged in"
```

Run through the test checklist above. The container restarts on its own after a crash or a server reboot (`restart: unless-stopped`), and is capped at 2 GB of RAM.

Two Docker volumes keep data between rebuilds:
- `divo-data`: per-server `/voice` and `/persona` settings
- `divo-model-cache`: the voice model, so it isn't downloaded again

To look at the saved settings: `docker compose exec divo cat data/guild-settings.json`.

### Updating

```bash
cd ~/servers/divo
git pull
docker compose up -d --build
```

### Stopping

```bash
docker compose down                      # keeps the volumes (settings + model)
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Slash commands don't show up | Set `DISCORD_DEV_GUILD_ID`. Global commands can take a while to appear. |
| Bot joins but never hears anyone | It must not be server-deafened. The server/VPS firewall must allow outbound UDP. |
| Container keeps restarting | `docker compose logs` usually shows a config error, e.g. a missing key in `.env`. |
| `DecryptionFailed` errors in the logs | Known @discordjs/voice issue under DAVE encryption. `/leave` and `/join` again. |
| Groq `429` errors | Free-tier limit reached. See the quota table in [AGENTS.md](AGENTS.md#cost-and-quotas-groq-free-tier). |
