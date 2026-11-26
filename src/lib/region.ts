/**
 * Region codes come straight from FTC Scout (`eventByCode(…).regionCode`, `teamsSearch(region:)`).
 * They are mostly ISO-3166-2 style: `USMI` for Michigan, `CAON` for Ontario, `GB` for the UK.
 */

const REGION_NAMES: Record<string, string> = {
  USAL: 'Alabama',
  USAK: 'Alaska',
  USAZ: 'Arizona',
  USAR: 'Arkansas',
  USCA: 'California',
  USCALA: 'Los Angeles, CA',
  USCALS: 'San Diego, CA',
  USCANO: 'Northern California',
  USCASD: 'San Diego, CA',
  USCO: 'Colorado',
  USCT: 'Connecticut',
  USDE: 'Delaware',
  USFCT: 'Washington, DC',
  USFL: 'Florida',
  USGA: 'Georgia',
  USHI: 'Hawaii',
  USID: 'Idaho',
  USIL: 'Illinois',
  USIN: 'Indiana',
  USIA: 'Iowa',
  USKS: 'Kansas',
  USKY: 'Kentucky',
  USLA: 'Louisiana',
  USME: 'Maine',
  USMD: 'Maryland',
  USMA: 'Massachusetts',
  USMI: 'Michigan',
  USMN: 'Minnesota',
  USMS: 'Mississippi',
  USMO: 'Missouri',
  USMT: 'Montana',
  USNE: 'Nebraska',
  USNV: 'Nevada',
  USNH: 'New Hampshire',
  USNJ: 'New Jersey',
  USNM: 'New Mexico',
  USNY: 'New York',
  USNYEX: 'New York (excluding NYC)',
  USNYLI: 'Long Island, NY',
  USNYNY: 'New York City',
  USNC: 'North Carolina',
  USND: 'North Dakota',
  USOH: 'Ohio',
  USOK: 'Oklahoma',
  USOR: 'Oregon',
  USPA: 'Pennsylvania',
  USPR: 'Puerto Rico',
  USRI: 'Rhode Island',
  USSC: 'South Carolina',
  USSD: 'South Dakota',
  USTN: 'Tennessee',
  USTX: 'Texas',
  USTXCE: 'Central Texas',
  USTXHO: 'Houston, TX',
  USTXNO: 'North Texas',
  USTXSO: 'South Texas',
  USTXWP: 'West Texas',
  USUT: 'Utah',
  USVT: 'Vermont',
  USVA: 'Virginia',
  USWA: 'Washington',
  USWV: 'West Virginia',
  USWI: 'Wisconsin',
  USWY: 'Wyoming',
  CAAB: 'Alberta',
  CABC: 'British Columbia',
  CANL: 'Newfoundland and Labrador',
  CAON: 'Ontario',
  CAQC: 'Quebec',
};

/** A human label for a region code, or the code itself when it is not one we have a name for. */
export function regionLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  const key = code.trim().toUpperCase();
  if (key === '' || key === 'ALL') return null;
  return REGION_NAMES[key] ?? key;
}

/**
 * Where a value sits among a set of results, 1-based and competition style: everything strictly
 * higher is counted, so equal values share a rank — the convention FTC Scout's own ranking uses.
 */
export function rankAmong(values: readonly number[], value: number): number {
  let above = 0;
  for (const candidate of values) {
    if (candidate > value) above += 1;
  }
  return above + 1;
}
