import "server-only";
import { AppError } from "../domain";

export function appMode(): "demo" | "supabase" {
  const mode = process.env.CONVENE_MODE ?? "demo";
  if (mode !== "demo" && mode !== "supabase")
    throw new AppError(
      "configuration",
      "CONVENE_MODE must be demo or supabase.",
      503,
    );
  return mode;
}
export function required(name: string) {
  const value = process.env[name];
  if (!value)
    throw new AppError(
      "configuration",
      `Server setup is incomplete: ${name} is missing. See README.md.`,
      503,
    );
  return value;
}
