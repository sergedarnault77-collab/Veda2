export type Market = "CH" | "US" | "DE" | "NL" | "UK" | "AE" | "SA" | "IN" | "AU" | "JP" | "GLOBAL";

export type Retailer = {
  id: string;
  name: string;
  icon: string;
  searchUrl: (query: string) => string;
  type: "pharmacy" | "marketplace" | "specialist" | "grocery";
};

export type RetailerResult = Retailer & {
  matchType: "exact" | "search";
};

function enc(s: string) {
  return encodeURIComponent(s);
}

const iherb = (label?: string): Retailer => ({
  id: `iherb-${label || "global"}`, name: "iHerb", icon: "🌿", type: "specialist",
  searchUrl: (q) => `https://www.iherb.com/search?kw=${enc(q)}`,
});

const amazonDomain = (domain: string, label?: string): Retailer => ({
  id: `amazon-${label || domain}`, name: `Amazon${label ? ` ${label}` : ""}`, icon: "📦", type: "marketplace",
  searchUrl: (q) => `https://www.amazon.${domain}/s?k=${enc(q)}`,
});

const RETAILERS: Record<Market, Retailer[]> = {
  CH: [
    { id: "galaxus", name: "Galaxus", icon: "🛍️", type: "marketplace",
      searchUrl: (q) => `https://www.galaxus.ch/search?q=${enc(q)}` },
    { id: "zurrose", name: "Zur Rose", icon: "💊", type: "pharmacy",
      searchUrl: (q) => `https://www.zurrose.ch/search?q=${enc(q)}` },
    { id: "shopapotheke-ch", name: "Shop Apotheke", icon: "💊", type: "pharmacy",
      searchUrl: (q) => `https://www.shop-apotheke.ch/search?q=${enc(q)}` },
    { id: "coop", name: "Coop Vitality", icon: "🏪", type: "grocery",
      searchUrl: (q) => `https://www.coopvitality.ch/search?q=${enc(q)}` },
  ],
  US: [
    amazonDomain("com"),
    iherb("us"),
    { id: "cvs", name: "CVS", icon: "💊", type: "pharmacy",
      searchUrl: (q) => `https://www.cvs.com/search?searchTerm=${enc(q)}` },
    { id: "walmart", name: "Walmart", icon: "🏪", type: "grocery",
      searchUrl: (q) => `https://www.walmart.com/search?q=${enc(q)}` },
  ],
  DE: [
    { id: "shopapotheke-de", name: "Shop Apotheke", icon: "💊", type: "pharmacy",
      searchUrl: (q) => `https://www.shop-apotheke.com/search?q=${enc(q)}` },
    { id: "dm", name: "DM", icon: "🏪", type: "grocery",
      searchUrl: (q) => `https://www.dm.de/search?query=${enc(q)}&searchType=product` },
    amazonDomain("de"),
    { id: "rossmann", name: "Rossmann", icon: "🏪", type: "grocery",
      searchUrl: (q) => `https://www.rossmann.de/de/search/?text=${enc(q)}` },
  ],
  NL: [
    { id: "bol", name: "Bol.com", icon: "📦", type: "marketplace",
      searchUrl: (q) => `https://www.bol.com/nl/nl/s/?searchtext=${enc(q)}` },
    { id: "holland-barrett", name: "Holland & Barrett", icon: "🌿", type: "specialist",
      searchUrl: (q) => `https://www.hollandandbarrett.nl/shop/product/search?keywords=${enc(q)}` },
    amazonDomain("nl"),
  ],
  UK: [
    amazonDomain("co.uk", "UK"),
    { id: "holland-barrett-uk", name: "Holland & Barrett", icon: "🌿", type: "specialist",
      searchUrl: (q) => `https://www.hollandandbarrett.com/shop/product/search?keywords=${enc(q)}` },
    { id: "boots", name: "Boots", icon: "💊", type: "pharmacy",
      searchUrl: (q) => `https://www.boots.com/search?q=${enc(q)}` },
  ],
  AE: [
    amazonDomain("ae", "UAE"),
    { id: "noon", name: "Noon", icon: "🛍️", type: "marketplace",
      searchUrl: (q) => `https://www.noon.com/uae-en/search/?q=${enc(q)}` },
    { id: "lifepharmacy", name: "Life Pharmacy", icon: "💊", type: "pharmacy",
      searchUrl: (q) => `https://www.lifepharmacy.com/search?q=${enc(q)}` },
    iherb("ae"),
  ],
  SA: [
    amazonDomain("sa", "Saudi"),
    { id: "noon-sa", name: "Noon", icon: "🛍️", type: "marketplace",
      searchUrl: (q) => `https://www.noon.com/saudi-en/search/?q=${enc(q)}` },
    { id: "nahdi", name: "Al Nahdi Pharmacy", icon: "💊", type: "pharmacy",
      searchUrl: (q) => `https://www.nahdionline.com/en/catalogsearch/result/?q=${enc(q)}` },
    iherb("sa"),
  ],
  IN: [
    amazonDomain("in", "India"),
    { id: "1mg", name: "1mg (Tata)", icon: "💊", type: "pharmacy",
      searchUrl: (q) => `https://www.1mg.com/search/all?name=${enc(q)}` },
    { id: "healthkart", name: "HealthKart", icon: "🌿", type: "specialist",
      searchUrl: (q) => `https://www.healthkart.com/search?q=${enc(q)}` },
    iherb("in"),
  ],
  AU: [
    amazonDomain("com.au", "Australia"),
    { id: "chemistwarehouse", name: "Chemist Warehouse", icon: "💊", type: "pharmacy",
      searchUrl: (q) => `https://www.chemistwarehouse.com.au/search?searchtext=${enc(q)}` },
    iherb("au"),
  ],
  JP: [
    amazonDomain("co.jp", "Japan"),
    { id: "rakuten", name: "Rakuten", icon: "🛍️", type: "marketplace",
      searchUrl: (q) => `https://search.rakuten.co.jp/search/mall/${enc(q)}/` },
    iherb("jp"),
  ],
  GLOBAL: [
    amazonDomain("com", ""),
    iherb("global"),
    { id: "vitacost", name: "Vitacost", icon: "🌿", type: "specialist",
      searchUrl: (q) => `https://www.vitacost.com/search?t=${enc(q)}` },
  ],
};

const COUNTRY_TO_MARKET: Record<string, Market> = {
  // Europe
  Switzerland: "CH", CH: "CH", Schweiz: "CH", Suisse: "CH",
  Germany: "DE", DE: "DE", Deutschland: "DE",
  Austria: "DE", AT: "DE", Österreich: "DE",
  Netherlands: "NL", NL: "NL", "The Netherlands": "NL", Holland: "NL",
  "United Kingdom": "UK", UK: "UK", GB: "UK", England: "UK",
  // Americas
  "United States": "US", US: "US", USA: "US",
  // Middle East
  "United Arab Emirates": "AE", UAE: "AE", AE: "AE", Dubai: "AE",
  "Saudi Arabia": "SA", SA: "SA", KSA: "SA",
  Qatar: "AE", QA: "AE", Bahrain: "AE", BH: "AE",
  Kuwait: "AE", KW: "AE", Oman: "AE", OM: "AE",
  // Asia-Pacific
  India: "IN", IN: "IN",
  Australia: "AU", AU: "AU",
  "New Zealand": "AU", NZ: "AU",
  Japan: "JP", JP: "JP",
};

export function detectMarket(country: string | undefined | null): Market {
  if (!country) return "GLOBAL";
  const trimmed = country.trim();
  return COUNTRY_TO_MARKET[trimmed]
    ?? COUNTRY_TO_MARKET[trimmed.toUpperCase()]
    ?? "GLOBAL";
}

export function getRetailersForMarket(market: Market): Retailer[] {
  return RETAILERS[market] ?? RETAILERS.GLOBAL;
}

export function getMarketLabel(market: Market): string {
  const labels: Record<Market, string> = {
    CH: "Switzerland", US: "United States", DE: "Germany",
    NL: "Netherlands", UK: "United Kingdom",
    AE: "UAE", SA: "Saudi Arabia", IN: "India",
    AU: "Australia", JP: "Japan", GLOBAL: "International",
  };
  return labels[market] ?? "International";
}

export function buildSearchQuery(
  productName: string,
  brand?: string | null,
): string {
  const parts: string[] = [];
  if (brand) parts.push(brand);
  parts.push(productName);
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 120);
}
