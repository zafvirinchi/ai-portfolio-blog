export default function Footer() {
  return (
    <footer className="border-t bg-gray-50">
      <div className="mx-auto max-w-6xl px-6 py-6 text-center text-sm text-gray-600">
        © {new Date().getFullYear()} Zafrul Islam. Built with Next.js, TypeScript, Tailwind and AI.
      </div>
    </footer>
  );
}