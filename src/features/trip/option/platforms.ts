// Booking platforms recognised from a pasted link (offline, by domain).

const PLATFORMS: Array<[RegExp, string]> = [
  [/(^|\.)booking\.com$/, "Booking.com"],
  [/(^|\.)airbnb\./, "Airbnb"],
  [/(^|\.)google\.[a-z.]+$/, "Google"],
  [/(^|\.)check24\.de$/, "Check24"],
  [/(^|\.)expedia\./, "Expedia"],
  [/(^|\.)skyscanner\./, "Skyscanner"],
  [/(^|\.)kayak\./, "Kayak"],
  [/(^|\.)mietwagenbilliger\.de$/, "MietwagenBilliger.de"],
  [/(^|\.)billiger-mietwagen\.de$/, "billiger-mietwagen.de"],
  [/(^|\.)budget\./, "Budget"],
  [/(^|\.)sixt\./, "Sixt"],
  [/(^|\.)europcar\./, "Europcar"],
  [/(^|\.)getyourguide\./, "GetYourGuide"],
  [/(^|\.)viator\.com$/, "Viator"],
  [/(^|\.)hotels\.com$/, "Hotels.com"],
  [/(^|\.)vrbo\.com$/, "Vrbo"],
  [/(^|\.)flytap\.com$/, "TAP Air Portugal"],
  [/(^|\.)lufthansa\.com$/, "Lufthansa"],
  [/(^|\.)ryanair\.com$/, "Ryanair"],
  [/(^|\.)easyjet\.com$/, "easyJet"],
  [/(^|\.)eurowings\.com$/, "Eurowings"],
];

export function platformFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return PLATFORMS.find(([re]) => re.test(host))?.[1] ?? null;
  } catch {
    return null;
  }
}
