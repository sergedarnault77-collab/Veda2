import { useState } from "react";
import { loadLS, saveLS } from "../lib/persist";
import type { VedaUser } from "../lib/auth";
import { setSyncEmail, pullAll } from "../lib/sync";
import "./LoginScreen.css";

const USER_KEY = "veda.user.v1";

interface Props {
  onLogin: (user: VedaUser) => void;
  onGoToRegister: () => void;
}

export default function LoginScreen({ onLogin, onGoToRegister }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check local first
    const stored = loadLS<VedaUser | null>(USER_KEY, null);
    if (stored && stored.email === normalizedEmail) {
      onLogin(stored);
      return;
    }

    // Not found locally — try the server
    setLoading(true);
    try {
      setSyncEmail(normalizedEmail);
      const ok = await pullAll();

      if (ok) {
        const pulled = loadLS<VedaUser | null>(USER_KEY, null);
        if (pulled && pulled.email === normalizedEmail) {
          onLogin(pulled);
          return;
        }
      }

      setSyncEmail(null);
      setError("Email not recognized.");
    } catch {
      setSyncEmail(null);
      setError("Could not reach server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login">
      <div className="login__logo">Veda</div>
      <h1 className="login__title">Welcome back</h1>
      <p className="login__sub">Log in to continue tracking.</p>

      <form className="login__form" onSubmit={handleSubmit} noValidate>
        <div className="login__field">
          <label className="login__label">Email address</label>
          <input
            className="login__input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>

        <div className="login__field">
          <label className="login__label">Password</label>
          <input
            className="login__input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        {error && (
          <div className="login__error">{error}</div>
        )}

        <button type="submit" className="login__cta" disabled={loading}>
          {loading ? "Signing in…" : "Log in"}
        </button>

        <div className="login__register">
          Don't have an account?{" "}
          <button type="button" className="login__registerLink" onClick={onGoToRegister}>
            Create account
          </button>
        </div>
      </form>
    </div>
  );
}
