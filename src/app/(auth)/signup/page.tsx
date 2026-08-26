import { Suspense } from "react";
import Link from "next/link";
import SignupForm from "@/components/saas/SignupForm";

export default function SignupPage() {
  return (
    <section className="mx-auto max-w-md px-6 py-20">
      <h1 className="text-4xl font-bold">Create an Account</h1>

      <p className="mt-4 text-gray-600">
        Sign up to use the resume, interview prep, and recruiter tools — or create an organization if you&apos;re
        managing a team.
      </p>

      <Suspense fallback={null}>
        <SignupForm />
      </Suspense>

      <p className="mt-6 text-sm text-slate-600">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-blue-600">
          Log in
        </Link>
      </p>
    </section>
  );
}
