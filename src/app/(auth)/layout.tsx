import { LogoMark } from '@/features/brand/Logo'

/** The welcome layout from mockups/01-welcome.html, drawn in Sage & Linen. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen md:grid md:grid-cols-[1.1fr_1fr]">
      <section className="relative min-h-[300px] overflow-hidden bg-soft px-6 pt-16 pb-10 md:min-h-screen md:px-16 md:pt-24">
        <div
          aria-hidden="true"
          className="absolute -top-2 -right-8 size-[150px] rounded-full bg-surface/80 md:-top-10 md:-right-16 md:size-[280px]"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-[190px] -left-[120px] h-[260px] w-[420px] rounded-full bg-sage/60 md:-bottom-[320px] md:-left-[200px] md:h-[420px] md:w-[700px]"
        />
        <div
          aria-hidden="true"
          className="absolute -right-[120px] -bottom-[200px] h-[240px] w-[380px] rounded-full bg-sage/90 md:-right-[200px] md:-bottom-[330px] md:h-[400px] md:w-[640px]"
        />
        <div className="relative">
          <LogoMark className="mb-3 size-12 text-sage-deep" />
          <h1 className="text-[40px] leading-none md:text-[56px]">Convene</h1>
          <p className="mt-2 text-[17px] text-ink">
            You give Convene time.
            <br />
            Convene turns it into plans.
          </p>
        </div>
      </section>
      <main className="mx-auto w-full max-w-md px-6 py-8 md:flex md:flex-col md:justify-center md:px-10">
        {children}
      </main>
    </div>
  )
}
