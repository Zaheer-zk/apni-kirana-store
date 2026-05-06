import Sidebar from '@/components/Sidebar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Fixed sidebar */}
      <Sidebar />

      {/* Main content — offset by sidebar width */}
      <main className="ml-60 flex-1 overflow-x-hidden">
        <div className="px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
