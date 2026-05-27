import AdminHeader from "./AdminHeader";
import AdminSidebar from "./AdminSidebar";

type AdminShellProps = {
  children: React.ReactNode;
  email?: string | null;
};

export default function AdminShell({ children, email }: AdminShellProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader email={email} />

      <div className="flex">
        <AdminSidebar />

        <main className="flex-1 p-6 lg:p-10">
          {children}
        </main>
      </div>
    </div>
  );
}