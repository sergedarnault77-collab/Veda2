import { useState, useCallback, useEffect } from "react";
import RegisterScreen from "./auth/RegisterScreen";
import LoginScreen from "./auth/LoginScreen";
import ProfileScreen from "./auth/ProfileScreen";
import PlanScreen from "./auth/PlanScreen";
import HomePage from "./home/HomePage";
import DashboardPage from "./dashboard/DashboardPage";
import MedicationsPage from "./meds/MedicationsPage";
import SupplementsPage from "./supps/SupplementsPage";
import PrivacyPolicy from "./legal/PrivacyPolicy";
import TermsOfService from "./legal/TermsOfService";
import { loadUser, saveUser, setPlan as persistPlan, setProfile as persistProfile } from "./lib/auth";
import type { VedaUser, Plan, BiologicalSex, AgeRange } from "./lib/auth";
import { supabase } from "./lib/supabase";
import { setSyncEmail, pullAll, pushAll } from "./lib/sync";
import { apiFetch } from "./lib/api";
import { migrateStorageImages } from "./lib/storage-migrate";
import { identify, track, reset as resetAnalytics } from "./lib/analytics";
import { initPurchases, loginUser, logoutUser, checkSubscriptionActive } from "./lib/purchases";
import "./App.css";

type AuthView = "register" | "login";
type Tab = "home" | "dashboard" | "meds" | "supps";
type LegalView = "privacy" | "terms" | null;
type Theme = "dark" | "light";

const THEME_KEY = "veda.theme";
const THEME_MIGRATED_KEY = "veda.theme.v3";

function loadTheme(): Theme {
  if (typeof window === "undefined") return "light";
  if (!localStorage.getItem(THEME_MIGRATED_KEY)) {
    localStorage.removeItem(THEME_KEY);
    localStorage.removeItem("veda.theme.v2");
    localStorage.setItem(THEME_MIGRATED_KEY, "1");
  }
  return (localStorage.getItem(THEME_KEY) as Theme) || "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export default function App() {
  const [user, setUser] = useState<VedaUser | null>(() => loadUser());
  const [authView, setAuthView] = useState<AuthView>("register");
  const [tab, setTab] = useState<Tab>("home");
  const [legalView, setLegalView] = useState<LegalView>(() => {
    const h = window.location.hash.replace("#", "");
    if (h === "privacy") return "privacy";
    if (h === "terms") return "terms";
    return null;
  });
  const [syncing, setSyncing] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => {
    const t = loadTheme();
    applyTheme(t);
    return t;
  });

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
      return next;
    });
  }, []);

  // One-time: shrink oversized images in localStorage to prevent quota errors
  useEffect(() => { migrateStorageImages(); }, []);

  // Restore Supabase session on app load / OAuth redirect
  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;

    try {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user && !user) {
          restoreFromSupabaseUser(session.user);
        }
      }).catch(() => {});

      const resp = supabase.auth.onAuthStateChange(
        (_event, session) => {
          if (session?.user && !user) {
            restoreFromSupabaseUser(session.user);
          }
        },
      );
      subscription = resp.data.subscription;
    } catch (err) {
      console.warn("[Supabase] Auth listener failed:", err);
    }

    return () => subscription?.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function restoreFromSupabaseUser(supaUser: { email?: string | null; user_metadata?: Record<string, any> }) {
    const email = supaUser.email ?? "";
    if (!email) return;

    setSyncEmail(email);
    setSyncing(true);
    pullAll().then(() => {
      const stored = loadUser();
      if (stored && stored.email === email) {
        setUser(stored);
      } else {
        const meta = supaUser.user_metadata ?? {};
        const restored: VedaUser = {
          firstName: meta.first_name || meta.full_name?.split(" ")[0] || "User",
          lastName: meta.last_name || meta.full_name?.split(" ").slice(1).join(" ") || "",
          email,
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
        saveUser(restored);
        setUser(restored);
      }
    }).finally(() => setSyncing(false));
  }

  // Set sync email whenever user changes, pull from server, init purchases
  useEffect(() => {
    if (user?.email) {
      setSyncEmail(user.email);
      setSyncing(true);
      pullAll().finally(() => setSyncing(false));

      initPurchases(user.email).then(() => {
        loginUser(user.email);
        checkSubscriptionActive().then((active) => {
          if (active && user.plan !== "ai") {
            const updated = { ...user, plan: "ai" as const };
            saveUser(updated);
            setUser(updated);
          }
        });
      });
    } else {
      setSyncEmail(null);
    }
  }, [user?.email]);

  const isRegistered = user !== null;
  const hasProfile = isRegistered && user.profileComplete === true;
  const hasPlan = isRegistered && user.plan !== null;
  const isAI = user?.plan === "ai";

  const handleRegister = useCallback((u: VedaUser) => {
    saveUser(u);
    setUser(u);
    setSyncEmail(u.email);
    pushAll();
    identify(u.email, { name: `${u.firstName} ${u.lastName}`, country: u.country });
    track("user_registered");
  }, []);

  const handleLogin = useCallback((u: VedaUser) => {
    setUser(u);
    setSyncEmail(u.email);
    identify(u.email, { name: `${u.firstName} ${u.lastName}`, country: u.country });
    track("user_logged_in");
  }, []);

  const handleProfileComplete = useCallback((profile: {
    sex: BiologicalSex | null;
    heightCm: number | null;
    weightKg: number | null;
    ageRange: AgeRange | null;
  }) => {
    persistProfile(profile);
    setUser((prev) => prev ? {
      ...prev,
      sex: profile.sex,
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      ageRange: profile.ageRange,
      profileComplete: true,
    } : prev);
  }, []);

  const handleSelectPlan = useCallback((plan: Plan) => {
    persistPlan(plan);
    setUser((prev) => prev ? { ...prev, plan } : prev);
    track("plan_selected", { plan });
    if (plan === "ai") setTab("home");
  }, []);

  const handleChangePlan = useCallback((plan: Plan) => {
    persistPlan(plan);
    setUser((prev) => prev ? { ...prev, plan } : prev);
  }, []);

  const clearLocalData = useCallback(() => {
    localStorage.removeItem("veda.user.v1");
    localStorage.removeItem("veda.supps.v1");
    localStorage.removeItem("veda.meds.v1");
    localStorage.removeItem("veda.exposure.today.v1");
    localStorage.removeItem("veda.scans.today.v1");
    localStorage.removeItem("veda.supps.taken.v1");
    localStorage.removeItem("veda.exposure.history.v1");
  }, []);

  const handleLogout = useCallback(async () => {
    track("user_logged_out");
    resetAnalytics();
    logoutUser();
    await supabase.auth.signOut().catch(() => {});
    setSyncEmail(null);
    setUser(null);
    setAuthView("login");
    clearLocalData();
  }, [clearLocalData]);

  const handleDeleteAccount = useCallback(async () => {
    const email = user?.email;
    if (!email) return;

    try {
      await apiFetch("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, action: "delete_account" }),
      });
    } catch { /* proceed with local cleanup even if server fails */ }

    await supabase.auth.signOut().catch(() => {});
    setSyncEmail(null);
    setUser(null);
    setAuthView("register");
    clearLocalData();
  }, [user?.email, clearLocalData]);

  // 0. Legal pages — accessible without login (for store review links)
  if (legalView === "privacy") {
    return <PrivacyPolicy onBack={() => { setLegalView(null); window.location.hash = ""; }} />;
  }
  if (legalView === "terms") {
    return <TermsOfService onBack={() => { setLegalView(null); window.location.hash = ""; }} />;
  }

  // 1. Not registered → show auth screen
  if (!isRegistered) {
    if (authView === "login") {
      return (
        <LoginScreen
          onLogin={handleLogin}
          onGoToRegister={() => setAuthView("register")}
        />
      );
    }
    return (
      <RegisterScreen
        onRegister={handleRegister}
        onGoToLogin={() => setAuthView("login")}
      />
    );
  }

  // 2. Registered but profile not complete → body data screen
  if (!hasProfile) {
    return (
      <ProfileScreen
        firstName={user.firstName}
        onComplete={handleProfileComplete}
      />
    );
  }

  // 3. Profile complete but no plan → forced plan selection
  if (!hasPlan) {
    return <PlanScreen onSelect={handleSelectPlan} />;
  }

  // 3. Has plan → main app (with feature gating)
  // Show brief loading overlay during initial server sync
  if (syncing) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <div className="text-3xl mb-3">Veda</div>
          <div className="text-sm opacity-70">Syncing your data…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="app-nav">
        <div className="app-nav__logo">Veda</div>
        <button data-testid="nav-scan" onClick={() => setTab("home")} className={`app-nav__btn ${tab === "home" ? "app-nav__btn--active" : ""}`}>Scan</button>
        <button onClick={() => setTab("dashboard")} className={`app-nav__btn ${tab === "dashboard" ? "app-nav__btn--active" : ""}`}>Dashboard</button>
        <button onClick={() => setTab("supps")} className={`app-nav__btn ${tab === "supps" ? "app-nav__btn--active" : ""}`}>Supps</button>
        <button onClick={() => setTab("meds")} className={`app-nav__btn ${tab === "meds" ? "app-nav__btn--active" : ""}`}>Meds</button>
      </nav>

      <div className="app-content">
        {tab === "home" && <HomePage isAI={isAI} userName={user.firstName} />}
        {tab === "dashboard" && <DashboardPage />}
        {tab === "meds" && <MedicationsPage />}
        {tab === "supps" && <SupplementsPage />}
      </div>

      {/* Account bar */}
      <AccountBar
        user={user}
        theme={theme}
        onToggleTheme={toggleTheme}
        onChangePlan={handleChangePlan}
        onUpdateUser={(updated) => { saveUser(updated); setUser(updated); }}
        onLogout={handleLogout}
        onDeleteAccount={handleDeleteAccount}
        onShowLegal={(view) => { setLegalView(view); window.location.hash = view; }}
      />
    </div>
  );
}

/* ── Account bar (small, top-right or bottom drawer) ── */

function AccountBar({
  user,
  theme,
  onToggleTheme,
  onChangePlan,
  onUpdateUser,
  onLogout,
  onDeleteAccount,
  onShowLegal,
}: {
  user: VedaUser;
  theme: Theme;
  onToggleTheme: () => void;
  onChangePlan: (plan: Plan) => void;
  onUpdateUser: (u: VedaUser) => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
  onShowLegal: (view: "privacy" | "terms") => void;
}) {
  const [open, setOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const planLabel = user.plan === "ai" ? "Veda AI" : "Freemium";
  const otherPlan: Plan = user.plan === "ai" ? "freemium" : "ai";
  const otherLabel = user.plan === "ai" ? "Freemium" : "Veda AI";

  const btnCls = "acct-btn w-full py-2.5 px-3.5 text-sm font-semibold rounded-xl border border-border bg-card text-foreground cursor-pointer mb-2 font-[inherit]";

  return (
    <>
      <button
        onClick={() => { setOpen((v) => !v); setShowProfile(false); }}
        className="fixed top-4 right-4 z-[100] w-[38px] h-[38px] rounded-full border border-border bg-gradient-to-br from-primary/20 to-primary/8 text-foreground font-bold text-sm flex items-center justify-center cursor-pointer shadow-md"
        aria-label="Account"
      >
        {user.firstName.charAt(0).toUpperCase()}
      </button>

      {open && (
        <div
          className="fixed top-[60px] right-4 z-[100] max-h-[80vh] overflow-y-auto p-5 rounded-2xl bg-card/95 border border-border shadow-xl backdrop-blur-xl"
          style={{ width: showProfile ? 310 : 260 }}
        >
          {showProfile ? (
            <ProfilePanel user={user} onSave={(u) => { onUpdateUser(u); setShowProfile(false); }} onBack={() => setShowProfile(false)} />
          ) : (
            <>
              <div className="font-bold text-[0.92rem] mb-0.5 text-foreground">
                {user.firstName} {user.lastName}
              </div>
              <div className="text-xs text-muted-foreground mb-1">
                {user.email}
              </div>
              <div className="text-xs text-muted-foreground mb-4">
                Plan: <strong>{planLabel}</strong> · {user.country}
              </div>

              <button onClick={() => setShowProfile(true)} className={btnCls}>
                My Profile
              </button>

              <button onClick={onToggleTheme} className={`${btnCls} flex items-center justify-center gap-2`}>
                {theme === "dark" ? "☀️" : "🌙"} Switch to {theme === "dark" ? "Day" : "Night"} mode
              </button>

              <button onClick={() => { onChangePlan(otherPlan); setOpen(false); }} className={btnCls}>
                Switch to {otherLabel}
              </button>

              <div className="flex gap-2 mb-2">
                <button
                  onClick={() => { onShowLegal("privacy"); setOpen(false); }}
                  className={`${btnCls} text-xs py-2 px-2.5 flex-1 !mb-0`}
                >
                  Privacy Policy
                </button>
                <button
                  onClick={() => { onShowLegal("terms"); setOpen(false); }}
                  className={`${btnCls} text-xs py-2 px-2.5 flex-1 !mb-0`}
                >
                  Terms of Service
                </button>
              </div>

              <button
                onClick={() => { onLogout(); setOpen(false); }}
                className={`${btnCls} border-destructive/20 bg-destructive/5 text-destructive`}
              >
                Log out
              </button>

              <button
                onClick={() => {
                  if (window.confirm("Delete your account and all data? This cannot be undone.")) {
                    onDeleteAccount();
                    setOpen(false);
                  }
                }}
                className={`${btnCls} border-destructive/30 bg-destructive/8 text-destructive text-xs !mb-0`}
              >
                Delete Account
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

/* ── Profile panel (inline in account dropdown) ── */

const AGE_RANGES: AgeRange[] = ["18-25", "26-35", "36-45", "46-55", "56-65", "65+"];
const SEX_OPTIONS: { value: BiologicalSex; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

function ProfilePanel({
  user,
  onSave,
  onBack,
}: {
  user: VedaUser;
  onSave: (u: VedaUser) => void;
  onBack: () => void;
}) {
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [country, setCountry] = useState(user.country);
  const [city, setCity] = useState(user.city);
  const [sex, setSex] = useState<BiologicalSex | null>(user.sex);
  const [ageRange, setAgeRange] = useState<AgeRange | null>(user.ageRange);
  const [heightCm, setHeightCm] = useState(user.heightCm?.toString() ?? "");
  const [weightKg, setWeightKg] = useState(user.weightKg?.toString() ?? "");
  const [saved, setSaved] = useState(false);

  const inputCls = "w-full py-2 px-3 text-sm font-[inherit] rounded-[10px] border border-input bg-card text-foreground outline-none";
  const labelCls = "block text-[0.68rem] font-semibold text-muted-foreground mb-0.5 uppercase tracking-wide";

  function handleSave() {
    const updated: VedaUser = {
      ...user,
      firstName: firstName.trim() || user.firstName,
      lastName: lastName.trim() || user.lastName,
      country: country.trim() || user.country,
      city: city.trim() || user.city,
      sex,
      ageRange,
      heightCm: heightCm ? Number(heightCm) : user.heightCm,
      weightKg: weightKg ? Number(weightKg) : user.weightKg,
    };
    onSave(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="bg-transparent border-none text-primary text-[0.78rem] font-semibold cursor-pointer p-0 mb-3 font-[inherit]"
      >
        ← Back
      </button>

      <div className="font-bold text-[0.88rem] mb-3.5 text-foreground">
        My Profile
      </div>

      <div className="grid grid-cols-2 gap-2 mb-0.5">
        <div className="mb-2.5">
          <label className={labelCls}>First name</label>
          <input className={inputCls} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div className="mb-2.5">
          <label className={labelCls}>Last name</label>
          <input className={inputCls} value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
      </div>

      <div className="mb-2.5">
        <label className={labelCls}>Email</label>
        <input className={`${inputCls} opacity-60 cursor-not-allowed`} value={user.email} readOnly />
      </div>

      <div className="grid grid-cols-2 gap-2 mb-0.5">
        <div className="mb-2.5">
          <label className={labelCls}>Country</label>
          <input className={inputCls} value={country} onChange={(e) => setCountry(e.target.value)} />
        </div>
        <div className="mb-2.5">
          <label className={labelCls}>City</label>
          <input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
      </div>

      <div className="mb-2.5">
        <label className={labelCls}>Sex</label>
        <select
          className={inputCls}
          value={sex ?? ""}
          onChange={(e) => setSex((e.target.value || null) as BiologicalSex | null)}
        >
          <option value="">—</option>
          {SEX_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="mb-2.5">
        <label className={labelCls}>Age range</label>
        <select
          className={inputCls}
          value={ageRange ?? ""}
          onChange={(e) => setAgeRange((e.target.value || null) as AgeRange | null)}
        >
          <option value="">—</option>
          {AGE_RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-0.5">
        <div className="mb-2.5">
          <label className={labelCls}>Height (cm)</label>
          <input className={inputCls} type="number" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
        </div>
        <div className="mb-2.5">
          <label className={labelCls}>Weight (kg)</label>
          <input className={inputCls} type="number" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
        </div>
      </div>

      <button
        onClick={handleSave}
        className="w-full py-2.5 px-3.5 text-sm font-bold rounded-xl border-none bg-gradient-to-br from-primary to-primary/70 text-primary-foreground cursor-pointer font-[inherit] mt-1"
      >
        {saved ? "✓ Saved" : "Save changes"}
      </button>
    </div>
  );
}

