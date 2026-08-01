import Logo from "./Logo";

export default function Footer() {
  return (
    <footer className="border-t bg-gray-50">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-6 py-8 text-center">
        <Logo />

        <p className="text-sm text-gray-600">
          © {new Date().getFullYear()} Zafrul TechStack. Built with Next.js, TypeScript, Tailwind and AI.
        </p>
      </div>
    </footer>
  );
}
