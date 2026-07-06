import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-5xl font-bold tracking-tight">drawme</h1>
      <p className="max-w-md text-center text-lg text-zinc-600">
        A whiteboard powered by Excalidraw — your drawings saved to the cloud,
        with installable shape libraries for AWS &amp; cloud architecture.
      </p>
      <div className="flex gap-4">
        <Link
          href="/signup"
          className="rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-700"
        >
          Get started
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-zinc-300 px-6 py-3 font-medium hover:bg-zinc-50"
        >
          Log in
        </Link>
      </div>
      <p className="mt-8 text-xs text-zinc-400">
        Canvas by{" "}
        <a
          href="https://github.com/excalidraw/excalidraw"
          className="underline"
        >
          Excalidraw
        </a>{" "}
        (MIT license)
      </p>
    </main>
  );
}
