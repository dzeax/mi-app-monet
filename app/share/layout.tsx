export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-none px-2 md:px-3 lg:px-4 py-6">
      {children}
    </main>
  );
}
