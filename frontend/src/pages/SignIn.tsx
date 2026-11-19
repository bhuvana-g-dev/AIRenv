import { motion } from "motion/react";
import { useState } from "react";
import { Aurora, Logo, ParticleField } from "../components/effects";
import { Button, Field } from "../components/ui";
import { signInWithEmail, signInWithGoogle } from "../lib/auth";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [create, setCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message.replace("Firebase: ", ""));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-bg px-4">
      <Aurora />
      <ParticleField density={0.7} />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-strong relative w-full max-w-sm rounded-3xl p-7">
        <Logo />
        <h1 className="mt-6 font-display text-xl font-semibold">{create ? "Create your account" : "Sign in"}</h1>
        <p className="mt-1 text-sm text-muted">Secure sign-in with Firebase Authentication.</p>
        <Button className="mt-5 w-full" variant="outline" loading={busy} onClick={() => run(signInWithGoogle)}>
          Continue with Google
        </Button>
        <div className="my-4 flex items-center gap-3 text-[11px] text-faint">
          <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
        </div>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => signInWithEmail(email, password, create));
          }}
        >
          <Field label="Email">
            <input type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </Field>
          <Field label="Password">
            <input type="password" required minLength={8} className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={create ? "new-password" : "current-password"} />
          </Field>
          {error && <p className="text-xs text-orange-300">{error}</p>}
          <Button type="submit" className="w-full" loading={busy}>
            {create ? "Create account" : "Sign in"}
          </Button>
        </form>
        <button onClick={() => setCreate(!create)} className="mt-4 w-full text-center text-xs text-muted hover:text-ink">
          {create ? "Already have an account? Sign in" : "New to AIRenv? Create an account"}
        </button>
      </motion.div>
    </div>
  );
}
