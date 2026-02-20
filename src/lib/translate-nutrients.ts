/**
 * Client-side nutrient/ingredient name translation.
 * Maps common non-English names (German, Dutch, French) to English
 * so existing saved data displays correctly regardless of label language.
 */

const TRANSLATIONS: Record<string, string> = {};

function add(en: string, ...foreign: string[]) {
  for (const f of foreign) TRANSLATIONS[f.toLowerCase()] = en;
}

// German
add("Fat", "fett");
add("Saturated fat", "davon gesättigte fettsäuren", "gesättigte fettsäuren");
add("Carbohydrates", "kohlenhydrate", "kohlehydrate");
add("Sugar", "davon zucker", "zucker");
add("Protein", "eiweiß", "eiweiss");
add("Salt", "salz");
add("Fiber", "ballaststoffe");
add("Energy", "brennwert", "energie");
add("Iron", "eisen");
add("Zinc", "zink");
add("Magnesium", "magnesium");
add("Calcium", "kalzium");
add("Potassium", "kalium");
add("Phosphorus", "phosphor", "fosfor");
add("Copper", "kupfer", "koper");
add("Manganese", "mangan", "mangaan");
add("Selenium", "selen");
add("Iodine", "jod", "jodium");
add("Chromium", "chrom", "chroom");
add("Molybdenum", "molybdän", "molybdeen");
add("Folate", "folsäure", "foliumzuur");
add("Biotin", "biotine");
add("Vitamin B1 (Thiamine)", "thiamin");
add("Vitamin B2 (Riboflavin)", "riboflavin", "riboflavine");
add("Vitamin B3 (Niacin)", "niacin", "niacine");
add("Vitamin B5", "pantothensäure", "pantotheenzuur");
add("Vitamin B6", "pyridoxin");
add("Vitamin B12", "cobalamin", "cobalamine");
add("Vitamin C", "ascorbinsäure", "ascorbinezuur");
add("Vitamin D", "cholecalciferol", "colecalciferol");

// Dutch
add("Fat", "vet");
add("Saturated fat", "waarvan verzadigde vetzuren", "verzadigde vetzuren");
add("Carbohydrates", "koolhydraten");
add("Sugar", "waarvan suikers", "suikers");
add("Protein", "eiwit", "eiwitten");
add("Salt", "zout");
add("Fiber", "vezels", "voedingsvezels");
add("Energy", "energie");

// French
add("Fat", "matières grasses", "lipides");
add("Saturated fat", "dont acides gras saturés", "acides gras saturés");
add("Carbohydrates", "glucides");
add("Sugar", "dont sucres", "sucres");
add("Protein", "protéines");
add("Salt", "sel");
add("Fiber", "fibres", "fibres alimentaires");
add("Energy", "énergie", "valeur énergétique");
add("Iron", "fer");

/**
 * Translate a nutrient/ingredient name to English if a mapping exists.
 * Returns the original name if no translation is found.
 */
export function translateName(name: string): string {
  if (!name) return name;
  const key = name.toLowerCase().trim();
  return TRANSLATIONS[key] ?? name;
}
