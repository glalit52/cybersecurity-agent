import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { isDemoMode, supabase } from "@/lib/supabase";

// Live mode reads RLS-scoped data and calls dashboard-api with the signed-in
// user's own session JWT, so there has to be a way to sign in. Demo mode has
// no backend and skips this entirely.
export function AuthGate({ children }: { children: ReactNode }) {
  const [checking, setChecking] = useState(!isDemoMode);
  const [signedIn, setSignedIn] = useState(isDemoMode);

  useEffect(() => {
    if (isDemoMode || !supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (checking) return null;
  return signedIn ? <>{children}</> : <SignIn />;
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: signInError } = await supabase!.auth.signInWithPassword({ email, password });
    if (signInError) setError(signInError.message);
    setLoading(false);
  }

  const inputClass =
    "h-9 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text)] focus-visible:outline-none focus-visible:ring-2";

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: "var(--bg)" }}>
      <Card className="w-full max-w-sm">
        <CardContent className="pt-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
              <ShieldCheck size={20} />
            </div>
            <div>
              <p className="font-semibold" style={{ color: "var(--text)" }}>Enterprise Trust Agent</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Sign in to continue</p>
            </div>
          </div>
          <form onSubmit={onSubmit} className="space-y-3">
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
            <input
              type="password"
              required
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
            {error && (
              <p className="text-xs" role="alert" style={{ color: "var(--color-danger)" }}>
                {error}
              </p>
            )}
            <Button type="submit" loading={loading} className="w-full">
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
