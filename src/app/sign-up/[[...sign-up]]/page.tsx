import { SignUp } from "@clerk/nextjs";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <SignUp />
    </div>
  );
}
