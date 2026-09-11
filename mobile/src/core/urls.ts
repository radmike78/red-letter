/**
 * Link safety.
 *
 * A calendar imports .ics files from strangers, and the classic attack is a
 * plausible-looking event carrying a phishing link. This module finds links in
 * entry text and judges them, entirely offline.
 *
 * It deliberately does NOT check links against a reputation service. Doing so
 * would mean sending the user's private calendar URLs — the booking, the
 * patient portal, the interview invitation — to a third party, which is exactly
 * the exfiltration this app is built to make impossible. It would also require
 * network access the app does not have and does not want. The browser the link
 * eventually opens in already runs Safe Browsing; that check belongs there,
 * where it costs the user nothing.
 *
 * What this does instead is the part a reputation list is bad at: spotting a
 * link that is *structurally deceptive* — one pretending to be somewhere it is
 * not. That works on a brand-new domain that no blocklist has seen yet.
 */

export type Severity = 'high' | 'low';

export interface UrlFinding {
  code: string;
  /** Plain language, aimed at the person deciding whether to tap. */
  message: string;
  severity: Severity;
}

export type UrlVerdict = 'blocked' | 'suspicious' | 'ok';

export interface AnalyzedUrl {
  /** Exactly as it appeared in the text. */
  raw: string;
  scheme: string;
  /** Host as written. Empty for schemes with no authority, such as mailto. */
  host: string;
  verdict: UrlVerdict;
  findings: UrlFinding[];
  /** False for anything the app will refuse to hand to the OS. */
  openable: boolean;
}

/**
 * Schemes the app will hand to the OS. Everything else is refused.
 *
 * An allowlist rather than a blocklist: `javascript:`, `data:`, `file:`,
 * `content:` and Android's `intent:` are the obvious dangers, but the set of
 * scheme handlers on a phone is open-ended — every installed app can register
 * one — so naming what is permitted is the only version that stays correct.
 */
const OPENABLE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);

/** Flagged by name so the reason given to the user can be specific. */
const DANGEROUS_SCHEMES = new Set([
  'javascript',
  'data',
  'file',
  'content',
  'intent',
  'blob',
  'vbscript',
  'jar',
  'about',
  'chrome',
  'app-settings',
]);

/**
 * Shorteners hide their destination, so the user cannot judge the link and
 * neither can this module. Not evil, but not inspectable either.
 */
const SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly',
  'rebrand.ly', 'cutt.ly', 'shorturl.at', 'rb.gy', 'tiny.cc', 's.id',
  'lnkd.in', 'db.tt', 'qr.ae', 'adf.ly', 'bit.do', 'soo.gd', 'shorte.st',
]);

const MAX_URL_LENGTH = 2_000;
const MAX_URLS_PER_TEXT = 25;

/**
 * Finds candidate links. Kept linear and bounded — no nested quantifiers — so
 * that a hostile note cannot turn this into a catastrophic-backtracking hang.
 *
 * The dangerous schemes are matched explicitly because they carry no "//":
 * `javascript:alert(1)` and `data:text/html,...` would slip past a pattern that
 * only looks for "scheme://", and those are precisely the ones that must be
 * found in order to be refused. They are listed by name rather than allowing
 * any bare "word:" so that ordinary prose — "Note: bring the tickets" — is not
 * mistaken for a link.
 */
const URL_PATTERN =
  /\b[a-zA-Z][a-zA-Z0-9+.-]{0,31}:\/\/[^\s<>"'`]{1,2000}|\bwww\.[^\s<>"'`]{1,2000}|\b(?:mailto|tel|javascript|data|file|content|intent|blob|vbscript|jar|about|chrome|app-settings):[^\s<>"'`]{1,2000}/g;

/** Trailing punctuation is almost always sentence punctuation, not the URL. */
function trimTrailingPunctuation(value: string): string {
  let out = value;
  while (out.length > 0) {
    const last = out[out.length - 1] as string;
    if (!'.,;:!?)]}>’”"\''.includes(last)) break;
    // Keep a closing bracket that has a matching opener inside the URL.
    if (last === ')' && (out.match(/\(/g)?.length ?? 0) >= (out.match(/\)/g)?.length ?? 0)) break;
    out = out.slice(0, -1);
  }
  return out;
}

export function extractUrls(text: unknown): string[] {
  if (typeof text !== 'string' || text.length === 0) return [];

  const found: string[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(URL_PATTERN)) {
    if (found.length >= MAX_URLS_PER_TEXT) break;

    const candidate = trimTrailingPunctuation(match[0]).slice(0, MAX_URL_LENGTH);
    if (candidate.length === 0 || seen.has(candidate)) continue;

    seen.add(candidate);
    found.push(candidate);
  }
  return found;
}

interface ParsedUrl {
  scheme: string;
  userinfo: string;
  host: string;
  port: string;
  rest: string;
}

/**
 * Parsed by hand rather than with `URL`.
 *
 * React Native's `URL` is an incomplete polyfill whose behaviour differs from
 * Node's, and a security check that behaves differently on device than it does
 * under test is worse than no check.
 */
export function parseUrl(raw: string): ParsedUrl | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL_LENGTH) return null;

  let working = raw;
  let scheme: string;

  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]{0,31}):/.exec(working);
  if (schemeMatch) {
    scheme = (schemeMatch[1] as string).toLowerCase();
    working = working.slice((schemeMatch[0] as string).length);
  } else if (/^www\./i.test(working)) {
    // Bare "www.example.com" is a link a person will treat as one.
    scheme = 'http';
  } else {
    return null;
  }

  if (working.startsWith('//')) working = working.slice(2);
  else if (scheme === 'mailto' || scheme === 'tel') {
    return { scheme, userinfo: '', host: '', port: '', rest: working };
  }

  const authorityEnd = working.search(/[/?#]/);
  const authority = authorityEnd === -1 ? working : working.slice(0, authorityEnd);
  const rest = authorityEnd === -1 ? '' : working.slice(authorityEnd);

  // The host is what follows the LAST "@": everything before it is userinfo,
  // which is the whole point of the https://apple.com@evil.example trick.
  const atIndex = authority.lastIndexOf('@');
  const userinfo = atIndex === -1 ? '' : authority.slice(0, atIndex);
  let hostAndPort = atIndex === -1 ? authority : authority.slice(atIndex + 1);

  let port = '';
  if (hostAndPort.startsWith('[')) {
    // IPv6 literal.
    const close = hostAndPort.indexOf(']');
    if (close !== -1) {
      const after = hostAndPort.slice(close + 1);
      if (after.startsWith(':')) port = after.slice(1);
      hostAndPort = hostAndPort.slice(0, close + 1);
    }
  } else {
    const colon = hostAndPort.lastIndexOf(':');
    if (colon !== -1) {
      port = hostAndPort.slice(colon + 1);
      hostAndPort = hostAndPort.slice(0, colon);
    }
  }

  return { scheme, userinfo, host: hostAndPort.toLowerCase(), port, rest };
}

const CYRILLIC = /[Ѐ-ӿ]/;
const GREEK = /[Ͱ-Ͽ]/;
const LATIN = /[a-z]/;
const IPV4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/** Registrable-ish suffix: the last two labels. Good enough for display. */
function registrableHost(host: string): string {
  const labels = host.split('.').filter((l) => l.length > 0);
  return labels.length <= 2 ? host : labels.slice(-2).join('.');
}

export function analyzeUrl(raw: string): AnalyzedUrl {
  const parsed = parseUrl(raw);

  if (parsed === null) {
    return {
      raw,
      scheme: '',
      host: '',
      verdict: 'blocked',
      openable: false,
      findings: [
        { code: 'unparseable', message: 'This link could not be read.', severity: 'high' },
      ],
    };
  }

  const findings: UrlFinding[] = [];
  const { scheme, userinfo, host, port } = parsed;

  if (DANGEROUS_SCHEMES.has(scheme)) {
    findings.push({
      code: 'dangerous-scheme',
      message: `Links beginning "${scheme}:" can run code or reach files on your phone. Red Letter will not open it.`,
      severity: 'high',
    });
  } else if (!OPENABLE_SCHEMES.has(scheme)) {
    findings.push({
      code: 'unknown-scheme',
      message: `"${scheme}:" opens another app rather than a web page. Red Letter will not open it.`,
      severity: 'high',
    });
  }

  if (userinfo.length > 0) {
    findings.push({
      code: 'embedded-credentials',
      message: `Everything before the "@" is ignored by your browser. This link actually goes to ${host || 'somewhere else'}.`,
      severity: 'high',
    });
  }

  if (host.startsWith('xn--') || host.includes('.xn--')) {
    findings.push({
      code: 'punycode',
      message: 'This address uses non-Latin characters that can be made to look like a familiar site.',
      severity: 'high',
    });
  }

  const hasLatin = LATIN.test(host);
  if (hasLatin && (CYRILLIC.test(host) || GREEK.test(host))) {
    findings.push({
      code: 'mixed-script',
      message: 'This address mixes alphabets, which is how a fake site is made to look real.',
      severity: 'high',
    });
  }

  if (IPV4.test(host) || host.startsWith('[')) {
    findings.push({
      code: 'ip-host',
      message: 'This link points at a raw numeric address rather than a named site.',
      severity: 'high',
    });
  }

  if (port.length > 0 && port !== '80' && port !== '443') {
    findings.push({
      code: 'unusual-port',
      message: `This link uses port ${port}, which normal websites do not.`,
      severity: 'low',
    });
  }

  if (SHORTENERS.has(registrableHost(host))) {
    findings.push({
      code: 'shortener',
      message: 'A shortened link hides where it actually goes, so there is no way to check it first.',
      severity: 'low',
    });
  }

  if (scheme === 'http') {
    findings.push({
      code: 'insecure',
      message: 'This link is not encrypted.',
      severity: 'low',
    });
  }

  const labels = host.split('.').filter((l) => l.length > 0);
  if (labels.length > 5) {
    findings.push({
      code: 'deep-subdomain',
      message: 'This address has an unusual number of parts, which is often used to bury the real site name.',
      severity: 'low',
    });
  }

  if (raw.length > 512) {
    findings.push({
      code: 'very-long',
      message: 'This link is unusually long.',
      severity: 'low',
    });
  }

  const blocked = findings.some(
    (f) => f.code === 'dangerous-scheme' || f.code === 'unknown-scheme',
  );
  const hasHigh = findings.some((f) => f.severity === 'high');

  return {
    raw,
    scheme,
    host,
    verdict: blocked ? 'blocked' : hasHigh ? 'suspicious' : 'ok',
    openable: !blocked,
    findings,
  };
}

/** Every link in a piece of text, analyzed. */
export function analyzeText(text: unknown): AnalyzedUrl[] {
  return extractUrls(text).map(analyzeUrl);
}

/** The worst verdict across a set — what an entry's badge should show. */
export function worstVerdict(analyzed: AnalyzedUrl[]): UrlVerdict | null {
  if (analyzed.length === 0) return null;
  if (analyzed.some((a) => a.verdict === 'blocked')) return 'blocked';
  if (analyzed.some((a) => a.verdict === 'suspicious')) return 'suspicious';
  return 'ok';
}

/**
 * The address to show the user before they commit to opening it.
 * Always the real host, never the text that preceded it.
 */
export function displayTarget(analyzed: AnalyzedUrl): string {
  if (analyzed.scheme === 'mailto' || analyzed.scheme === 'tel') return analyzed.raw;
  return analyzed.host.length > 0 ? analyzed.host : analyzed.raw;
}
