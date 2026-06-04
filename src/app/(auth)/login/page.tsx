"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { signIn, useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const GENERIC_ERROR = "Неверный email или пароль";
const FUNNEL = ["Запросы", "Направления", "Отчётность"] as const;

const fieldClass =
  "w-full rounded-md border border-border bg-surface-inset px-3 py-2.5 text-sm text-text " +
  "placeholder:text-text-tertiary outline-none transition-[border-color,box-shadow] " +
  "focus-visible:border-accent focus-visible:[box-shadow:var(--ring-focus)]";

export default function LoginPage() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = useSession();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  // Already signed in → skip the form.
  React.useEffect(() => {
    if (!sessionPending && session) {
      router.replace("/dashboard");
    }
  }, [session, sessionPending, router]);

  const handleSubmit = React.useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);
      setPending(true);
      try {
        const { error: signInError } = await signIn.email({ email, password });
        if (signInError) {
          // Never surface the raw auth error — one calm, non-enumerating message.
          setError(GENERIC_ERROR);
          setPending(false);
          return;
        }
        router.push("/dashboard");
        router.refresh();
      } catch {
        setError(GENERIC_ERROR);
        setPending(false);
      }
    },
    [email, password, router],
  );

  return (
    <div className="relative grid min-h-dvh md:grid-cols-[1.1fr_1fr]">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      {/* ── Brand panel (editorial; desktop only) ── */}
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-surface-1 p-12 md:flex">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="size-5 rounded-sm bg-accent" />
          <span className="text-sm font-semibold tracking-tight text-text">SimpleCargo</span>
        </div>

        <div>
          <h1 className="text-display font-bold leading-tight tracking-tight text-text">
            Учёт вагонных
            <br />
            перевозок
          </h1>
          <p className="mt-4 max-w-sm text-sm text-text-secondary">
            Запросы, направления и маржинальность — в одном конвейере.
          </p>
        </div>

        {/* The funnel as a quiet brand motif. */}
        <div className="flex items-center gap-2 text-2xs uppercase tracking-[0.06em] text-text-tertiary">
          {FUNNEL.map((stage, i) => (
            <React.Fragment key={stage}>
              <span>{stage}</span>
              {i < FUNNEL.length - 1 && <span aria-hidden className="text-accent-text">→</span>}
            </React.Fragment>
          ))}
        </div>
      </aside>

      {/* ── Form panel ── */}
      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 md:hidden">
            <span aria-hidden className="size-5 rounded-sm bg-accent" />
            <span className="text-sm font-semibold tracking-tight text-text">SimpleCargo</span>
          </div>

          <p className="label-caps">Вход</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-text">
            Войдите в аккаунт
          </h2>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-text-secondary">
                Email
              </label>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={pending}
                className={fieldClass}
                placeholder="operator@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-text-secondary">
                Пароль
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={pending}
                className={fieldClass}
                placeholder="••••••••••"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Вход…" : "Войти"}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
