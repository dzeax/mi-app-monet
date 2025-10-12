// app/(auth)/layout.tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  // Layout limpio: no header/footer, sin contenedores que limiten ancho
  return <div className="min-h-svh">{children}</div>;
}
