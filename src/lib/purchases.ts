/**
 * In-app purchases via RevenueCat.
 *
 * Works on iOS/Android (via Capacitor native bridge).
 * On web, all purchase functions gracefully return null/false
 * so the app can fall back to free plan selection.
 *
 * Setup:
 *   1. Create a RevenueCat account at https://app.revenuecat.com
 *   2. Create an app for iOS and/or Android
 *   3. Set up products in App Store Connect / Google Play Console
 *   4. Configure offerings in RevenueCat dashboard
 *   5. Set env vars: VITE_REVENUECAT_APPLE_KEY, VITE_REVENUECAT_GOOGLE_KEY
 */

import { Capacitor } from "@capacitor/core";

type RCPurchases = typeof import("@revenuecat/purchases-capacitor").Purchases;
let Purchases: RCPurchases | null = null;

const appleKey = import.meta.env.VITE_REVENUECAT_APPLE_KEY as string | undefined;
const googleKey = import.meta.env.VITE_REVENUECAT_GOOGLE_KEY as string | undefined;

let initialized = false;

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export async function initPurchases(userId?: string): Promise<void> {
  if (initialized || !isNativePlatform()) return;

  const platform = Capacitor.getPlatform();
  const apiKey = platform === "ios" ? appleKey : googleKey;
  if (!apiKey) return;

  try {
    const mod = await import("@revenuecat/purchases-capacitor");
    Purchases = mod.Purchases;

    await Purchases.configure({
      apiKey,
      appUserID: userId || undefined,
    });

    initialized = true;
  } catch (err) {
    console.warn("[purchases] RevenueCat init failed:", err);
  }
}

export async function loginUser(userId: string): Promise<void> {
  if (!Purchases || !initialized) return;
  try {
    await Purchases.logIn({ appUserID: userId });
  } catch (err) {
    console.warn("[purchases] logIn failed:", err);
  }
}

export async function logoutUser(): Promise<void> {
  if (!Purchases || !initialized) return;
  try {
    await Purchases.logOut();
  } catch (err) {
    console.warn("[purchases] logOut failed:", err);
  }
}

export type VedaOffering = {
  id: string;
  title: string;
  description: string;
  priceString: string;
  identifier: string;
};

export async function getOfferings(): Promise<VedaOffering[]> {
  if (!Purchases || !initialized) return [];

  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings?.current;
    if (!current?.availablePackages) return [];

    return current.availablePackages.map((pkg: any) => ({
      id: pkg.identifier as string,
      title: (pkg.product?.title || "Veda AI") as string,
      description: (pkg.product?.description || "Full AI-powered insights") as string,
      priceString: (pkg.product?.priceString || "") as string,
      identifier: pkg.identifier as string,
    }));
  } catch (err) {
    console.warn("[purchases] getOfferings failed:", err);
    return [];
  }
}

export type PurchaseResult = {
  success: boolean;
  isActive: boolean;
  error?: string;
};

export async function purchasePackage(packageId: string): Promise<PurchaseResult> {
  if (!Purchases || !initialized) {
    return { success: false, isActive: false, error: "Purchases not available" };
  }

  try {
    const offerings = await Purchases.getOfferings();
    const pkg = offerings?.current?.availablePackages?.find((p: any) => p.identifier === packageId);
    if (!pkg) {
      return { success: false, isActive: false, error: "Package not found" };
    }

    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    const isActive = Object.keys(customerInfo.entitlements.active).length > 0;

    return { success: true, isActive };
  } catch (err: any) {
    if (err?.userCancelled) {
      return { success: false, isActive: false, error: "cancelled" };
    }
    console.warn("[purchases] purchase failed:", err);
    return { success: false, isActive: false, error: err?.message || "Purchase failed" };
  }
}

export async function restorePurchases(): Promise<boolean> {
  if (!Purchases || !initialized) return false;

  try {
    const { customerInfo } = await Purchases.restorePurchases();
    return Object.keys(customerInfo.entitlements.active).length > 0;
  } catch (err) {
    console.warn("[purchases] restore failed:", err);
    return false;
  }
}

export async function checkSubscriptionActive(): Promise<boolean> {
  if (!Purchases || !initialized) return false;

  try {
    const { customerInfo } = await Purchases.getCustomerInfo();
    return Object.keys(customerInfo.entitlements.active).length > 0;
  } catch (err) {
    console.warn("[purchases] getCustomerInfo failed:", err);
    return false;
  }
}
