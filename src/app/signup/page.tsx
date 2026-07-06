import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Suspense>
        <AuthForm mode="signup" />
      </Suspense>
    </main>
  );
}
