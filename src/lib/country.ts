// Countries: two-letter codes (ISO 3166), a flag for each in public/flags/<CODE>.svg.

/** Every country we have a flag for. */
export const COUNTRIES =
  "AC AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU IC ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TA TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW".split(
    " ",
  );
const KNOWN = new Set(COUNTRIES);

export const isCountry = (v: unknown): v is string => typeof v === "string" && KNOWN.has(v);

let names: Intl.DisplayNames | null = null;
/** "IN" -> "India" (in English). */
export function countryName(cc: string) {
  try {
    names ||= new Intl.DisplayNames(["en"], { type: "region" });
    return names.of(cc) || cc;
  } catch {
    return cc;
  }
}

export const flagUrl = (cc: string) => `/flags/${cc}.svg`;

/** Countries sorted by name, for a picker. */
export function countriesByName() {
  return COUNTRIES.map((cc) => ({ cc, name: countryName(cc) })).sort((a, b) => a.name.localeCompare(b.name));
}

// The phone's time zone says the most about where someone is (a phone in India is often set to US English).
const ZONES: Record<string, string> = {
  "Asia/Kolkata": "IN", "Asia/Calcutta": "IN", "Asia/Dhaka": "BD", "Asia/Karachi": "PK", "Asia/Kathmandu": "NP", "Asia/Katmandu": "NP",
  "Asia/Colombo": "LK", "Asia/Thimphu": "BT", "Indian/Maldives": "MV", "Asia/Kabul": "AF", "Asia/Dubai": "AE", "Asia/Riyadh": "SA",
  "Asia/Qatar": "QA", "Asia/Kuwait": "KW", "Asia/Bahrain": "BH", "Asia/Muscat": "OM", "Asia/Tehran": "IR", "Asia/Baghdad": "IQ",
  "Asia/Jerusalem": "IL", "Asia/Amman": "JO", "Asia/Beirut": "LB", "Europe/Istanbul": "TR", "Asia/Singapore": "SG",
  "Asia/Kuala_Lumpur": "MY", "Asia/Jakarta": "ID", "Asia/Manila": "PH", "Asia/Bangkok": "TH", "Asia/Ho_Chi_Minh": "VN",
  "Asia/Yangon": "MM", "Asia/Shanghai": "CN", "Asia/Hong_Kong": "HK", "Asia/Taipei": "TW", "Asia/Tokyo": "JP", "Asia/Seoul": "KR",
  "Europe/London": "GB", "Europe/Dublin": "IE", "Europe/Paris": "FR", "Europe/Berlin": "DE", "Europe/Madrid": "ES", "Europe/Rome": "IT",
  "Europe/Amsterdam": "NL", "Europe/Brussels": "BE", "Europe/Zurich": "CH", "Europe/Vienna": "AT", "Europe/Stockholm": "SE",
  "Europe/Oslo": "NO", "Europe/Copenhagen": "DK", "Europe/Helsinki": "FI", "Europe/Warsaw": "PL", "Europe/Prague": "CZ",
  "Europe/Lisbon": "PT", "Europe/Athens": "GR", "Europe/Moscow": "RU", "Europe/Kiev": "UA", "Europe/Kyiv": "UA",
  "Africa/Lagos": "NG", "Africa/Nairobi": "KE", "Africa/Johannesburg": "ZA", "Africa/Cairo": "EG", "Africa/Accra": "GH",
  "Africa/Casablanca": "MA", "Africa/Addis_Ababa": "ET", "Africa/Kampala": "UG", "Africa/Dar_es_Salaam": "TZ",
  "America/Toronto": "CA", "America/Vancouver": "CA", "America/Sao_Paulo": "BR", "America/Mexico_City": "MX",
  "America/Argentina/Buenos_Aires": "AR", "America/Bogota": "CO", "America/Lima": "PE", "America/Santiago": "CL",
  "Australia/Sydney": "AU", "Australia/Melbourne": "AU", "Australia/Perth": "AU", "Australia/Brisbane": "AU", "Pacific/Auckland": "NZ",
  "Pacific/Fiji": "FJ",
};

/** Best guess of where this player is: time zone, then the language's region. "" if unknown. */
export function detectCountry(): string {
  if (typeof window === "undefined") return "";
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (ZONES[tz]) return ZONES[tz];
    if (/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Indiana|Kentucky|Boise)/.test(tz) || tz.startsWith("Pacific/Honolulu")) return "US";
  } catch {
    /* no time zone */
  }
  for (const lang of navigator.languages || [navigator.language]) {
    const region = /[-_]([A-Z]{2})\b/i.exec(lang || "")?.[1]?.toUpperCase();
    if (region && KNOWN.has(region)) return region;
  }
  return "";
}
