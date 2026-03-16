import fs from 'fs';
import cheerio from 'cheerio';

const SOURCE_URL = 'https://fulltime.thefa.com/fixtures.html?league=4344945';
const TEAM_KEYWORD = 'langton green';
const LOOK_AHEAD_DAYS = 14;

async function main() {
  const response = await fetch(SOURCE_URL, {
    headers: {
      'user-agent': 'Mozilla/5.0',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${SOURCE_URL}`);
  }

  const html = await response.text();
  const fixtures = extractFixtures(html)
    .filter(f => {
      const combined = `${f.home} ${f.away}`.toLowerCase();
      return combined.includes(TEAM_KEYWORD);
    })
    .filter(f => withinWindow(f.dateIso, LOOK_AHEAD_DAYS));

  const output = {
    ok: true,
    source: SOURCE_URL,
    generatedAt: new Date().toISOString(),
    count: fixtures.length,
    fixtures
  };

  fs.writeFileSync('fixtures.json', JSON.stringify(output, null, 2));
  console.log(`Saved ${fixtures.length} fixtures to fixtures.json`);
}

function extractFixtures(html) {
  const $ = cheerio.load(html);
  const text = $('body').text();

  const lines = text
    .split('\n')
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const fixtures = [];
  const seen = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(\d{2})\/(\d{2})\/(\d{2})(?:\s+(\d{2}:\d{2}))?$/);
    if (!match) continue;

    const dd = Number(match[1]);
    const mm = Number(match[2]) - 1;
    const yy = 2000 + Number(match[3]);
    const dateObj = new Date(Date.UTC(yy, mm, dd));
    const dateIso = dateObj.toISOString().slice(0, 10);
    const time = match[4] || '';

    const next = lines.slice(i + 1, i + 8);
    const vsIndex = next.findIndex(x => x === 'VS');
    if (vsIndex <= 0 || vsIndex >= next.length - 1) continue;

    const home = clean(next[vsIndex - 1]);
    const away = clean(next[vsIndex + 1]);

    if (!home || !away) continue;

    let venue = '';
    let ageGroup = '';
    for (const item of next) {
      if (!ageGroup) {
        const m = item.match(/\bU\d{1,2}\b/i);
        if (m) ageGroup = m[0].toUpperCase();
      }
      if (!venue && /^venue[: ]/i.test(item)) {
        venue = item.replace(/^venue[: ]*/i, '').trim();
      }
    }

    const key = [dateIso, time, home, away].join('|');
    if (seen.has(key)) continue;
    seen.add(key);

    fixtures.push({
      dateIso,
      time,
      competition: 'Fixture',
      ageGroup,
      home,
      away,
      venue
    });
  }

  return fixtures;
}

function withinWindow(dateIso, daysAhead) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + daysAhead);

  const fixtureDate = new Date(`${dateIso}T00:00:00Z`);
  return fixtureDate >= today && fixtureDate <= end;
}

function clean(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
