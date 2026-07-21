import { describe, expect, it } from 'vitest';
import { parseRss } from './rss';

const RSS = `<?xml version="1.0"?><rss><channel>
  <item>
    <title><![CDATA[Offshore rig blowout sparks fire in the Gulf of Mexico]]></title>
    <link>https://example.com/a</link>
    <pubDate>Mon, 21 Jul 2026 10:15:00 GMT</pubDate>
  </item>
  <item>
    <title>Pipeline leak reported near Midland, Texas &amp; beyond</title>
    <link>https://example.com/b</link>
    <pubDate>Mon, 21 Jul 2026 09:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Refinery outage in Louisiana</title>
    <link href="https://example.com/c" />
    <updated>2026-07-21T08:00:00Z</updated>
  </entry>
</feed>`;

describe('parseRss', () => {
  it('parses RSS items with CDATA and entities', () => {
    const items = parseRss(RSS);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('Offshore rig blowout sparks fire in the Gulf of Mexico');
    expect(items[0].link).toBe('https://example.com/a');
    expect(items[0].date).toBe(Date.parse('Mon, 21 Jul 2026 10:15:00 GMT'));
    expect(items[1].title).toContain('Texas & beyond'); // entity decoded
  });

  it('falls back to Atom <entry>', () => {
    const items = parseRss(ATOM);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Refinery outage in Louisiana');
    expect(items[0].link).toBe('https://example.com/c');
  });

  it('returns [] for junk input', () => {
    expect(parseRss('not xml')).toEqual([]);
  });
});
