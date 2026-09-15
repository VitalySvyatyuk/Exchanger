import type { Metadata } from "next";
import { AdminNav } from "./admin-nav";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Admin | Exchanger" },
  robots: { index: false },
};

// Access is checked in every admin page and data function (requireAdmin),
// not here: a layout doesn't re-render on navigation and doesn't stop its
// child segments from rendering.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
        <AdminNav />
      </div>
      {children}
    </div>
  );
}
