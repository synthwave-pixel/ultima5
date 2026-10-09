// Helpers for the FAQ playthrough, on top of bot.js: the player's Add word cheat (a word from the guide), and the
// development Go to (a benign teleport, used sparingly and logged).
(() => {
  const B = window.bot;
  const g = window.u5.g;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ROWS = ['ABCDEFGHIJK', 'LMNOPQRSTUV', 'WXYZ0123456', '789.,!?-\'"*'];
  B.teleports = B.teleports || [];
  B.openCheats = async () => {
    await B.closeMenus();
    await B.ready();
    B.key('Escape');
    await sleep(80);
    await B.ready();
    await B.pick(/^Cheats/);
    await B.ready();
    return B.menu()?.title;
  };
  const press = async (k) => {
    B.key(k);
    await sleep(25);
    await B.ready();
  };
  // Add word: the letter picker steered letter by letter (rows wrap; the specials' row, 4, holds Space Del Done Cancel).
  B.addWord = async (word) => {
    const t = await B.openCheats();
    if (t !== 'Cheats') return 'no cheats: ' + t;
    await B.pick(/^Add word$/);
    await sleep(150);
    await B.ready();
    let r = 0;
    let c = 0;
    for (const ch of word.toUpperCase()) {
      const tr = ROWS.findIndex((row) => row.includes(ch));
      if (tr < 0) continue;
      const tc = ROWS[tr].indexOf(ch);
      while (r !== tr) {
        if (r < tr) {
          await press('s');
          r++;
        } else {
          await press('w');
          r--;
        }
      }
      while (c !== tc) {
        if (c < tc) {
          await press('d');
          c++;
        } else {
          await press('a');
          c--;
        }
      }
      await press('z');
    }
    while (r !== 4) {
      await press('s');
      r++;
    }
    c = Math.min(c, 3);
    while (c !== 2) {
      if (c < 2) {
        await press('d');
        c++;
      } else {
        await press('a');
        c--;
      }
    }
    await press('z');
    await sleep(200);
    await B.ready();
    const said = g.said.replace(/\s+/g, ' ').slice(-140);
    await B.closeMenus();
    return said;
  };
  // Go to (development cheat): a place by name from the Go to list. Logged in B.teleports.
  B.goTo = async (name, under = false) => {
    const t = await B.openCheats();
    if (t !== 'Cheats') return 'no cheats: ' + t;
    await B.pick(under ? /^Go to Underworld/ : /^Go to\.\.\.$/);
    await sleep(150);
    await B.ready();
    const ok = await B.pick(new RegExp('^' + name + '$', 'i'));
    await sleep(400);
    await B.ready(8000);
    B.teleports.push(name);
    await B.closeMenus();
    return [ok, B.st().at];
  };

  // A Glass Sword in the hand of everyone whose hands are empty (the player's cheat tops the pack up).
  B.glassFor = B.glassFor || [0, 2]; // who takes one in a free hand beside their own weapon
  B.glassUp = async () => {
    const s = g.s;
    const out = [];
    if (s.equipment[0x27] < 3) out.push(await B.cheat('Glass swords +5'));
    for (let i = 0; i < s.partySize; i++) {
      const m = s.members[i];
      if (m.status === 0x44 || m.hp <= 0) continue;
      const free = m.equips[2] === 0xff || (B.glassFor.includes(i) && m.equips[3] === 0xff);
      if (free && m.equips[2] !== 0x27 && m.equips[3] !== 0x27) out.push(m.name + ': ' + (await B.readyItem(i, 'Glass Sword')));
    }
    return out;
  };
  // Experience for the next level (the old man raises a member who has it, at a camp that rested).
  B.nextExp = (lv) => (lv === 1 ? 100 : 100 << (lv - 1));
  // Fights met where the party stands (or walking to and fro), glass swords readied; a camp whenever someone has
  // the experience for a level, until `done(s)`.
  B.grind = async (done, maxFights = 30, home = null) => {
    const s = g.s;
    const log = [];
    let fights = 0;
    for (let round = 0; round < 400 && fights < maxFights && !done(s); round++) {
      if (g.commandPrompt === 'combat' || s.mapId >= 0x80) {
        fights++;
        const f = await B.fight();
        log.push(['fight', f.slice(-2), B.st().hp, s.members.slice(0, s.partySize).map((m) => m.exp)]);
        if (s.members.slice(0, s.partySize).some((m) => m.hp < m.maxHp / 2 || m.status === 0x44)) await B.cheat('Full restore');
        if (fights % 4 === 0 && g.commandPrompt === 'outdoors') await B.save();
        await B.glassUp();
        continue;
      }
      if (B.menu()) await B.closeMenus();
      const ready = s.members.slice(0, s.partySize).some((m) => m.level < 8 && m.exp >= B.nextExp(m.level));
      if (ready && g.commandPrompt === 'outdoors') {
        const lv = s.members.slice(0, s.partySize).map((m) => m.level);
        await B.cheat('Full restore');
        await B.camp(9);
        await B.ready(20000);
        if (B.menu()) await B.closeMenus();
        log.push([
          'camp',
          lv.join('/'),
          '->',
          s.members
            .slice(0, s.partySize)
            .map((m) => m.level)
            .join('/'),
          g.commandPrompt,
        ]);
        if (g.commandPrompt === 'outdoors') await B.save();
        continue;
      }
      if (home) {
        // To and fro about home: wanderers come to a party on the move.
        const tx = home[0] + (round % 4 < 2 ? -6 : 6);
        const ty = home[1] + (round % 2 ? -4 : 4);
        const r = await B.travel(tx, ty, 30);
        if (r === 'nopath' || /^blocked/.test(r)) await B.pass();
        continue;
      }
      await B.pass();
    }
    return log;
  };

  // A line picked a step at a time, each step seen through (B.pick can outrun the menu's cursor).
  B.pickSlow = window.pickSlow = async (re) => {
    for (let n = 0; n < 80; n++) {
      await B.ready();
      const m = B.menu();
      if (!m) return 'nomenu';
      const i = m.labels.findIndex((l) => re.test(l));
      if (i < 0) return 'none';
      if (m.at === i) {
        B.key('z');
        await sleep(200);
        await B.ready();
        return true;
      }
      B.key(m.columns === 2 && (m.at ^ i) & 1 ? (m.at < i ? 'd' : 'a') : m.at < i ? 's' : 'w');
      await sleep(80);
    }
    return 'timeout';
  };
  // Mix reagents: the spell, then the count dialled (the controller's mixing knows each recipe).
  B.mixSpell = async (re, n) => {
    await B.closeMenus();
    await B.cmd(/^Mix reagents/);
    await B.ready();
    const r = await B.pickSlow(re);
    if (r !== true) {
      await B.closeMenus();
      return 'pick ' + r;
    }
    if (B.menu()?.title !== 'How many?') {
      const t = B.menu()?.title;
      await B.closeMenus();
      return 'no count: ' + t;
    }
    for (let i = 0; i < 120; i++) {
      const v = Number(B.menu()?.labels?.[0]);
      if (!Number.isFinite(v) || v === n) break;
      B.key(v < n ? 'w' : 's');
      await sleep(40);
      await B.ready();
    }
    B.key('z');
    await sleep(300);
    await B.ready();
    const said = g.said.replace(/\s+/g, ' ').slice(-40);
    await B.closeMenus();
    return said;
  };
  // A Shadowlord undone at its keep's flame: yelled from south of it, a turn passed, the shard cast in.
  B.unmake = async (name, shard) => {
    const out = [];
    await B.cmd(/^Yell/);
    await B.ready();
    out.push(await B.pickSlow(new RegExp('^' + name, 'i')));
    await B.ready(8000);
    out.push(g.said.replace(/\s+/g, ' ').slice(-30));
    await B.pass();
    await B.ready(5000);
    await B.cmd(/^Use item/);
    await B.ready();
    out.push(await B.pickSlow(new RegExp(shard, 'i')));
    await B.ready(10000);
    await sleep(3000);
    await B.ready(10000);
    out.push(g.said.replace(/\s+/g, ' ').slice(-140));
    return out;
  };

  // --- glass-sword fighting: every turn played by hand. A member with no Glass Sword in hand readies one (the
  // player's cheat keeps the pack stocked); one beside a foe walks into it (the pad's strike); else a step toward
  // the nearest. The won field is then left as B.fight leaves it. ---
  const CM = () => B.combatMod;
  const foesNow = () =>
    g.combat.map((c, i) => ({ c, i })).filter(({ c, i }) => c.flags && !(c.flags & 0x20) && CM() && CM().onMonsterSide(g, i));
  const myTurn = async () => {
    for (let i = 0; i < 150; i++) {
      await B.ready(2000);
      if (!(g.commandPrompt === 'combat' || g.s.mapId >= 0x80)) return null;
      if (window.u5.screen.waiter && g.commandPrompt === 'combat' && !B.menu() && !g.s.crosshair) return g.combat[g.s.combatTurn];
      if (B.menu() && B.menu().title !== 'Paused') {
        B.key('x');
        await sleep(60);
      } else await sleep(60);
    }
    return undefined;
  };
  B.stepToward = (me, targets) => {
    const s = g.s;
    const mine = s.actors[me.actor].tile;
    const blocked = new Set(g.combat.filter((c) => c !== me && c.flags && !(c.flags & 0x20)).map((c) => c.y * 11 + c.x));
    const goal = new Set(targets.map((t) => t.c.y * 11 + t.c.x));
    const start = me.y * 11 + me.x;
    const prev = new Map([[start, -1]]);
    const q = [start];
    let end = -1;
    while (q.length && end < 0) {
      const c = q.shift();
      const cx = c % 11,
        cy = (c / 11) | 0;
      for (const [dx, dy] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ]) {
        const nx = cx + dx,
          ny = cy + dy;
        if (nx < 0 || ny < 0 || nx > 10 || ny > 10) continue;
        const n = ny * 11 + nx;
        if (prev.has(n)) continue;
        if (goal.has(n)) {
          prev.set(n, c);
          end = n;
          break;
        }
        if (blocked.has(n) || !CM().arenaFree(g, mine, nx, ny)) continue;
        prev.set(n, c);
        q.push(n);
      }
    }
    if (end < 0) return null;
    let c = end;
    while (prev.get(c) !== start) c = prev.get(c);
    const d = c - start;
    return d === -11 ? 'w' : d === 11 ? 's' : d === 1 ? 'd' : 'a';
  };
  B.glassTurns = async (maxTurns = 400) => {
    const s = g.s;
    const log = [];
    let stuck = 0;
    if (g.options.autoCombat !== 'off') await B.autoCombat('off');
    for (let n = 0; n < maxTurns; n++) {
      const me = await myTurn();
      if (me === null) return [...log, 'off the field'];
      if (me === undefined) return [...log, 'no turn'];
      const foes = foesNow();
      if (!foes.length) return [...log, 'won'];
      const low = [...Array(s.partySize).keys()].some((i) => s.members[i].status !== 0x44 && s.members[i].hp < s.members[i].maxHp * 0.5);
      if (low) {
        await B.cheat('Full restore');
        log.push('restore');
        continue;
      }
      const m = s.members[me.who];
      if (m.equips[2] !== 0x27 && m.equips[3] !== 0x27 && (m.equips[2] === 0xff || m.equips[3] === 0xff)) {
        if (s.equipment[0x27] < 2) await B.cheat('Glass swords +5');
        await B.cmd(/^Ready$/);
        await B.ready();
        if (B.menu()?.title !== 'Ready') {
          await B.press('z');
          await B.ready();
        }
        await B.pickSlow(/^Glass Sword/);
        await B.ready();
        await B.closeMenus();
        log.push('glass:' + m.name);
        continue;
      }
      const k = B.stepToward(me, foes);
      if (!k) {
        if (++stuck > 12) return [...log, 'no foe to be reached'];
        await B.pass();
        continue;
      }
      stuck = 0;
      await B.press(k);
    }
    return [...log, 'turns out'];
  };
  if (!B.fight0) B.fight0 = B.fight;
  B.fight = async (exit = null) => {
    if (B.glassMode && (g.commandPrompt === 'combat' || g.s.mapId >= 0x80)) {
      const r = await B.glassTurns();
      const rest = await B.fight0(exit);
      return [...r.slice(-2), ...rest];
    }
    return B.fight0(exit);
  };
  return 'extra loaded';
})();
