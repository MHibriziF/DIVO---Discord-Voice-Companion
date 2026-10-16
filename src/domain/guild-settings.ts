export const VOICE_GENDERS = ["female", "male"] as const;
export type VoiceGender = (typeof VOICE_GENDERS)[number];

export const MAX_PERSONA_LENGTH = 1000;

/** Per-server choices made with slash commands. */
export interface GuildSettings {
  readonly voice: VoiceGender;
  /** Personality description added to the system prompt; undefined uses the default. */
  readonly persona: string | undefined;
}

/** Only the values a server changed; anything missing falls back to the defaults. */
export type GuildSettingsOverrides = Partial<GuildSettings>;

export class InvalidPersonaError extends Error {}

export function isVoiceGender(value: string): value is VoiceGender {
  return (VOICE_GENDERS as readonly string[]).includes(value);
}

export function normalizePersona(text: string): string {
  const persona = text.replace(/\s+/g, " ").trim();
  if (!persona) throw new InvalidPersonaError("The persona can't be empty.");
  if (persona.length > MAX_PERSONA_LENGTH) {
    throw new InvalidPersonaError(`The persona must be at most ${MAX_PERSONA_LENGTH} characters.`);
  }
  return persona;
}
