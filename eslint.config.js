import js from "@eslint/js";
import tseslint from "typescript-eslint";

const vendorPackages = [
  "discord.js",
  "@discordjs/*",
  "@snazzah/*",
  "groq-sdk",
  "groq-sdk/*",
  "kokoro-js",
  "prism-media",
  "pino",
  "zod",
];

const layer = (name) => ({ group: [`**/${name}/**`, `**/${name}`], message: `This layer must not depend on ${name}/.` });
const vendors = { group: vendorPackages, message: "Vendor SDKs belong in infrastructure/ (or presentation/ for discord.js)." };

export default tseslint.config(
  { ignores: ["dist/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [layer("application"), layer("infrastructure"), layer("presentation"), layer("config"), vendors] },
      ],
    },
  },
  {
    files: ["src/application/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [layer("infrastructure"), layer("presentation"), layer("config"), vendors] },
      ],
    },
  },
  {
    files: ["src/presentation/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [layer("infrastructure"), layer("config")] }],
    },
  },
  {
    files: ["src/infrastructure/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [layer("presentation")] }],
    },
  },
);
