import { NextResponse } from "next/server";
import { z } from "zod";
import { appMode } from "@/lib/server/config";
import { authClient } from "@/lib/server/supabase";
import { failure, rateLimit, readBody } from "@/lib/server/http";
import { AppError } from "@/lib/domain";
const schema = z.object({
  action: z.enum(["login", "signup", "logout"]),
  email: z.email().optional(),
  password: z.string().min(8).max(128).optional(),
});
export async function POST(request: Request) {
  try {
    const input = schema.parse(await readBody(request));
    if (appMode() !== "supabase")
      throw new AppError(
        "demo_mode",
        "Accounts are available in connected mode.",
      );
    const client = await authClient();
    if (input.action === "logout") {
      const { error } = await client.auth.signOut();
      if (error)
        throw new AppError("auth", "Could not sign out. Please try again.");
      return NextResponse.json({ message: "Signed out." });
    }
    if (!input.email || !input.password)
      throw new AppError("credentials", "Enter your email and password.");
    rateLimit(`auth:${input.email.toLowerCase()}`, 8);
    const { data, error } =
      input.action === "signup"
        ? await client.auth.signUp({
            email: input.email,
            password: input.password,
          })
        : await client.auth.signInWithPassword({
            email: input.email,
            password: input.password,
          });
    if (error)
      throw new AppError(
        "auth",
        input.action === "login"
          ? "Could not sign in. Check your credentials and confirm your email."
          : "Could not create an account. Check your email and password, then try again.",
        400,
      );
    return NextResponse.json({
      signedIn: !!data.session,
      message: data.session
        ? "You're signed in."
        : "Check your email to confirm your account, then sign in here.",
    });
  } catch (error) {
    return failure(error);
  }
}
