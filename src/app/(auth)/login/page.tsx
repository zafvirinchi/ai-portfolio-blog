import { Suspense } from "react";
import Link from "next/link";
import LoginForm from "@/components/saas/LoginForm";

export default function LoginPage() {
  return (
    <section className="mx-auto max-w-md px-6 py-20">
      <h1 className="text-4xl font-bold">Log In</h1>

      <p className="mt-4 text-gray-600">
        Log in to manage your organizations, workspaces, and team.
      </p>

      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>

      <p className="mt-6 text-sm text-slate-600">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-semibold text-blue-600">
          Sign up
        </Link>
      </p>
    </section>
  );
}
