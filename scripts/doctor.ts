import { generateDependencyReport } from "@discordjs/voice";
import { Client, GatewayIntentBits } from "discord.js";
import Groq from "groq-sdk";
import { loadConfig } from "../src/config/env.js";

const config = loadConfig(process.env);
console.log(generateDependencyReport());

const groq = new Groq({ apiKey: config.groq.apiKey });
const models = (await groq.models.list()).data.map((model) => model.id);
for (const model of [config.groq.sttModel, config.groq.llmModel]) {
  console.log(`${models.includes(model) ? "OK     " : "MISSING"} Groq model ${model}`);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const ready = new Promise<void>((resolve) => client.once("clientReady", () => resolve()));
await client.login(config.discord.token);
await ready;
console.log(`OK      Discord login as ${client.user?.tag}, in ${client.guilds.cache.size} server(s)`);
await client.destroy();
