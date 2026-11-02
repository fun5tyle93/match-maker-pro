import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

// Static checks for privacy and sharing settings. They read the files that are delivered as they are.
const root = process.cwd();
const read = (file: string) => readFileSync(join(root, file), 'utf8');

const html = read('index.html');
const meta = (attr: 'name' | 'property', key: string) =>
  html.match(new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`))?.[1];

describe('no connection to Google fonts', () => {
  it('index.html, the CSS and the code do not mention Google font servers', () => {
    const files = ['index.html', 'src/index.css', 'src/fonts.css', 'src/main.tsx'];
    files.forEach(file => expect(read(file), file).not.toMatch(/fonts\.googleapis|fonts\.gstatic/));
  });

  it('every font file imported in fonts.css exists in the installed package', () => {
    const imports = [...read('src/fonts.css').matchAll(/@import '([^']+)'/g)].map(m => m[1]);
    expect(imports.length).toBeGreaterThan(10);
    imports.forEach(path => expect(existsSync(join(root, 'node_modules', path)), path).toBe(true));
  });

  it('main.tsx loads the font CSS before the app CSS', () => {
    const main = read('src/main.tsx');
    expect(main.indexOf('./fonts.css')).toBeGreaterThan(-1);
    expect(main.indexOf('./fonts.css')).toBeLessThan(main.indexOf('./index.css'));
  });

  it('covers every weight the design uses', () => {
    const css = read('src/fonts.css');
    [400, 500, 600, 700].forEach(w => expect(css).toContain(`oswald/latin-${w}.css`));
    [300, 400, 500, 600, 700].forEach(w => expect(css).toContain(`inter/latin-${w}.css`));
  });
});

describe('search engines are kept out', () => {
  it('the HTML says noindex', () => {
    expect(meta('name', 'robots')).toMatch(/noindex/);
  });

  it('every response carries the X-Robots-Tag header and the SPA rewrite stays', () => {
    const config = JSON.parse(read('vercel.json'));
    const rule = config.headers.find((h: { source: string }) => h.source === '/(.*)');
    expect(rule.headers).toContainEqual({ key: 'X-Robots-Tag', value: expect.stringMatching(/noindex/) });
    expect(config.rewrites).toContainEqual({ source: '/(.*)', destination: '/index.html' });
  });

  // Reads robots.txt like a crawler: the most specific group for the agent applies
  const groups = (() => {
    const result: { agents: string[]; rules: [string, string][] }[] = [];
    let current: { agents: string[]; rules: [string, string][] } | null = null;
    for (const raw of read('public/robots.txt').split('\n')) {
      const line = raw.replace(/#.*/, '').trim();
      if (!line) continue;
      const [key, ...rest] = line.split(':');
      const value = rest.join(':').trim();
      if (key.toLowerCase() === 'user-agent') {
        if (!current || current.rules.length > 0) result.push((current = { agents: [], rules: [] }));
        current!.agents.push(value.toLowerCase());
      } else if (current) current.rules.push([key.toLowerCase(), value]);
    }
    return result;
  })();
  const allows = (agent: string, path = '/') => {
    const group = groups.find(g => g.agents.includes(agent.toLowerCase())) ?? groups.find(g => g.agents.includes('*'))!;
    const rule = [...group.rules].reverse().find(([, v]) => path.startsWith(v));
    return rule ? rule[0] === 'allow' : true;
  };

  it('Google and Bing may read the page so they see noindex', () => {
    expect(allows('Googlebot')).toBe(true);
    expect(allows('Bingbot')).toBe(true);
  });

  it('link previews (WhatsApp, Facebook, Twitter, Telegram) stay allowed', () => {
    ['facebookexternalhit', 'Twitterbot', 'WhatsApp', 'TelegramBot', 'Slackbot', 'LinkedInBot', 'Discordbot'].forEach(bot =>
      expect(allows(bot), bot).toBe(true),
    );
  });

  it('all other robots are shut out', () => {
    expect(allows('SomeOtherBot')).toBe(false);
    expect(allows('Baiduspider', '/training')).toBe(false);
  });
});

describe('link preview', () => {
  const imageUrl = meta('property', 'og:image');

  it('uses an absolute address of the club app and the same image for Twitter', () => {
    expect(imageUrl).toBe('https://match-maker-pro.vercel.app/images/tkc71-vorschau.png');
    expect(meta('name', 'twitter:image')).toBe(imageUrl);
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
  });

  it('the image exists, is a 1200 x 630 PNG and small enough for WhatsApp', () => {
    const file = join(root, 'public/images/tkc71-vorschau.png');
    expect(existsSync(file)).toBe(true);
    const bytes = readFileSync(file);
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1200, 630]);
    expect(statSync(file).size).toBeLessThan(300 * 1024);
    expect(meta('property', 'og:image:width')).toBe('1200');
    expect(meta('property', 'og:image:height')).toBe('630');
  });

  it('advertises the club and no web address in the visible texts', () => {
    const visible = [
      meta('property', 'og:title'), meta('property', 'og:description'), meta('property', 'og:site_name'),
      meta('property', 'og:image:alt'), meta('name', 'twitter:title'), meta('name', 'twitter:description'),
    ];
    visible.forEach(text => {
      expect(text, String(text)).toBeTruthy();
      expect(text).not.toMatch(/https?:\/\/|www\.|\.app\b|\.com\b|\.de\b|vercel|lovable/i);
    });
    expect(meta('property', 'og:title')).toContain('TKC71 Hirschlanden');
    expect(meta('property', 'og:site_name')).toBe('TKC71 Hirschlanden');
  });

  it('has no leftovers of the template (foreign name, foreign image, foreign Twitter account)', () => {
    expect(html).not.toMatch(/lovable|Kicker Trainer|KickerTrainer/i);
    expect(html).not.toContain('twitter:site');
  });
});

describe('public folder', () => {
  it('does not serve PDF files (the old eternal table with names was removed)', () => {
    const files = readdirSync(join(root, 'public'));
    expect(files.filter(f => f.toLowerCase().endsWith('.pdf'))).toEqual([]);
  });
});

describe('security headers and zoom', () => {
  const config = JSON.parse(read('vercel.json'));
  const headers: Record<string, string> = Object.fromEntries(
    config.headers.find((h: { source: string }) => h.source === '/(.*)').headers.map((h: { key: string; value: string }) => [h.key, h.value]),
  );
  const csp = Object.fromEntries(
    headers['Content-Security-Policy'].split(';').map(d => d.trim().split(/\s+/)).map(([name, ...values]) => [name, values]),
  ) as Record<string, string[]>;

  it('sets the standard protective headers', () => {
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Permissions-Policy']).toMatch(/camera=\(\)/);
    expect(headers['X-Robots-Tag']).toContain('noindex');
  });

  it('CSP allows scripts only from the own origin and forbids framing', () => {
    expect(csp['script-src']).toEqual(["'self'"]);
    expect(headers['Content-Security-Policy']).not.toMatch(/unsafe-eval/);
    expect(csp['frame-ancestors']).toEqual(["'none'"]);
    expect(csp['default-src']).toEqual(["'self'"]);
  });

  it('CSP lets the app talk to its own Supabase project and to no other host', () => {
    const client = read('src/integrations/supabase/client.ts');
    const url = client.match(/https:\/\/[a-z0-9]+\.supabase\.co/)![0];
    expect(csp['connect-src']).toEqual(["'self'", url]);
    const hosts = [...headers['Content-Security-Policy'].matchAll(/https?:\/\/[^\s;]+/g)].map(m => m[0]);
    expect(hosts).toEqual([url]);
  });

  it('keeps the SPA rewrite', () => {
    expect(config.rewrites).toContainEqual({ source: '/(.*)', destination: '/index.html' });
  });

  it('viewport allows zooming', () => {
    const viewport = html.match(/<meta\s+name="viewport"\s+content="([^"]*)"/)![1];
    expect(viewport).not.toMatch(/user-scalable\s*=\s*(no|0)/);
    expect(viewport).not.toMatch(/maximum-scale/);
  });
});
