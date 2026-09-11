import {
  analyzeText,
  analyzeUrl,
  displayTarget,
  extractUrls,
  parseUrl,
  worstVerdict,
} from '../src/core/urls';

const codes = (raw: string): string[] => analyzeUrl(raw).findings.map((f) => f.code);

describe('extractUrls', () => {
  it('finds a plain link', () => {
    expect(extractUrls('Booking at https://example.com/room/12 tonight')).toEqual([
      'https://example.com/room/12',
    ]);
  });

  it('finds a bare www link', () => {
    expect(extractUrls('see www.example.com for details')).toEqual(['www.example.com']);
  });

  it('strips sentence punctuation but keeps balanced brackets', () => {
    expect(extractUrls('Go to https://example.com/page.')).toEqual(['https://example.com/page']);
    expect(extractUrls('Ref https://en.wikipedia.org/wiki/Foo_(bar) here')).toEqual([
      'https://en.wikipedia.org/wiki/Foo_(bar)',
    ]);
  });

  it('returns nothing for text with no links', () => {
    expect(extractUrls('Dentist at 9am')).toEqual([]);
    expect(extractUrls('')).toEqual([]);
    expect(extractUrls(null)).toEqual([]);
    expect(extractUrls(42)).toEqual([]);
  });

  it('de-duplicates', () => {
    expect(extractUrls('https://a.com and https://a.com')).toHaveLength(1);
  });

  it('caps how many links it will take from one field', () => {
    const many = Array.from({ length: 100 }, (_, i) => `https://e${i}.com`).join(' ');
    expect(extractUrls(many).length).toBeLessThanOrEqual(25);
  });

  it('does not hang on a pathological string', () => {
    const nasty = 'https://' + 'a.'.repeat(20_000) + ' ' + '('.repeat(5_000);
    const start = Date.now();
    extractUrls(nasty);
    expect(Date.now() - start).toBeLessThan(1_000);
  });
});

describe('parseUrl', () => {
  it('splits a normal URL', () => {
    expect(parseUrl('https://example.com:8443/a/b?c=d#e')).toEqual({
      scheme: 'https',
      userinfo: '',
      host: 'example.com',
      port: '8443',
      rest: '/a/b?c=d#e',
    });
  });

  it('takes the host from after the LAST @, not the first', () => {
    const parsed = parseUrl('https://apple.com@evil.example/login');
    expect(parsed!.host).toBe('evil.example');
    expect(parsed!.userinfo).toBe('apple.com');
  });

  it('handles multiple @ signs', () => {
    expect(parseUrl('https://a@b@evil.example/')!.host).toBe('evil.example');
  });

  it('handles an IPv6 literal', () => {
    const parsed = parseUrl('http://[2001:db8::1]:8080/x');
    expect(parsed!.host).toBe('[2001:db8::1]');
    expect(parsed!.port).toBe('8080');
  });

  it('handles mailto and tel, which have no authority', () => {
    expect(parseUrl('mailto:a@b.com')).toMatchObject({ scheme: 'mailto', host: '' });
    expect(parseUrl('tel:+15551234')).toMatchObject({ scheme: 'tel', host: '' });
  });

  it('rejects junk', () => {
    expect(parseUrl('not a url')).toBeNull();
    expect(parseUrl('')).toBeNull();
    expect(parseUrl('x'.repeat(5_000))).toBeNull();
  });
});

describe('analyzeUrl — schemes', () => {
  it('accepts ordinary https', () => {
    const result = analyzeUrl('https://example.com/booking');
    expect(result.verdict).toBe('ok');
    expect(result.openable).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it('blocks javascript:', () => {
    const result = analyzeUrl('javascript:alert(document.cookie)');
    expect(result.verdict).toBe('blocked');
    expect(result.openable).toBe(false);
    expect(codes('javascript:alert(1)')).toContain('dangerous-scheme');
  });

  it('blocks the other dangerous schemes', () => {
    for (const raw of [
      'data:text/html;base64,PHNjcmlwdD4=',
      'file:///etc/passwd',
      'content://com.android.providers/x',
      'intent://scan/#Intent;scheme=zxing;end',
      'vbscript:msgbox(1)',
      'blob:https://x.com/abc',
      'jar:http://x.com/a.jar!/',
    ]) {
      const result = analyzeUrl(raw);
      expect(result.verdict).toBe('blocked');
      expect(result.openable).toBe(false);
    }
  });

  it('blocks an unknown scheme rather than handing it to whatever registered it', () => {
    const result = analyzeUrl('mybank://transfer?to=attacker&amount=all');
    expect(result.verdict).toBe('blocked');
    expect(result.openable).toBe(false);
    expect(result.findings.map((f) => f.code)).toContain('unknown-scheme');
  });

  it('allows mailto and tel', () => {
    expect(analyzeUrl('mailto:someone@example.com').openable).toBe(true);
    expect(analyzeUrl('tel:+15551234567').openable).toBe(true);
  });
});

describe('analyzeUrl — deception', () => {
  it('catches credentials used to disguise the real host', () => {
    const result = analyzeUrl('https://apple.com@phishing.example/verify');
    expect(result.verdict).toBe('suspicious');
    expect(result.host).toBe('phishing.example');
    expect(result.findings.map((f) => f.code)).toContain('embedded-credentials');
    // The warning must name where it actually goes.
    expect(result.findings.find((f) => f.code === 'embedded-credentials')!.message).toContain(
      'phishing.example',
    );
  });

  it('catches punycode', () => {
    const result = analyzeUrl('https://xn--pple-43d.com/id');
    expect(result.verdict).toBe('suspicious');
    expect(result.findings.map((f) => f.code)).toContain('punycode');
  });

  it('catches a Cyrillic homograph', () => {
    // "аpple.com" — the first character is Cyrillic а, not Latin a.
    const result = analyzeUrl('https://аpple.com/account');
    expect(result.verdict).toBe('suspicious');
    expect(result.findings.map((f) => f.code)).toContain('mixed-script');
  });

  it('catches a raw IP address', () => {
    expect(analyzeUrl('http://192.168.1.1/admin').findings.map((f) => f.code)).toContain('ip-host');
    expect(analyzeUrl('http://[2001:db8::1]/x').findings.map((f) => f.code)).toContain('ip-host');
  });

  it('does not flag an ordinary host as mixed script', () => {
    expect(codes('https://example.com')).not.toContain('mixed-script');
  });

  it('does not flag a wholly non-Latin host as mixed script', () => {
    // Legitimately Russian, no Latin to confuse it with.
    expect(codes('https://пример.рф/')).not.toContain(
      'mixed-script',
    );
  });
});

describe('analyzeUrl — lower-severity notes', () => {
  it('notes a shortener without calling it malicious', () => {
    const result = analyzeUrl('https://bit.ly/3xAbCd');
    expect(result.verdict).toBe('ok');
    expect(result.openable).toBe(true);
    expect(result.findings.map((f) => f.code)).toContain('shortener');
  });

  it('notes plain http', () => {
    expect(codes('http://example.com')).toContain('insecure');
    expect(codes('https://example.com')).not.toContain('insecure');
  });

  it('notes an unusual port but not 80 or 443', () => {
    expect(codes('https://example.com:8443/')).toContain('unusual-port');
    expect(codes('https://example.com:443/')).not.toContain('unusual-port');
    expect(codes('http://example.com:80/')).not.toContain('unusual-port');
  });

  it('notes a deeply nested subdomain', () => {
    expect(codes('https://a.b.c.d.e.f.example.com/')).toContain('deep-subdomain');
    expect(codes('https://mail.example.com/')).not.toContain('deep-subdomain');
  });

  it('keeps the verdict ok when only low-severity notes apply', () => {
    expect(analyzeUrl('http://bit.ly/abc').verdict).toBe('ok');
  });
});

describe('analyzeText and worstVerdict', () => {
  it('analyzes every link in a note', () => {
    const results = analyzeText('Tickets https://example.com and https://apple.com@evil.example/x');
    expect(results).toHaveLength(2);
    expect(worstVerdict(results)).toBe('suspicious');
  });

  it('reports the worst verdict present', () => {
    expect(worstVerdict(analyzeText('https://example.com'))).toBe('ok');
    expect(worstVerdict(analyzeText('javascript:alert(1) https://example.com'))).toBe('blocked');
    expect(worstVerdict(analyzeText('no links here'))).toBeNull();
  });
});

describe('displayTarget', () => {
  it('shows the real host, never the disguise', () => {
    expect(displayTarget(analyzeUrl('https://apple.com@evil.example/verify'))).toBe('evil.example');
    expect(displayTarget(analyzeUrl('https://example.com/a/b/c'))).toBe('example.com');
  });

  it('shows the whole thing for mailto and tel', () => {
    expect(displayTarget(analyzeUrl('mailto:a@b.com'))).toBe('mailto:a@b.com');
  });
});
