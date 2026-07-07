import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 820 } });
const cfg = {
  world: 'panchatantra',
  players: [
    { name: 'Asha', color: '#e8c24a', char: 'lion' },
    { name: 'Ravi', color: '#46c7b0', char: 'monkey' },
    { name: 'Meera', color: '#e0559b', char: 'turtle' },
  ],
};
await ctx.addInitScript((c) => { sessionStorage.setItem('sopana.game', JSON.stringify(c)); }, cfg);
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('ERR', e.message));
p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await p.goto('http://localhost:5173/board.html?world=panchatantra', { waitUntil: 'load' });
await p.waitForTimeout(1200);
const tokens = await p.$$eval('.token.mp', (t) => t.length);
const roster = await p.$$eval('#roster .rmp', (r) => r.map((x) => x.querySelector('.nm').textContent));
const status = await p.$eval('#status', (s) => s.textContent);
console.log('tokens', tokens, 'roster', JSON.stringify(roster), 'status', JSON.stringify(status));
for (let i = 0; i < 3; i++) {
  await p.click('#rollBtn');
  await p.waitForTimeout(1600);
  const rb = await p.$('#reveal:not([hidden])');
  if (rb) { await p.click('#continueBtn').catch(() => {}); await p.waitForTimeout(1400); }
}
await p.screenshot({ path: 'tooling/_board_mp.png' });
const status2 = await p.$eval('#status', (s) => s.textContent);
console.log('after-rolls status', JSON.stringify(status2));
await b.close();
