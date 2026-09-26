export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-10">
      <h1 className="mb-1 text-2xl font-semibold">Convene</h1>
      <p className="mb-6 text-sm text-stone-600">
        You give Convene time. Convene turns it into plans.
      </p>
      {children}
    </main>
  )
}
