import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Public routes that must NOT require sign-in:
// - sign-in / sign-up pages
// - /share/[token] read-only public pages
// - /api/cron/fetch-mail (protected separately by CRON_SECRET)
// - /api/google/* OAuth (browser carries the Clerk session; callback is reached
//   after consent — kept public so the redirect always lands)
const isPublic = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/share/(.*)",
  "/api/cron/(.*)",
  // 配信停止は提携先（未ログインの社外）がアクセスするため公開。
  "/unsubscribe/(.*)",
  "/api/unsubscribe/(.*)",
]);

// Auth is only enforced when Clerk keys are present (production). Locally,
// without keys, the app runs unauthenticated so dev keeps working.
const authEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default authEnabled
  ? clerkMiddleware(async (auth, req) => {
      if (!isPublic(req)) await auth.protect();
    })
  : () => NextResponse.next();

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
