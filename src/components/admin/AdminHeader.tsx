import Link from "next/link";

type AdminHeaderProps = {
  email?: string | null;
};

export default function AdminHeader({ email }: AdminHeaderProps) {
  return (
    <header className="border-b bg-white">
      <div className="flex h-16 items-center justify-between px-6">
        <div>
          <h1 className="text-lg font-bold">Admin Panel</h1>
          <p className="text-xs text-gray-500">Manage your portfolio content</p>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-600">{email}</span>

          <Link href="/" className="text-blue-600 hover:underline">
            Website
          </Link>

          <form action="/auth/signout" method="post">
            <button className="rounded-lg border px-4 py-2 hover:bg-gray-50">
              Logout
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}