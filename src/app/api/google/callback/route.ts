import { NextResponse } from "next/server";
import { saveTokenFromCode } from "@/lib/email/gmail";

// OAuth redirect target — exchanges the code for a refresh token and stores it,
// then bounces back to the mail page.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/mail?connected=0&error=${encodeURIComponent(error)}`, url.origin));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/mail?connected=0&error=no_code", url.origin));
  }

  try {
    const account = await saveTokenFromCode(code);
    return NextResponse.redirect(
      new URL(`/mail?connected=1&account=${encodeURIComponent(account)}`, url.origin),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.redirect(
      new URL(`/mail?connected=0&error=${encodeURIComponent(message)}`, url.origin),
    );
  }
}
