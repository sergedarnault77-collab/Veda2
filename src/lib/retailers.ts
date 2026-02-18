export type Market = "CH" | "US" | "DE" | "NL" | "EU";

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
    { id: "amazon-us", name: "Amazon", icon: "📦", type: "marketplace",
      searchUrl: (q) => `https://www.amazon.com/s?k=${enc(q)}` },
    { id: "iherb", name: "iHerb", icon: "🌿", type: "specialist",
      searchUrl: (q) => `https://www.iherb.com/search?kw=${enc(q)}` },
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
    { id: "amazon-de", name: "Amazon.de", icon: "📦", type: "marketplace",
      searchUrl: (q) => `https://www.amazon.de/s?k=${enc(q)}` },
    { id: "rossmann", name: "Rossmann", icon: "🏪", type: "grocery",
      searchUrl: (q) => `https://www.rossmann.de/de/search/?text=${enc(q)}` },
  ],
  NL: [
    { id: "bol", name: "Bol.com", icon: "📦", type: "marketplace",
      searchUrl: (q) => `https://www.bol.com/nl/nl/s/?searchtext=${enc(q)}` },
    { id: "holland-barrett", name: "Holland & Barrett", icon: "🌿", type: "specialist",
      searchUrl: (q) => `https://www.hollandandbarrett.nl/shop/product/search?keywords=${enc(q)}` },
    { id: "amazon-nl", name: "Amazon.nl", icon: "📦", type: "marketplace",
      searchUrl: (q) => `https://www.amazon.nl/s?k=${enc(q)}` },
  ],
  EU: [
    { id: "amazon-eu", name: "Amazon", icon: "📦", type: "marketplace",
      searchUrl: (q) => `https://www.amazon.de/s?k=${enc(q)}` },
    { id: "iherb-eu", name: "iHerb", icon: "🌿", type: "specialist",
      searchUrl: (q) => `https://www.iherb.com/search?kw=${enc(q)}` },
    { id: "shopapotheke-eu", name: "Shop Apotheke", icon: "💊", type: "pharmacy",
      searchUrl: (q) => `https://www.shop-apotheke.com/search?q=${enc(q)}` },
  ],
};

function enc(s: string) {
  return encodeURIComponent(s);
}

const COUNTRY_TO_MARKET: Record<string, Market> = {
  Switzerland: "CH", CH: "CH", Schweiz: "CH", Suisse: "CH",
  "United States": "US", US: "US", USA: "US",
  Germany: "DE", DE: "DE", Deutschland: "DE",
  Netherlands: "NL", NL: "NL", "The Netherlands": "NL",
  Austria: "DE", AT: "DE",
  Belgium: "EU", BE: "EU",
  France: "EU", FR: "EU",
  Italy: "EU", IT: "EU",
  Spain: "EU", ES: "EU",
  Portugal: "EU", PT: "EU",
  UK: "EU", "United Kingdom": "EU", GB: "EU",
};

export function detectMarket(country: string | undefined | null): Market {
  if (!country) return "EU";
  const trimmed = country.trim();
  return COUNTRY_TO_MARKET[trimmed] ?? COUNTRY_TO_MARKET[trimmed.toUpperCase()] ?? "EU";
}

export function getRetailersForMarket(market: Market): Retailer[] {
  return RETAILERS[market] ?? RETAILERS.EU;
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
