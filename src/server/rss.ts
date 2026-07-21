// Minimal, dependency-free RSS/Atom parser. Handles CDATA, HTML entities, and
// both <item> (RSS) and <entry> (Atom) shapes. Good enough for headline feeds;
// not a general-purpose XML parser.

export interface RssItem {
  title: string;
  link: string;
  date?: number;
}

export function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];

  // RSS <item>
  for (const block of xml.split(/<item[\s>]/i).slice(1)) {
    const title = tag(block, 'title');
    if (!title) continue;
    items.push({ title, link: tag(block, 'link'), date: parseDate(tag(block, 'pubDate')) });
  }

  // Atom <entry> fallback
  if (items.length === 0) {
    for (const block of xml.split(/<entry[\s>]/i).slice(1)) {
      const title = tag(block, 'title');
      if (!title) continue;
      const href = /<link[^>]*href="([^"]+)"/i.exec(block)?.[1] ?? '';
      items.push({ title, link: href, date: parseDate(tag(block, 'updated') || tag(block, 'published')) });
    }
  }

  return items;
}

function tag(block: string, name: string): string {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  return m ? decode(stripCdata(m[1])).trim() : '';
}

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

function decode(s: string): string {
  return s
    .replace(/<[^>]+>/g, '') // strip any nested markup
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function parseDate(s: string): number | undefined {
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : undefined;
}
