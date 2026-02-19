import { useState } from "react";
import { supabase } from "../lib/supabase";
import { loadLS } from "../lib/persist";
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

    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      const supaUser = data.user;
      if (!supaUser) {
        setError("Login failed. Please try again.");
        return;
      }

      const normalizedEmail = supaUser.email ?? email.trim().toLowerCase();
      setSyncEmail(normalizedEmail);

      // Try to pull existing data from the server
      await pullAll();

      const stored = loadLS<VedaUser | null>(USER_KEY, null);
      if (stored && stored.email === normalizedEmail) {
        onLogin(stored);
        return;
      }

      // Build user from Supabase metadata if no server data
      const meta = supaUser.user_metadata ?? {};
      const user: VedaUser = {
        firstName: meta.first_name || meta.full_name?.split(" ")[0] || "User",
        lastName: meta.last_name || meta.full_name?.split(" ").slice(1).join(" ") || "",
        email: normalizedEmail,
        country: meta.country || "",
        city: meta.city || "",
        plan: null,
        sex: null,
        heightCm: null,
        weightKg: null,
        ageRange: null,
        profileComplete: false,
        createdAt: new Date().toISOString(),
      };
      onLogin(user);
    } catch (err: any) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSocialLogin(provider: "apple" | "google") {
    setError(null);
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (authError) setError(authError.message);
  }

  return (
    <div className="login">
      <div className="login__logo">Veda</div>
      <h1 className="login__title">Welcome back</h1>
      <p className="login__sub">Log in to continue tracking.</p>

      <div className="login__social">
        <button
          type="button"
          className="login__social-btn login__social-btn--apple"
          onClick={() => handleSocialLogin("apple")}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
          Continue with Apple
        </button>
        <button
          type="button"
          className="login__social-btn login__social-btn--google"
          onClick={() => handleSocialLogin("google")}
        >
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          Continue with Google
        </button>
      </div>

      <div className="login__divider">
        <span>or</span>
      </div>

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
