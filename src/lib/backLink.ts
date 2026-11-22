export interface BackLink {
  href: string;
  label: string;
}

/** Longest label we render before the CSS trims it anyway. */
const MAX_LABEL = 40;

/**
 * Reads the optional `?back=<url>&backLabel=<text>` pair a host page can pass in.
 * Only http(s) targets are accepted: a `javascript:` URL in the query would otherwise
 * become an XSS hole, and this button is meant to return to the site that linked here.
 */
export function backLinkFrom(search: string, base = 'https://example.invalid/'): BackLink | null {
  // Links copied out of an HTML attribute arrive with `&amp;` between parameters: a browser
  // decodes that while parsing markup, but not when the URL is pasted or fetched directly.
  // Without this the label is silently lost, because `amp;backLabel` is not a known key.
  const params = new URLSearchParams(search.replace(/&amp;/gi, '&'));
  const raw = params.get('back')?.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const label = params.get('backLabel')?.trim().slice(0, MAX_LABEL);
  return { href: url.toString(), label: label || 'Back' };
}
