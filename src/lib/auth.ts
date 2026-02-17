import { loadLS, saveLS } from "./persist";

export type Plan = "freemium" | "ai";
export type BiologicalSex = "male" | "female" | "prefer_not_to_say";
export type AgeRange = "18-25" | "26-35" | "36-45" | "46-55" | "56-65" | "65+";

export interface VedaUser {
  firstName: string;
  lastName: string;
  email: string;
  country: string;
  city: string;
  plan: Plan | null;
  sex: BiologicalSex | null;
  heightCm: number | null;
  weightKg: number | null;
  ageRange: AgeRange | null;
  profileComplete: boolean;
  createdAt: string;
}

const USER_KEY = "veda.user.v1";

export function loadUser(): VedaUser | null {
  return loadLS<VedaUser | null>(USER_KEY, null);
}

export function saveUser(user: VedaUser): void {
  saveLS(USER_KEY, user);
}

export function isRegistered(): boolean {
  return loadUser() !== null;
}

export function hasPlan(): boolean {
  const u = loadUser();
  return u !== null && u.plan !== null;
}

export function getPlan(): Plan | null {
  return loadUser()?.plan ?? null;
}

export function isAIPlan(): boolean {
  return getPlan() === "ai";
}

export function setPlan(plan: Plan): void {
  const u = loadUser();
  if (!u) return;
  saveUser({ ...u, plan });
}

export function setProfile(profile: {
  sex: BiologicalSex | null;
  heightCm: number | null;
  weightKg: number | null;
  ageRange: AgeRange | null;
}): void {
  const u = loadUser();
  if (!u) return;
  saveUser({
    ...u,
    sex: profile.sex,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    ageRange: profile.ageRange,
    profileComplete: true,
  });
}
