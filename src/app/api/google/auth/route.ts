import { NextResponse } from "next/server";
import { authUrl } from "@/lib/email/gmail";

// Redirect the user to Google's consent screen.
export async function GET() {
  try {
    return NextResponse.redirect(authUrl());
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
