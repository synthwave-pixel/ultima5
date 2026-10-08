// A controller-only player for the browser: every action is a keydown of W A S D Z X, as a keyboard-as-pad player's.
// Reads the game's state through window.u5 to plan; never writes it.
(() => {
  const g = window.u5.g,
    SC = window.u5.screen;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // The pane this runs in is often hidden, and the game sleeps while hidden: keep it awake, and silent.
  Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
  Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
  SC.setAwake(true);
  // Quiet: the mixer's levels at Off (the sound set itself stays a real one - 'off' is no set, and a gain of NaN).
  g.options.effectsLevel = 0;
  g.options.musicLevel = 0;
  g.soundOff = true;
  g.hooks.applyOptions(g.options);

  // A hidden pane's timers are throttled to a second each: a worker's are not, so short waits are kept by one.
  if (!window.__fastTimers) {
    window.__fastTimers = true;
    const w = new Worker(
      URL.createObjectURL(new Blob(['onmessage=(e)=>setTimeout(()=>postMessage(e.data.id),e.data.ms)'], { type: 'text/javascript' })),
    );
    const pending = new Map();
    let next = 1;
    w.onmessage = (e) => {
      const f = pending.get(e.data);
      pending.delete(e.data);
      if (f) f();
    };
    const native = window.setTimeout.bind(window);
    window.setTimeout = (fn, ms = 0, ...args) => {
      if (typeof fn !== 'function' || ms > 5000) return native(fn, ms, ...args);
      const id = next++;
      pending.set(id, () => fn(...args));
      w.postMessage({ id, ms });
      return -id;
    };
    const nativeClear = window.clearTimeout.bind(window);
    window.clearTimeout = (id) => {
      if (typeof id === 'number' && id < 0) pending.delete(-id);
      else nativeClear(id);
    };
  }

  const B = (window.bot = {
    questions: [],
    gen: (window.bot?.gen ?? 0) + 1,
    notes: [],
    memo: window.bot?.memo ?? JSON.parse(localStorage.getItem('pilot.memo') || '{}'),
  });
  setInterval(() => {
    try {
      localStorage.setItem('pilot.memo', JSON.stringify(window.bot.memo || {}));
    } catch {
      /* not there */
    }
  }, 5000);
  const alive = (gen) => window.bot.gen === gen;
  B.shot = async (name) => {
    const c = document.getElementById('screen');
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    await fetch('http://localhost:5198/?name=' + name, { method: 'POST', body: blob });
    return name;
  };
  B.key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  // (A wiped party is always taken back to its save: Lord British's aid would leave its craft wherever they lay.)
  B.ready = async (ms = 8000) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      if (SC.waiter) {
        const m = g.menuShown;
        if (m && m.title === 'All is lost') {
          B.wipes = (B.wipes || 0) + 1;
          if (m.at !== 0) {
            B.key('w');
            await sleep(40);
            continue;
          }
          B.key('z');
          await sleep(300);
          continue;
        }
        return true;
      }
      await sleep(10);
    }
    return false;
  };
  B.press = async (keys, gap = 20) => {
    for (const k of keys.split(' ').filter(Boolean)) {
      await B.ready();
      B.key(k);
      await sleep(gap);
    }
    await B.ready(3000);
  };
  B.menu = () => g.menuShown;
  B.pick = async (want) => {
    for (let n = 0; n < 80; n++) {
      await B.ready();
      const m = B.menu();
      if (!m) return false;
      const i = typeof want === 'number' ? want : m.labels.findIndex((l) => want.test(l));
      if (i < 0) return false;
      if (m.at === i) {
        B.key('z');
        await sleep(30);
        await B.ready();
        return true;
      }
      // (Across first where it is in the other column of a two-column list - menu.ts chooseTwoColumns; in a list of
      // one, up and down - left and right turn a page in a long one.)
      B.key(m.columns === 2 && (m.at ^ i) & 1 ? (m.at < i ? 'd' : 'a') : m.at < i ? 's' : 'w');
      await sleep(15);
    }
    return false;
  };
  // A command from the command menu.
  B.cmd = async (label) => {
    await B.ready();
    if (!B.menu()) {
      B.key('z');
      await sleep(40);
      await B.ready();
    }
    return B.pick(label);
  };

  // A line of the Pause menu (Escape, as Start on a pad): Auto combat, Save game - those the command menu no longer
  // carries. The menu is resumed after, unless `resume` is false (Save game asks its question first).
  B.pause = async (label, resume = true) => {
    await B.closeMenus();
    B.key('Escape');
    await sleep(60);
    await B.ready();
    const ok = await B.pick(label);
    await B.ready();
    if (resume) await B.closeMenus();
    return ok;
  };
  // A turn passed: B, with no menu up (on a won field with nothing to take, B leaves it, as the game has it).
  B.pass = async () => {
    await B.ready();
    for (let i = 0; i < 4 && B.menu(); i++) {
      B.key('x');
      await sleep(40);
      await B.ready();
    }
    B.key('x');
    await sleep(40);
    await B.ready();
  };

  // --- walking inside a place ---
  const DOORS = [0xb8, 0xba]; // the locked ones (b9, bb) are walls to a walker: a key is a decision
  // A person or creature standing there, as against a thing lying there (a chest, a carpet), which is walked onto.
  const isBody = (a) => a.tile >= 0x20 || (a.tile & 0xfe) === 0x10;
  B.bad = new Set();
  const okT0 = (t) =>
    (t >= 4 && t <= 7) ||
    (t >= 0x20 && t <= 0x27) ||
    (t >= 0x30 && t <= 0x49) ||
    DOORS.includes(t) ||
    t === 0xc8 ||
    t === 0xc9 ||
    t === 0x4d ||
    t === 0x4e ||
    t === 0x87 ||
    t === 0xab ||
    t === 0xac ||
    t === 0x2d ||
    t === 0x2c ||
    (t >= 0x90 && t <= 0x93) ||
    (t >= 0xc4 && t <= 0xc7);
  // The game's own rule for a walker where it is to hand (doors that are not locked open when walked into).
  const okT = (t) =>
    B.actors ? (B.actors.canEnter(g, 0x1c, t) && t !== 0xb9 && t !== 0xbb && t !== 0x8c) || DOORS.includes(t) || t === 0x4e : okT0(t);
  B.path = (tx, ty, adjacent = true) => {
    const s = g.s,
      mm = g.map;
    const occ = new Set(s.actors.filter((a, i) => i > 0 && a.tile && isBody(a) && a.z === s.level).map((a) => a.y * 32 + a.x));
    const start = s.y * 32 + s.x;
    const prev = new Map([[start, -1]]);
    const q = [start];
    let end = -1;
    while (q.length) {
      const c = q.shift();
      const cx = c % 32,
        cy = c >> 5;
      if (adjacent ? Math.abs(cx - tx) + Math.abs(cy - ty) === 1 : cx === tx && cy === ty) {
        end = c;
        break;
      }
      for (const [dx, dy] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ]) {
        const nx = cx + dx,
          ny = cy + dy;
        if (nx < 0 || ny < 0 || nx > 31 || ny > 31) continue;
        const n = ny * 32 + nx;
        if (mm[n] >= 0xc4 && mm[n] <= 0xc7 && !(nx === tx && ny === ty)) continue;
        if (prev.has(n) || !okT(mm[n]) || B.bad.has(s.mapId + ':' + s.level + ':' + n) || (occ.has(n) && !(nx === tx && ny === ty)))
          continue;
        prev.set(n, c);
        q.push(n);
      }
    }
    if (end < 0) return null;
    const steps = [];
    for (let c = end; c !== start; c = prev.get(c)) {
      const d = c - prev.get(c);
      steps.push(d === -32 ? 'w' : d === 32 ? 's' : d === 1 ? 'd' : 'a');
    }
    return steps.reverse();
  };
  const DIR = { w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
  B.step = async (k) => {
    const s = g.s;
    const [dx, dy] = DIR[k];
    const bx = s.x,
      by = s.y;
    const tgt = (by + dy) * 32 + bx + dx;
    const door = DOORS.includes(g.map[tgt]);
    await B.press(k);
    // A square that would not be entered is remembered as such - unless someone was standing on it.
    const someone = s.actors.some((a, i) => i > 0 && a.tile && isBody(a) && a.z === s.level && a.y * 32 + a.x === tgt);
    if (g.s.x === bx && g.s.y === by && !door && !someone && !B.menu() && g.commandPrompt === 'town')
      B.bad.add(s.mapId + ':' + s.level + ':' + tgt);
  };
  B.go = async (x, y, adjacent = false) => {
    const gen = B.gen;
    for (let n = 0; n < 300 && alive(gen); n++) {
      const s = g.s;
      if (adjacent ? Math.abs(s.x - x) + Math.abs(s.y - y) === 1 : s.x === x && s.y === y) return true;
      if (B.menu() || g.commandPrompt !== 'town') return 'interrupted:' + g.commandPrompt;
      const p = B.path(x, y, adjacent);
      if (!p || !p.length) return 'nopath';
      await B.step(p[0]);
    }
    return 'toolong';
  };
  B.npcs = () => {
    const s = g.s;
    return [...Array(32).keys()]
      .filter((i) => i > 0 && s.npcTypes[i] && s.npcs[i].actor)
      .map((i) => {
        const a = s.actors[s.npcs[i].actor];
        return [i, s.npcTypes[i].toString(16), s.npcs[i].fa, a.x, a.y, a.z];
      });
  };

  // --- talking ---
  B.talk = async (policy = {}) => {
    const gen = B.gen;
    const heard = [];
    const asked = new Map();
    const reasked = new Set();
    let lastWord = '';
    let idle = 0;
    for (let n = 0; n < 150 && alive(gen); n++) {
      await B.ready();
      const m = B.menu();
      if (!m) {
        if (g.commandPrompt) return { done: true, heard };
        B.key(++idle % 5 === 0 ? 'x' : 'z');
        await sleep(40);
        continue;
      }
      if (m.title !== 'Say') {
        const q = g.said.replace(/\s+/g, ' ').slice(-160);
        const times = asked.get(q.slice(-60)) || 0;
        asked.set(q.slice(-60), times + 1);
        let i = m.labels.indexOf(g.s.members[0].name);
        if (i < 0) {
          const want = Object.entries(policy).find(([k]) => q.includes(k));
          if (want) i = m.labels.findIndex((l) => new RegExp(want[1], 'i').test(l));
        }
        // In Blackthorn's palace, with the Black Badge, the party is of the Oppression and says so; elsewhere never.
        const palace = g.s.mapId === 0x12;
        const YES = palace
          ? /Dost thou pay|come quietly|half thy gold|tribute|Oppression|Blackthorn|password|loyal/i
          : /Dost thou pay|come quietly|half thy gold|tribute/i;
        if (i < 0 && YES.test(q.slice(-110)) && m.labels.includes('Yes')) i = m.labels.indexOf('Yes');
        const NO =
          /confess|guilty|heresy|turn me in|treason|donate|gold for|give me \d+|buy|purchase|Blackthorn is|serve Blackthorn|the Oppression|loyal to Blackthorn|leave us|stay\?/i;
        if (i < 0 && NO.test(q.slice(-110)) && m.labels.includes('No')) i = m.labels.indexOf('No');
        if (i < 0) {
          const special = m.labels.map((l, k) => k).filter((k) => !/^(Yes|No|Say nothing|Take leave)$/.test(m.labels[k]));
          const order = [...special, m.labels.indexOf('Yes'), m.labels.indexOf('No')].filter((k) => k >= 0);
          if (order.length) i = order[times % order.length];
        }
        if (i < 0 || times > 3) i = m.labels.length - 1;
        // A question that wanted a name the party had not yet heard is kept, to be asked again when more is known.
        if (lastWord && B.talking) {
          const k = g.s.mapId + ':' + B.talking + ':' + lastWord;
          const named = m.labels.some((l) => !/^(Yes|No|Say nothing|Take leave)$/.test(l) && l !== g.s.members[0].name);
          if (named) delete B.open[k];
          else if (/who (told|sent)|password|who is|name of|what is (the|their|his|her)/i.test(q.slice(-110))) B.open[k] = g.words.size;
          try {
            localStorage.setItem('pilot.open', JSON.stringify(B.open));
          } catch {
            /* not there */
          }
        }
        B.questions.push([q.slice(-90), m.labels.join('/'), m.labels[i]]);
        heard.push('?' + m.labels[i]);
        await B.pick(i);
        continue;
      }
      // Someone whose patience is wearing thin is left alone before they call the guard.
      const testy = /patience|bother me|leave me|begone|go away/i.test(g.said.replace(/\s+/g, ' ').slice(-140));
      let i = testy ? -1 : m.labels.findIndex((l, k) => !m.dim[k] && l !== 'Take leave');
      if (i < 0 && !testy && B.talking) {
        i = m.labels.findIndex((l) => {
          const k = g.s.mapId + ':' + B.talking + ':' + l;
          return B.open[k] !== undefined && !reasked.has(l) && g.words.size > B.open[k];
        });
        if (i >= 0) reasked.add(m.labels[i]);
      }
      lastWord = i >= 0 ? m.labels[i] : '';
      heard.push(i >= 0 ? m.labels[i] : 'bye');
      await B.pick(i >= 0 ? i : m.labels.length - 1);
    }
    return { heard, stuck: true };
  };
  B.open = {};
  try {
    B.open = JSON.parse(localStorage.getItem('pilot.open') || '{}');
  } catch {
    /* not there */
  }
  // What one of them says to each word, and what they ask back: for looking into a conversation that gave nothing.
  B.probe = async (i, answers = {}, only = null) => {
    const out = [];
    const s = g.s;
    for (let n = 0; n < 6; n++) {
      const npc = s.npcs[i];
      // Not on this floor: their place is known from the table, and the floor from it.
      const a = npc.actor ? s.actors[npc.actor] : { x: npc.x, y: npc.y, z: npc.z, tile: 1 };
      if (!a.tile) return 'not here';
      const r = await B.seek(a.x, a.y, sgn(a.z), true, 300);
      if (r[r.length - 1] !== 'there') return r;
      if (!npc.actor) continue;
      await B.cmd(/^Talk$/);
      await B.ready();
      await B.press(a.x < s.x ? 'a' : a.x > s.x ? 'd' : a.y < s.y ? 'w' : 's');
      await B.ready();
      if (B.menu() || g.commandPrompt === '') break;
    }
    // One conversation: every word in turn, the questions answered as told (or with the last answer offered).
    let round = 0;
    for (let steps = 0; steps < 200; steps++) {
      await B.ready();
      const m = B.menu();
      if (!m) {
        if (g.commandPrompt) break;
        await B.press('z');
        continue;
      }
      if (m.title === 'Say') {
        let pick = round++;
        if (only) pick = m.labels.findIndex((l, k) => k >= pick && only.test(l));
        if (pick < 0 || pick >= m.labels.length || m.labels[pick] === 'Take leave') {
          await B.pick(m.labels.length - 1);
          break;
        }
        round = only ? pick + 1 : round;
        out.push([m.labels[pick], '', []]);
        await B.pick(pick);
        await B.ready();
        continue;
      }
      const text = g.said.replace(/\s+/g, ' ').slice(-140);
      // The answer for the question asked last: the key found latest in the text.
      const want = Object.entries(answers)
        .filter(([key]) => text.includes(key))
        .sort((a, b) => text.lastIndexOf(b[0]) - text.lastIndexOf(a[0]))[0];
      let pick = want ? m.labels.findIndex((l) => new RegExp(want[1], 'i').test(l)) : -1;
      if (pick < 0) pick = m.labels.length - 1;
      out[out.length - 1][2].push([text.slice(-80), m.labels, m.labels[pick]]);
      await B.pick(pick);
      await B.ready();
      out[out.length - 1][1] = g.said.replace(/\s+/g, ' ').slice(-200);
    }
    for (const o of out) if (!o[1]) o[1] = '(see the next)';
    await B.closeMenus();
    return out;
  };
  B.talkTo = async (i, policy) => {
    const gen = B.gen;
    B.talking = i;
    let waits = 0;
    let bumps = 0;
    for (let n = 0; n < 400 && alive(gen); n++) {
      const s = g.s;
      const a = s.actors[s.npcs[i].actor];
      if (!a || !a.tile) return 'gone';
      if (a.z !== s.level) return 'on level ' + a.z;
      if (B.menu()) break;
      if (g.commandPrompt !== 'town') return 'interrupted:' + g.commandPrompt;
      const d = Math.abs(s.x - a.x) + Math.abs(s.y - a.y);
      if (d === 1) {
        const before = g.said;
        await B.press(a.x < s.x ? 'a' : a.x > s.x ? 'd' : a.y < s.y ? 'w' : 's');
        if (B.menu() || g.commandPrompt === '') break;
        // Only what this try brought, not the last sleeper's snoring (the text kept is the tail of a rolling window).
        const fresh = g.said === before ? '' : g.said.slice(Math.max(0, g.said.length - 80));
        if (/Zzzz/.test(fresh)) return 'asleep';
        if (/no response|not interested|cannot talk/i.test(fresh)) return 'silent';
        if (++bumps > 4) return 'would not talk';
        continue;
      }
      const p = B.path(a.x, a.y, true);
      if (!p || !p.length) {
        await B.press('x');
        if (++waits > 8) return 'nopath';
        continue;
      }
      await B.step(p[0]);
    }
    return B.talk(policy);
  };

  // --- the open country ---
  B.actors = null;
  import('/src/game/actors.ts').then((m) => {
    B.actors = m;
  });
  // The surface, or the Underworld beneath it: whichever the party is on (B.world follows the level).
  let surface = null,
    beneath = null;
  import('/src/data/maps.ts').then((maps) => {
    surface = maps.readBritannia(g.data.files, g.data.ovl).tiles;
    beneath = maps.readUnderworld(g.data.files).tiles;
  });
  Object.defineProperty(B, 'world', { get: () => (g.s.level === 0xff ? beneath : surface), configurable: true });
  const cost = (t) =>
    t === 4
      ? 25
      : t >= 5 && t <= 7
        ? 1
        : t === 8
          ? 2
          : t === 9
            ? 3
            : t === 0xa
              ? 4
              : t === 0xb
                ? 3
                : t === 0xe || t === 0xf
                  ? 2
                  : t >= 0x10 && t <= 0x1f
                    ? 1
                    : t >= 0x20 && t <= 0x3f
                      ? 1
                      : t >= 0x6a && t <= 0x6f
                        ? 1
                        : 0;
  B.wbad = new Set();
  B.route = (tx, ty) => {
    const W = B.world,
      s = g.s,
      N = 256;
    const dist = new Float64Array(N * N).fill(1e9);
    const prev = new Int32Array(N * N).fill(-1);
    const start = s.y * N + s.x,
      goal = ty * N + tx;
    // The moongates stand at night (20:00 to 5:00): a gate walked onto carries the party off, so none is crossed
    // unless it is where the party means to go.
    const gates = new Set();
    if (s.hour >= 20 || s.hour < 5)
      for (let i = 0; i < 8; i++) if (s.moonstoneHeld[i] === 0) gates.add(s.moonstoneY[i] * N + s.moonstoneX[i]);
    dist[start] = 0;
    const heap = [[0, start]];
    const push = (e) => {
      heap.push(e);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1,
            r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    while (heap.length) {
      const [d, c] = pop();
      if (d > dist[c]) continue;
      if (c === goal) break;
      const cx = c % N,
        cy = (c / N) | 0;
      for (const [dx, dy, facing] of [
        [0, -1, 0],
        [1, 0, 1],
        [0, 1, 2],
        [-1, 0, 3],
      ]) {
        const nx = (cx + dx + N) % N,
          ny = (cy + dy + N) % N;
        const n = ny * N + nx;
        const craft = s.partyTile >= 0x20 && s.partyTile < 0x30 ? (s.partyTile & 0xfc) + facing : s.partyTile;
        // Deep water under a skiff or the carpet is rough seas: a hurt to everyone each step, so a last resort.
        const rough = W[n] === 1 && ((s.partyTile & 0xfc) === 0x28 || (s.partyTile & 0xfe) === 0x14) ? 14 : 0;
        // On foot with the grapple, a mountain (not a peak) is climbed: the Klimb command, at a cost in falls.
        const climb = (s.partyTile === 0x1c || (s.partyTile & 0xfe) === 0x14) && s.grapple !== 0 && W[n] === 0x0c ? 6 : 0;
        // Afoot with a carpet in the pack, water and rivers are crossed by unrolling it (a few turns' cost).
        const unroll =
          s.partyTile === 0x1c && s.carpets > 0 && W[c] !== 0x0c && !B.actors.canEnter(g, 0x1c, W[n]) && B.actors.canEnter(g, 0x14, W[n])
            ? W[n] === 1
              ? 18 // and rough seas beyond
              : 4
            : 0;
        // The head of a waterfall: a party standing just above one is carried over it (outdoors.ts falls). The
        // Underworld's darkness round Doom (0xff) is no way at all without the Amulet worn (outdoors.ts intoDark).
        const brink = (W[((ny + 1) % N) * N + nx] & 0xfc) === 0xd4 || (W[n] === 0xff && s.level === 0xff && g.regalia !== 0x0e);
        const w =
          B.wbad.has(n + ':' + facing) || (gates.has(n) && n !== goal) || (B.avoid && B.avoid(nx, ny) && n !== goal) || brink
            ? 0
            : rough
              ? rough
              : climb
                ? climb
                : unroll
                  ? unroll
                  : B.actors && !B.actors.canEnter(g, craft, W[n])
                    ? 0
                    : (s.partyTile & 0xfc) === 0x1c
                      ? cost(W[n]) || (B.actors ? 2 : 0)
                      : W[n] === 4
                        ? 8
                        : 1;
        if (!w && n !== goal) continue;
        const nd = d + (w || 1);
        if (nd < dist[n]) {
          dist[n] = nd;
          prev[n] = c;
          push([nd, n]);
        }
      }
    }
    if (dist[goal] >= 1e9) return null;
    const steps = [];
    for (let c = goal; c !== start; c = prev[c]) {
      const p = prev[c];
      const cx = c % N,
        cy = (c / N) | 0,
        px = p % N,
        py = (p / N) | 0;
      steps.push((cy + 1) % N === py ? 'w' : (py + 1) % N === cy ? 's' : (px + 1) % N === cx ? 'd' : 'a');
    }
    return steps.reverse();
  };
  B.travel = async (x, y, maxSteps = 300) => {
    const gen = B.gen;
    let steps = 0;
    let p = null;
    while (steps < maxSteps && alive(gen)) {
      const s = g.s;
      if (s.mapId !== 0 || g.commandPrompt !== 'outdoors' || B.menu()) return 'stopped:' + g.commandPrompt + ':' + (B.menu()?.title ?? '');
      if (s.x === x && s.y === y) return 'arrived';
      // Rough seas (deep water under skiff or carpet) and climbing falls wear the party down: restored before
      // anyone is near death.
      if (s.members.slice(0, s.partySize).some((m) => m.hp > 0 && m.hp < Math.min(40, m.maxHp / 2))) await B.cheat('Full restore');
      p = B.route(x, y);
      // (Squares found blocked - by a creature since gone, as often as not - tried afresh before giving up.)
      if (!p && B.wbad.size) {
        B.wbad.clear();
        p = B.route(x, y);
      }
      if (!p) return 'nopath';
      const k = p[0];
      const [dx, dy] = DIR[k];
      const bx = s.x,
        by = s.y;
      if ((s.partyTile & 0xfe) === 0x14 && s.grapple !== 0 && B.world[((by + dy + 256) % 256) * 256 + ((bx + dx + 256) % 256)] === 0x0c) {
        await B.packCarpet(); // climbing is on foot; the carpet comes along in the pack
        continue;
      }
      const ahead = B.world[((by + dy + 256) % 256) * 256 + ((bx + dx + 256) % 256)];
      // (Not from a mountain top: the carpet is unrolled on level ground - targets.ts usableHere.)
      if (
        s.partyTile === 0x1c &&
        s.carpets > 0 &&
        B.world[by * 256 + bx] !== 0x0c &&
        !B.actors.canEnter(g, 0x1c, ahead) &&
        B.actors.canEnter(g, 0x14, ahead)
      ) {
        await B.fly(); // the carpet unrolled for the water ahead
        continue;
      }
      if (s.partyTile === 0x1c && B.world[((by + dy + 256) % 256) * 256 + ((bx + dx + 256) % 256)] === 0x0c) {
        await B.cmd(/^Climb$/);
        await B.ready();
        await B.press(k);
        await B.ready(3000);
        if (g.s.x === bx && g.s.y === by) return 'blocked: climb ' + g.said.replace(/\s+/g, ' ').slice(-40);
        steps++;
        continue;
      }
      await B.press(k);
      steps++;
      // Only a "Blocked!" that came of this very step (a ship turning her head prints nothing new).
      // (A creature in the way - a sea serpent about a carpet - moves on: only the ground is remembered.)
      const ahead2 = [(bx + dx + 256) % 256, (by + dy + 256) % 256];
      const someone = g.s.actors.some((a, i) => i > 0 && a.tile >= 0x80 && a.x === ahead2[0] && a.y === ahead2[1]);
      if (someone && g.s.x === bx && g.s.y === by) await B.pass();
      if (!someone && g.s.x === bx && g.s.y === by && g.commandPrompt === 'outdoors' && !B.menu() && /Blocked!\s*$/i.test(g.said))
        B.wbad.add(((by + dy + 256) % 256) * 256 + ((bx + dx + 256) % 256) + ':' + 'wdsa'.indexOf(k));
    }
    return 'more(' + p?.length + ')';
  };

  B.ladder = async (up) => {
    const m = g.map;
    let best = null;
    for (let i = 0; i < 1024; i++) {
      if (m[i] === (up ? 0xc8 : 0xc9)) {
        const p = B.path(i % 32, i >> 5, false);
        if (p && (!best || p.length < best[2])) best = [i % 32, i >> 5, p.length];
      }
    }
    if (!best) return 'no ladder';
    const lv = g.s.level;
    const r = await B.go(best[0], best[1]);
    if (r !== true) return r;
    await B.cmd(/^Climb/);
    await B.ready();
    if (B.menu()) await B.pick(up ? /up/i : /down/i);
    await B.ready();
    return 'level ' + lv + '->' + g.s.level;
  };
  B.leaveTown = async () => {
    // From an upper floor or a cellar, down or up to the ground first.
    if (g.s.mapId !== 0 && g.s.mapId < 0x21 && g.s.level !== 0) await B.seek(15, 30, 0);
    let r = await B.go(15, 31);
    // Walled in (doors to open, a lock to unlock): the way the seeker finds, then on to the gate.
    if (r !== true && g.s.mapId !== 0) {
      await B.seek(15, 30, 0, false, 400);
      r = await B.go(15, 31);
    }
    for (let i = 0; i < 40 && r !== true && g.s.mapId !== 0; i++) {
      if (g.commandPrompt === 'combat' || g.s.mapId >= 0x80) {
        await B.fight();
        await B.heal();
      } else if (B.menu() || !g.commandPrompt) await B.closeMenus();
      else await B.press('x x x');
      r = await B.go(15, 31);
    }
    for (let i = 0; i < 4 && g.s.mapId !== 0; i++) {
      if (B.menu()) break;
      await B.press('s');
    }
    await B.ready();
    if (B.menu()) await B.pick(/Yes/);
    await B.ready(5000);
    return [r, g.s.mapId, g.s.x, g.s.y];
  };
  B.jimmy = async (k) => {
    for (let t = 0; t < 6 && g.s.keys > 0; t++) {
      await B.cmd(/^Pick (chest )?lock/);
      await B.press(k);
      if (/Player/.test(B.st().said.slice(-30))) {
        const dex = [...Array(g.s.partySize).keys()].map((i) => (g.s.members[i].hp > 0 ? g.s.members[i].dex : 0));
        const best = dex.indexOf(Math.max(...dex));
        await B.press([...Array(best).fill('s'), 'z'].join(' '));
      }
      if (/nlocked/i.test(B.st().said.slice(-50))) return 'unlocked, keys ' + g.s.keys;
    }
    return 'failed: ' + B.st().said.slice(-80);
  };
  B.save = async () => {
    await B.pause(/^Save game/, false);
    await B.ready();
    if (B.menu()) await B.pick(/Yes/);
    await B.ready();
    return B.st().said.slice(-30);
  };
  // Ready what is named for a member (by index), from the pack: the Ready command, then the member, then the list.
  B.readyItem = async (who, name, again = false) => {
    await B.cmd(/^Ready$/);
    await B.ready();
    if (B.menu()?.title !== 'Ready') {
      // "Select:" in the stats pane: the highlight moves with the pad, from the top.
      for (let i = 0; i < who; i++) await B.press('s');
      await B.press('z');
      await B.ready();
    }
    const m = B.menu();
    if (!m || m.title !== 'Ready') return 'no list: ' + (m && m.title);
    // The list gives the short names (Sht. Sword): the long one asked for is matched to its short form.
    const long = g.data.table(0x17f6, 0x30);
    const short = g.data.table(0x1962, 0x38).map((n) => n.trim());
    const idx = long.findIndex((l) => new RegExp('^' + name + '$', 'i').test(l));
    // The menu's lines: the long or the short name, then a count and whether it is worn ("Long Sword x2 (hand)").
    const heads = (l) => l.replace(/ x\d+| \((hand|worn)\)/g, '');
    const i = m.labels.findIndex((l) => heads(l) === short[idx] || new RegExp('^' + name + '$', 'i').test(heads(l)));
    if (i < 0) {
      await B.closeMenus();
      return 'not held: ' + name;
    }
    await B.pick(i);
    await B.ready();
    let said = g.said.slice(-60);
    if (/hands must be free|free one of thy hands/i.test(said) && B.menu()?.title === 'Ready') {
      // A two-handed weapon: what the hands hold is put down first (picking a readied item unreadies it).
      const m2 = g.s.members[who];
      for (const slot of [2, 3]) {
        if (m2.equips[slot] === 0xff) continue;
        const j = B.menu()?.labels.findIndex((l) => heads(l) === short[m2.equips[slot]] || heads(l) === long[m2.equips[slot]]);
        if (j >= 0) {
          await B.pick(j);
          await B.ready();
        }
      }
      await B.closeMenus();
      if (!again) return B.readyItem(who, name, true);
      said = g.said.slice(-60);
    }
    await B.closeMenus();
    return said.replace(/\s+/g, ' ').trim();
  };
  // Bows and arrows back in the archers' hands after a fight that emptied the quiver (the game unreadies them).
  B.rearm = async () => {
    const names = g.data.table(0x17f6, 0x30);
    const out = [];
    for (let i = 0; i < g.s.partySize; i++) {
      const m = g.s.members[i];
      if (m.equips[2] !== 0xff || m.equips[3] !== 0xff) continue;
      // (A bow with no arrows, a crossbow with no quarrels, cannot be readied.)
      const ammo = { Bow: 0x1b, 'Magic Bow': 0x1b, Crossbow: 0x1d };
      const want = ['Magic Bow', 'Bow', 'Crossbow', 'Long Sword', 'Short Sword', 'Main Gauche', 'Club', 'Sling', 'Dagger'].find(
        (w) => g.s.equipment[names.indexOf(w)] > 0 && (!ammo[w] || g.s.equipment[ammo[w]] > 0),
      );
      if (!want) break;
      out.push(m.name + ': ' + (await B.readyItem(i, want)));
    }
    return out;
  };
  // Whatever healing the menu offers at its head, until it offers none (or nothing changes).
  B.heal = async () => {
    const cast = [];
    for (let n = 0; n < 12; n++) {
      await B.ready();
      if (!B.menu()) {
        B.key('z');
        await sleep(40);
        await B.ready();
      }
      const m = B.menu();
      const i = m ? m.labels.findIndex((l) => /^Cast \((Heal|Great heal|Cure)/i.test(l)) : -1;
      if (i < 0) {
        if (m) {
          B.key('x');
          await sleep(40);
          await B.ready();
        }
        break;
      }
      cast.push(m.labels[i]);
      await B.pick(i);
      await B.ready();
    }
    return cast;
  };
  B.talkAll = async (policy) => {
    const out = {};
    for (const v of B.npcs().filter((v) => v[2] > 0 && v[2] < 129 && v[5] === g.s.level)) {
      out[v[0]] = await B.talkTo(v[0], policy);
      if (g.commandPrompt === 'combat' || g.s.mapId >= 0x80) {
        out[v[0]] = 'a fight';
        await B.fight();
        await B.heal();
      }
    }
    return out;
  };
  B.load = async () => (0, eval)(await (await fetch('/node_modules/.pilot/bot.js?' + Date.now())).text());

  // --- by skiff and on foot: row to the landing that makes the whole journey shortest, leave the skiff, walk ---
  B.flood = (sx, sy, craftTile, maxCost = 4000) => {
    const W = B.world,
      N = 256;
    const dist = new Float64Array(N * N).fill(1e9);
    const start = sy * N + sx;
    dist[start] = 0;
    let frontier = [start];
    let d = 0;
    while (frontier.length && d < maxCost) {
      const next = [];
      for (const c of frontier) {
        const cx = c % N,
          cy = (c / N) | 0;
        [
          [0, -1, 0],
          [1, 0, 1],
          [0, 1, 2],
          [-1, 0, 3],
        ].forEach(([dx, dy, f]) => {
          const nx = (cx + dx + N) % N,
            ny = (cy + dy + N) % N;
          const n = ny * N + nx;
          if (dist[n] < 1e9) return;
          const craft = craftTile >= 0x20 && craftTile < 0x30 ? (craftTile & 0xfc) + f : craftTile;
          const climb = craftTile === 0x1c && g.s.grapple !== 0 && W[n] === 0x0c;
          // (Deep water is crossed by skiff and carpet at a cost in hurts, which B.route weighs.)
          if (!climb && !B.actors.canEnter(g, craft, W[n])) return;
          dist[n] = d + 1;
          next.push(n);
        });
      }
      frontier = next;
      d++;
    }
    return dist;
  };
  // The nearest boat of a kind (the party may own several, left at different docks).
  const nearest = (test) => {
    const s = g.s;
    const far = (a) => Math.min(Math.abs(a.x - s.x), 256 - Math.abs(a.x - s.x)) + Math.min(Math.abs(a.y - s.y), 256 - Math.abs(a.y - s.y));
    const boats = s.actors.filter((a, k) => k > 0 && a.z === 0 && test(a.tile));
    if (!boats.length) return null;
    boats.sort((a, b) => far(a) - far(b));
    return [boats[0].x, boats[0].y];
  };
  B.boats = () => g.s.actors.map((a, i) => [i, a.tile, a.x, a.y, a.b7]).filter((a) => a[1] >= 0x20 && a[1] < 0x2c);
  B.skiff = () => nearest((t) => (t & 0xfc) === 0x28);
  B.voyage = async (tx, ty) => {
    const log = [];
    const s = g.s;
    const N = 256;
    const direct = B.route(tx, ty);
    if ((s.partyTile & 0xfc) === 0x1c && direct && direct.length < 120) return [await B.trek(tx, ty)];
    if ((s.partyTile & 0xfc) === 0x1c) {
      const sk = B.skiff();
      if (!sk) return ['no skiff'];
      log.push(['to the skiff', await B.trek(sk[0], sk[1])]);
      if (s.x !== sk[0] || s.y !== sk[1]) return log;
      await B.cmd(/^Board/);
      await B.ready();
    }
    const sea = B.flood(s.x, s.y, s.partyTile);
    const land = B.flood(tx, ty, 0x1c);
    let best = null;
    for (let c = 0; c < N * N; c++) {
      if (sea[c] >= 1e9) continue;
      const cx = c % N,
        cy = (c / N) | 0;
      let walk = 1e9;
      for (const [dx, dy] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ]) {
        const n = ((cy + dy + N) % N) * N + ((cx + dx + N) % N);
        if (land[n] < walk) walk = land[n];
      }
      if (walk >= 1e9) continue;
      const total = sea[c] + walk * 1.5;
      if (!best || total < best[2]) best = [cx, cy, total, sea[c], walk];
    }
    if (!best) return [...log, 'no landing'];
    log.push(['landing', best]);
    log.push(await B.trek(best[0], best[1]));
    if (s.x !== best[0] || s.y !== best[1]) return log;
    await B.cmd(/^(Dismount|Disembark)/);
    await B.ready();
    log.push(B.st().said.slice(-24));
    log.push(await B.trek(tx, ty));
    return log;
  };

  // --- by frigate and carpet: sail the deep water to where the carpet can take over, fly the rest; and back ---
  B.ship = () => nearest((t) => t >= 0x20 && t < 0x28);
  B.aboard = () => g.s.partyTile >= 0x20 && g.s.partyTile < 0x28;
  B.toShip = async () => {
    if (B.aboard()) return 'aboard';
    const sh = B.ship();
    if (!sh) return 'no ship';
    await B.fly();
    const t = await B.trek(sh[0], sh[1]);
    if (g.s.x !== sh[0] || g.s.y !== sh[1]) return ['ship not reached', t];
    await B.cmd(/^Board/);
    await B.ready();
    return B.aboard() ? 'aboard' : 'not boarded: ' + B.st().said.slice(-40);
  };
  B.reach = async (tx, ty) => {
    const s = g.s;
    const log = [];
    if (!B.aboard()) {
      await B.fly();
      const direct = B.route(tx, ty);
      if (direct) {
        log.push(await B.trek(tx, ty));
        return log;
      }
      const a = await B.backToShip();
      log.push(a);
      if (!B.aboard()) return log;
    }
    const best = B.anchorage(tx, ty);
    if (!best) return [...log, 'no anchorage'];
    log.push(['anchorage', best]);
    log.push(await B.trek(best[0], best[1]));
    if (s.x !== best[0] || s.y !== best[1]) return log;
    await B.cmd(/^(Dismount|Disembark)/);
    await B.ready();
    log.push(B.st().said.slice(-30));
    if ((s.partyTile & 0xfc) === 0x28) {
      log.push(await B.voyage(tx, ty));
      return log;
    } // the frigate's skiff: row in, land, walk
    if (!((s.partyTile & 0xfe) === 0x14)) await B.fly();
    log.push(await B.trek(tx, ty));
    return log;
  };
  // Where to lie at anchor for a place: water the ship can reach, from which her skiff (or the carpet) can get to a
  // shore the party can walk from. Deep water is no place to launch a skiff.
  B.anchorage = (tx, ty) => {
    const s = g.s;
    const N = 256;
    const W = B.world;
    const sea = B.flood(s.x, s.y, 0x24);
    const carpet = s.carpets > 0;
    const air = B.flood(tx, ty, carpet ? 0x14 : 0x1c);
    if (carpet) {
      let best = null;
      for (let c = 0; c < N * N; c++) {
        if (sea[c] >= 1e9 || air[c] >= 1e9 || W[c] === 1) continue;
        const total = sea[c] * 1.2 + air[c];
        if (!best || total < best[2]) best = [c % N, (c / N) | 0, total, sea[c], air[c]];
      }
      return best;
    }
    // The skiff's reach, rowed out from every shore the party can walk to.
    const row = new Float64Array(N * N).fill(1e9);
    let frontier = [];
    for (let c = 0; c < N * N; c++) if (air[c] < 1e9) frontier.push(c);
    for (const c of frontier) row[c] = air[c];
    while (frontier.length) {
      const next = [];
      for (const c of frontier) {
        const cx = c % N,
          cy = (c / N) | 0;
        for (const [dx, dy, f] of [
          [0, -1, 0],
          [1, 0, 1],
          [0, 1, 2],
          [-1, 0, 3],
        ]) {
          const n = ((cy + dy + N) % N) * N + ((cx + dx + N) % N);
          if (W[n] === 1 || !B.actors.canEnter(g, 0x28 + f, W[n])) continue;
          if (row[c] + 1 < row[n]) {
            row[n] = row[c] + 1;
            next.push(n);
          }
        }
      }
      frontier = next;
    }
    let best = null;
    for (let c = 0; c < N * N; c++) {
      if (sea[c] >= 1e9 || row[c] >= 1e9 || W[c] === 1) continue;
      const total = sea[c] * 1.2 + row[c];
      if (!best || total < best[2]) best = [c % N, (c / N) | 0, total, sea[c], row[c]];
    }
    return best;
  };
  // Back aboard: on foot to the skiff, the skiff to the ship (or the carpet straight to her).
  B.backToShip = async () => {
    const s = g.s;
    const log = [];
    if (B.aboard()) return ['aboard'];
    const sh = B.ship();
    if (!sh) return ['no ship'];
    // The carpet flies straight to her where it can (a ship is boarded from the carpet, CMDS_070c).
    if ((s.partyTile & 0xfc) !== 0x28 && (s.carpets > 0 || (s.partyTile & 0xfe) === 0x14)) {
      await B.fly();
      if (B.route(sh[0], sh[1])) {
        log.push(['by carpet', (await B.trek(sh[0], sh[1])).slice(-1)]);
        if (s.x === sh[0] && s.y === sh[1]) {
          await B.cmd(/^Board/);
          await B.ready();
          if (B.aboard()) return [...log, 'aboard'];
        }
      }
    }
    if ((s.partyTile & 0xfc) !== 0x28) {
      const sk = B.skiff();
      if (sk) {
        if ((s.partyTile & 0xfe) === 0x14) {
          // The carpet cannot be left on the skiff's own square: off it first, to land beside.
          if (s.x === sk[0] && s.y === sk[1]) {
            const W = B.world,
              N = 256;
            for (const [dx, dy] of [
              [0, 1],
              [1, 0],
              [0, -1],
              [-1, 0],
            ]) {
              const nx = (sk[0] + dx) & 0xff,
                ny = (sk[1] + dy) & 0xff;
              if (!B.actors.canEnter(g, 0x1c, W[ny * N + nx])) continue;
              await B.press(dy > 0 ? 's' : dy < 0 ? 'w' : dx > 0 ? 'd' : 'a');
              await B.ready(3000);
              if (s.x !== sk[0] || s.y !== sk[1]) break;
            }
          }
          log.push(await B.packCarpet());
        }
        // The last step onto the skiff is walked (trek would unroll the carpet again for it).
        const stepOn = async () => {
          if (Math.abs(s.x - sk[0]) + Math.abs(s.y - sk[1]) !== 1) return;
          await B.press(sk[1] > s.y ? 's' : sk[1] < s.y ? 'w' : sk[0] > s.x ? 'd' : 'a');
          await B.ready(3000);
        };
        await stepOn();
        if (s.x !== sk[0] || s.y !== sk[1]) {
          log.push(['to the skiff', await B.trek(sk[0], sk[1])]);
          if ((s.partyTile & 0xfe) === 0x14) {
            log.push(await B.packCarpet());
            await stepOn();
          }
        }
        if (s.x !== sk[0] || s.y !== sk[1]) return log;
        await B.cmd(/^Board/);
        await B.ready();
      } else {
        log.push(await B.toShip());
        return log;
      }
    }
    log.push(['to the ship', await B.trek(sh[0], sh[1])]);
    if (s.x === sh[0] && s.y === sh[1]) {
      await B.cmd(/^Board/);
      await B.ready();
    }
    log.push(B.aboard() ? 'aboard' : 'not aboard: ' + B.st().said.slice(-40));
    return log;
  };
  // A round of places by ship: each reached, swept by day, and the ship regained.
  B.cruise = async (places) => {
    const out = [];
    B.tourLog = out;
    for (const [x, y, name] of places) {
      await B.closeMenus();
      const there = await B.reach(x, y);
      if (g.s.x !== x || g.s.y !== y) {
        out.push([name, 'not reached', JSON.stringify(there).slice(-160), B.st().at]);
        if (g.s.mapId !== 0) break;
        const b = await B.backToShip();
        if (!B.aboard()) {
          out.push(['adrift', b]);
          break;
        }
        continue;
      }
      const boatsBefore = B.boats();
      const p = await B.doPlace();
      out.push([name, p, B.st().time]);
      // The boats must be where they were left: a ship that moves while the party is indoors is a bug to catch.
      const boatsAfter = B.boats();
      if (JSON.stringify(boatsBefore) !== JSON.stringify(boatsAfter)) {
        out.push(['BOATS CHANGED', boatsBefore, boatsAfter]);
        console.warn('boats changed at ' + name, boatsBefore, boatsAfter);
      }
      if (g.s.mapId !== 0) {
        out.push('stuck inside ' + name);
        break;
      }
      if (g.s.food < 80) out.push(await B.cheat('Food +100'));
      const b = await B.backToShip();
      if (!B.aboard()) {
        out.push(['not back aboard', b]);
        break;
      }
    }
    return out;
  };

  // A square of the field a member may stand on: the void (0xff) round a room is not one, whatever the walking
  // table says of it (the engine's arenaFree rules it out).
  const arenaOk = (mine, t) => t !== 0xff && B.actors.canEnter(g, mine, t);
  // --- a room puzzle: one member walked and made to push, the others passing their turns (auto combat off) ---
  B.room = {};
  // Until it is `who`'s turn at the combat prompt with no menu up (others pass with B); false if it never comes.
  B.room.turn = async (who) => {
    for (let n = 0; n < 40; n++) {
      await B.ready(4000);
      if (g.commandPrompt !== 'combat' && g.s.mapId < 0x80) return false;
      if (B.menu()) {
        await B.press('x');
        continue;
      }
      if (g.commandPrompt !== 'combat') {
        await B.press('z');
        continue;
      }
      if (g.s.combatTurn === who) return true;
      await B.pass(); // (B is Escape once the field is won)
    }
    return false;
  };
  B.room.step = async (who, k) => {
    if (!(await B.room.turn(who))) return 'no turn';
    const c = g.combat[who];
    const [bx, by] = [c.x, c.y];
    await B.press(k);
    await B.ready(3000);
    return c.x === bx && c.y === by ? 'blocked' : 'stepped';
  };
  B.room.push = async (who, k) => {
    if (!(await B.room.turn(who))) return 'no turn';
    await B.cmd(/^Push/);
    await B.ready();
    await B.press(k);
    await B.ready(3000);
    return g.said.replace(/\s+/g, ' ').slice(-40);
  };
  B.room.cell = (x, y) => g.combatMap[y * 32 + x];
  // Deceit's bottom room, come up from the Underworld: the party is set down by the ladder in a walled chamber; the
  // walls that carry the room's triggers are pushed, one after another, until the way north opens (room 15 of
  // DUNGEON.CBT: every trigger lies on a wall). The party is set down close-packed, so each push is made by
  // whichever member can reach its square (the others stand where they are and pass).
  B.room.deceitBottom = async () => {
    const log = [];
    if (g.options.autoCombat) {
      await B.pause(/^Auto combat/);
      await B.ready();
    }
    let who = -1;
    // The way from `who`'s square to (tx, ty) over free squares: the square to step to next, or -1 for none.
    const wayTo = (who, tx, ty) => {
      const c = g.combat[who];
      const others = new Set(g.combat.filter((o, i) => i !== who && o.flags && !(o.flags & 0x20)).map((o) => o.y * 11 + o.x));
      const free = (x, y) => x >= 0 && y >= 0 && x < 11 && y < 11 && !others.has(y * 11 + x) && arenaOk(0x1c, B.room.cell(x, y));
      const start = c.y * 11 + c.x;
      if (c.x === tx && c.y === ty) return start;
      const prev = new Map([[start, -1]]);
      const q = [start];
      let end = -1;
      while (q.length && end < 0) {
        const cur = q.shift();
        for (const [dx, dy] of [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
        ]) {
          const nx = (cur % 11) + dx,
            ny = ((cur / 11) | 0) + dy;
          const k = ny * 11 + nx;
          if (prev.has(k) || !free(nx, ny)) continue;
          prev.set(k, cur);
          if (nx === tx && ny === ty) {
            end = k;
            break;
          }
          q.push(k);
        }
      }
      if (end < 0) return -1;
      let k = end;
      while (prev.get(k) !== start) k = prev.get(k);
      return k;
    };
    // A step at a time along the shortest way over free squares.
    const goTo = async (tx, ty) => {
      const c = g.combat[who];
      for (let n = 0; n < 40 && !(c.x === tx && c.y === ty); n++) {
        const start = c.y * 11 + c.x;
        const k = wayTo(who, tx, ty);
        if (k < 0) {
          log.push(['no way to', tx, ty, 'from', c.x, c.y]);
          return false;
        }
        const d = k - start;
        const key = d === -11 ? 'w' : d === 11 ? 's' : d === 1 ? 'd' : 'a';
        // A chest (or what came out of one) lying on the next square blocks it: opened, or picked up, from here.
        const lying = g.s.actors.find((a) => a.tile > 0 && a.tile < 0x10 && a.x === k % 11 && a.y === ((k / 11) | 0));
        if (lying) {
          if (!(await B.room.turn(who))) return false;
          await B.cmd(lying.tile === 1 ? /^Open/ : /^Get/);
          await B.ready();
          await B.press(key);
          await B.ready(3000);
          log.push([lying.tile === 1 ? 'opened' : 'got', g.said.replace(/\s+/g, ' ').slice(-40)]);
          continue;
        }
        const r = await B.room.step(who, key);
        if (r !== 'stepped') {
          log.push(['stuck at', c.x, c.y, r]);
          return false;
        }
      }
      return c.x === tx && c.y === ty;
    };
    // Each push from where it is made, and what it opens; a push already made (its squares floor) is skipped.
    const pushes = [
      [3, 9, 'a', [5, 5], [5, 6]],
      [5, 5, 'a', [6, 5], [7, 5]],
      [7, 5, 'd', [3, 5], [4, 5]],
      [3, 5, 'a', [8, 5], [9, 5]],
      [9, 5, 'd', [1, 5], [2, 5]],
      [2, 5, 'w', [5, 4], [5, 4]],
    ];
    for (const [x, y, k, a, b] of pushes) {
      if (B.room.cell(a[0], a[1]) === 0x44 && B.room.cell(b[0], b[1]) === 0x44) continue;
      // The last walker again if they can get there, else whoever can.
      if (who < 0 || wayTo(who, x, y) < 0) who = [0, 1, 2, 3, 4, 5].find((i) => g.combat[i].flags && wayTo(i, x, y) >= 0) ?? -1;
      if (who < 0) return [...log, `nobody can reach (${x},${y})`];
      if (!(await goTo(x, y))) return [...log, `could not reach (${x},${y})`];
      log.push([`push ${k} at (${x},${y})`, await B.room.push(who, k), B.room.cell(a[0], a[1]), B.room.cell(b[0], b[1])]);
    }
    return [...log, B.room.cell(5, 4) === 0x44 ? 'open' : 'still shut'];
  };
  // --- a fight: auto combat plays it (the bot presses nothing meanwhile); on the won field the bot loots and leaves ---
  // Off the field by its nearest edge, a member at a time (a fight that cannot be won or ended: foes in the water).
  B.flee = async () => {
    const s = g.s;
    const me = g.combat[s.combatTurn];
    if (!me) return 'nobody';
    const mine = s.actors[me.actor].tile;
    const cm = g.combatMap;
    const others = new Set(g.combat.filter((c, i) => i !== s.combatTurn && c.flags && !(c.flags & 0x20)).map((c) => c.y * 11 + c.x));
    const edge = (x, y) => x === 0 || y === 0 || x === 10 || y === 10;
    const start = me.y * 11 + me.x;
    const prev = new Map([[start, -1]]);
    const q = [start];
    let end = -1;
    while (q.length) {
      const c = q.shift();
      const cx = c % 11,
        cy = (c / 11) | 0;
      if (edge(cx, cy)) {
        end = c;
        break;
      }
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
        if (prev.has(n) || others.has(n) || !arenaOk(mine, cm[ny * 32 + nx])) continue;
        prev.set(n, c);
        q.push(n);
      }
    }
    if (end < 0) {
      await B.pass();
      return 'boxed in';
    }
    if (end === start) {
      const x = me.x,
        y = me.y;
      await B.press(x === 0 ? 'a' : x === 10 ? 'd' : y === 0 ? 'w' : 's');
      return 'off';
    }
    let c = end;
    while (prev.get(c) !== start) c = prev.get(c);
    const d = c - start;
    await B.press(d === -11 ? 'w' : d === 11 ? 's' : d === 1 ? 'd' : 'a');
    return 'step';
  };
  B.skipLoot = false;
  B.fight = async (exit = null) => {
    const gen = B.gen;
    const log = [];
    const t0 = performance.now();
    let fleeing = !!B.fleeAtOnce; // (B.fleeAtOnce: every fight run from, a member at a time off the field)
    let lootGivenUp = false;
    const ranged = new Set();
    if (!g.options.autoCombat) {
      await B.ready();
      if (g.commandPrompt === 'combat') {
        await B.pause(/^Auto combat/);
        log.push('auto on');
      }
    }
    // The field as it was: a ladder or a pit taken lands the party in another room, which is another fight
    // (its way out is the caller's to choose afresh). What was shot at was shot at in the last field.
    const field0 = Array.from({ length: 121 }, (_, k) => g.combatMap[((k / 11) | 0) * 32 + (k % 11)]);
    if (B.dng) B.dng.shotAt.clear();
    for (let n = 0; n < 4000 && alive(gen); n++) {
      if (g.commandPrompt !== 'combat' && g.s.mapId < 0x80) break;
      if (n % 8 === 0 && g.s.mapId >= 0x80) {
        let changed = 0;
        for (let k = 0; k < 121; k++) if (g.combatMap[((k / 11) | 0) * 32 + (k % 11)] !== field0[k]) changed++;
        if (changed > 40) return [...log, 'new room'];
      }
      if (!fleeing && g.s.battleWon === 0 && performance.now() - t0 > (B.fleeAfter ?? 90000)) {
        fleeing = true;
        log.push('fleeing');
        B.key('x');
        await sleep(300);
      }
      // (B.restoreAt: the player's Full restore, taken mid-fight when anyone falls below that share of their hit points.)
      if (B.restoreAt && g.s.mapId >= 0x80 && g.s.battleWon === 0 && performance.now() - (B.lastRestore || 0) > 1500) {
        const low = [...Array(g.s.partySize).keys()].some(
          (i) => g.s.members[i].status !== 0x44 && g.s.members[i].hp < g.s.members[i].maxHp * B.restoreAt,
        );
        if (low) {
          B.lastRestore = performance.now();
          log.push('restore');
          await B.cheat('Full restore');
          continue;
        }
      }
      if (!SC.waiter) {
        await sleep(60);
        continue;
      }
      const s = g.s;
      if (B.menu()) {
        B.key('x');
        await sleep(40);
        continue;
      }
      if (s.crosshair) {
        B.key('x');
        await sleep(40);
        continue;
      }
      if (g.commandPrompt !== 'combat') {
        B.key('z');
        await sleep(60);
        continue;
      }
      const foes = B.combatMod ? g.combat.filter((c, i) => c.flags && !(c.flags & 0x20) && B.combatMod.onMonsterSide(g, i)).length : 1;
      if (s.battleWon === 0 && foes > 0 && !fleeing && performance.now() - t0 > (B.fleeAfter ?? 90000)) {
        fleeing = true;
        log.push('fleeing');
        if (g.options.autoCombat) {
          await B.pause(/^Auto combat/);
        }
      }
      if (s.battleWon === 0 && foes > 0 && fleeing) {
        if (g.options.autoCombat) {
          await B.pause(/^Auto combat/);
          continue;
        }
        await B.flee();
        continue;
      }
      if (s.battleWon === 0 && foes > 0) {
        await sleep(80);
        if (SC.waiter && g.commandPrompt === 'combat' && !g.options.autoCombat) {
          // Handed back with foes out of reach (sharks about the ship): whoever has the turn takes up a sling or
          // the oil from the pack, so there is something to throw; then auto combat again.
          const me = g.combat[s.combatTurn];
          if (me && me.flags & 0x80 && !ranged.has(me.who) && (s.equipment[0x11] > 0 || s.equipment[0x13] > 0)) {
            ranged.add(me.who);
            log.push(me.who + ' arms: ' + (await B.readyItem(me.who, s.equipment[0x11] > 0 ? 'Sling' : 'Flaming Oil')));
            if (g.commandPrompt !== 'combat' || B.menu()) continue;
          }
          await B.pause(/^Auto combat/);
          log.push('auto back on');
        }
        continue;
      }
      const me = g.combat[s.combatTurn];
      // (B.skipLoot: chests left shut - their traps have killed a party deep in a dungeon.)
      const loot = B.skipLoot
        ? []
        : s.actors.map((a, i) => ({ i, t: a.tile, x: a.x, y: a.y })).filter((a) => a.i > 0 && a.t >= 1 && a.t <= 0xf);
      if (!loot.length) {
        if (exit !== null && s.combatFlags & 0x80) {
          log.push(await B.dng.roomExit(exit));
          continue;
        }
        await B.cmd(/^Leave combat/);
        log.push('left');
        await sleep(200);
        continue;
      }
      // The nearest piece the member can get beside, by the shortest way over free squares; a chest sealed in a
      // wall (a room's, until its trigger) is left. None to be had: the field is done with.
      const t = loot.find((a) => Math.abs(a.x - me.x) + Math.abs(a.y - me.y) === 1) ?? null;
      if (t) {
        const dx = t.x - me.x,
          dy = t.y - me.y;
        await B.cmd(t.t === 1 ? /^Open/ : /^Get/);
        await B.press(dx < 0 ? 'a' : dx > 0 ? 'd' : dy < 0 ? 'w' : 's');
        log.push((t.t === 1 ? 'open ' : 'get ') + g.said.replace(/\s+/g, ' ').slice(-50));
        continue;
      }
      const k = B.lootWay(me, loot);
      if (k === null) {
        if (!lootGivenUp) log.push('loot out of reach');
        lootGivenUp = true;
        if (exit !== null && s.combatFlags & 0x80) {
          log.push(await B.dng.roomExit(exit));
          continue;
        }
        await B.cmd(/^Leave combat/);
        log.push('left');
        await sleep(200);
        continue;
      }
      const bx = me.x,
        by = me.y;
      await B.press(k);
      if (me.x === bx && me.y === by) await B.pass();
    }
    return log;
  };
  // The key of the first step of the shortest way from `me` to a square beside any of `loot`, or null for none.
  B.lootWay = (me, loot) => {
    const s = g.s;
    const cm = g.combatMap;
    const mine = s.actors[me.actor].tile;
    const blocked = new Set(g.combat.filter((c) => c !== me && c.flags && !(c.flags & 0x20)).map((c) => c.y * 11 + c.x));
    for (const a of s.actors) if (a.tile > 0 && a.tile < 0x10) blocked.add(a.y * 11 + a.x);
    const beside = new Set();
    for (const a of loot)
      for (const [dx, dy] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ])
        beside.add((a.y + dy) * 11 + a.x + dx);
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
        if (prev.has(n) || blocked.has(n) || !arenaOk(mine, cm[ny * 32 + nx])) continue;
        prev.set(n, c);
        if (beside.has(n)) {
          end = n;
          break;
        }
        q.push(n);
      }
    }
    if (end < 0) return null;
    let c = end;
    while (prev.get(c) !== start) c = prev.get(c);
    const d = c - start;
    return d === -11 ? 'w' : d === 11 ? 's' : d === 1 ? 'd' : 'a';
  };
  B.enter = async () => {
    if (g.commandPrompt === 'combat' || g.s.mapId >= 0x80) {
      await B.fight();
      await B.heal();
    }
    await B.closeMenus();
    const fromBelow = g.s.level === 0xff;
    await B.cmd(/^Enter/);
    await B.ready(6000);
    // A dungeon entered from the Underworld sets the party down at the bottom, in cell (7, 7) of level 7 (as the
    // original's mainout does) - a room, as often as not, which the dungeon's helpers should know the cell of.
    if (fromBelow && g.s.mapId > 0x20) {
      B.dng.roomCell = [7, 7, 7];
      B.dng.roomEntry = 'up';
      B.dng.roomBad.clear();
    }
    // What was found impassable last time is tried afresh: doors get unlocked, people move on.
    for (const k of [...B.bad]) if (k.startsWith(g.s.mapId + ':')) B.bad.delete(k);
    return [g.s.mapId, B.st().said.slice(-40)];
  };
  // The map window the party sees (outdoors.ts): two chunks of sixteen each way. Set on arriving anywhere by
  // magic or from below so the party sits in its middle half (world.ts centreChunks), it slides a chunk at a
  // time whenever the party comes within five of its edge (stepParty). What Blink reaches depends on it.
  B.centreWindow = (x, y) => {
    let cx = x & 0xf0,
      cy = y & 0xf0;
    if ((x & 0xf) < 8) cx = (cx - 16) & 0xf0;
    if ((y & 0xf) < 8) cy = (cy - 16) & 0xf0;
    return [cx, cy];
  };
  // Where Blink (In Por) sets the party down from (x, y) in direction f with the window at (cx, cy): the farthest
  // grass square along the line within the window, as the original CAST_05dc walks it; null for none.
  B.blinkTo = (x, y, f, cx, cy) => {
    const W = B.world,
      N = 256;
    const [dx, dy] = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ][f];
    // The window is clipped at the map's edge (CAST_05dc's right and bottom are at most 256): no wrap.
    const right = Math.min(cx + 32, 256),
      bottom = Math.min(cy + 32, 256);
    let at = null;
    for (let px = x + dx, py = y + dy; px >= cx && px < right && py >= cy && py < bottom; px += dx, py += dy)
      if (W[py * N + px] === 5) at = [px, py];
    return at;
  };
  // A way across the Underworld's walled chambers: on foot (climbing what the grapple lets), and by Blink from
  // chamber to chamber (Gardner's "proper magic"). The search is over chambers and the windows the party can
  // have in them: the one it arrives with, and those walking to the chamber's edges slides it to. Steps are
  // ['walk', x, y] and ['blink', f, cx, cy] (the window the Blink wants); null for none.
  B.blinkPlan = (tx, ty) => {
    const s = g.s;
    const N = 256;
    const start = s.y * N + s.x;
    const goal = ty * N + tx;
    const region = new Int32Array(N * N).fill(-1);
    const regions = [];
    const floodFrom = (c) => {
      const id = regions.length;
      const cells = [c];
      region[c] = id;
      for (let i = 0; i < cells.length; i++) {
        const cx = cells[i] % N,
          cy = (cells[i] / N) | 0;
        for (const [dx, dy] of [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
        ]) {
          const n = ((cy + dy + N) % N) * N + ((cx + dx + N) % N);
          if (region[n] >= 0) continue;
          const t = B.world[n];
          // (With the carpet, rivers and lakes join chambers too - as the guide's way runs, by water.)
          const flyer = s.carpets > 0 || (s.partyTile & 0xfe) === 0x14;
          if ((B.world[((((n / N) | 0) + 1) % N) * N + (n % N)] & 0xfc) === 0xd4) continue; // a waterfall's brink
          if (!(B.actors.canEnter(g, 0x1c, t) || (s.grapple && t === 0x0c) || (flyer && t !== 1 && B.actors.canEnter(g, 0x14, t))))
            continue;
          region[n] = id;
          cells.push(n);
        }
      }
      regions.push(cells);
      return id;
    };
    floodFrom(start);
    if (region[goal] < 0) floodFrom(goal);
    if (region[goal] === region[start]) return [['walk', tx, ty]];
    // Within a window the party may only stand 5 to 26 in from its edges (a step past slides it), so what a
    // chamber offers under a window is the part of it, within those bounds, that joins where the party comes
    // in: the square it arrives on, or - after a slide - the line of squares it crossed the old edge along.
    const band = (id, w, entries) => {
      const [cx, cy] = w;
      const inside = (c) => {
        const rx = ((c % N) - cx) & 0xff,
          ry = (((c / N) | 0) - cy) & 0xff;
        return rx >= 5 && rx <= 26 && ry >= 5 && ry <= 26;
      };
      const have = new Set(regions[id].filter((c) => inside(c)));
      const seen = new Set(entries.filter((c) => have.has(c)));
      const queue = [...seen];
      for (let q = 0; q < queue.length; q++) {
        const c = queue[q];
        const x = c % N,
          y = (c / N) | 0;
        for (const [dx, dy] of [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
        ]) {
          const n = ((y + dy + N) % N) * N + ((x + dx + N) % N);
          if (!have.has(n) || seen.has(n)) continue;
          seen.add(n);
          queue.push(n);
        }
      }
      return seen;
    };
    // The windows to be had in a chamber from the one arrived with (and the squares usable under each): a
    // slide east needs a reachable square 27 past the window's left edge, west one at 4, and so north and south.
    const windows = (id, w0, entry) => {
      const first = band(id, w0, [entry]);
      const out = new Map([[w0.join(','), [w0, first]]]);
      const queue = [[w0, first]];
      for (let q = 0; q < queue.length; q++) {
        const [[cx, cy], usable] = queue[q];
        // The squares just beyond the band, reachable from it, that a step onto slides the window.
        const beyond = { e: [], w: [], s: [], n: [] };
        for (const c of usable) {
          const x = c % N,
            y = (c / N) | 0;
          for (const [dx, dy, side] of [
            [1, 0, 'e'],
            [-1, 0, 'w'],
            [0, 1, 's'],
            [0, -1, 'n'],
          ]) {
            const n = ((y + dy + N) % N) * N + ((x + dx + N) % N);
            if (region[n] !== id) continue;
            const rx = ((n % N) - cx) & 0xff,
              ry = (((n / N) | 0) - cy) & 0xff;
            if (side === 'e' && rx === 27) beyond.e.push(n);
            if (side === 'w' && rx === 4) beyond.w.push(n);
            if (side === 's' && ry === 27) beyond.s.push(n);
            if (side === 'n' && ry === 4) beyond.n.push(n);
          }
        }
        for (const [side, dx, dy] of [
          ['e', 16, 0],
          ['w', -16, 0],
          ['s', 0, 16],
          ['n', 0, -16],
        ]) {
          if (!beyond[side].length) continue;
          const w = [(cx + dx) & 0xff, (cy + dy) & 0xff];
          const key = w.join(',');
          const set = band(id, w, beyond[side]);
          if (!set.size) continue;
          if (out.has(key)) {
            for (const c of set) out.get(key)[1].add(c);
            continue;
          }
          out.set(key, [w, set]);
          queue.push([w, set]);
        }
      }
      return [...out.values()];
    };
    const startState = `${region[start]}:${s.chunkX},${s.chunkY}`;
    const prev = new Map([[startState, null]]);
    const queue = [[region[start], [s.chunkX, s.chunkY], start]];
    for (let q = 0; q < queue.length; q++) {
      const [id, w0, entry] = queue[q];
      const from = `${id}:${w0.join(',')}`;
      for (const [w, usable] of windows(id, w0, entry)) {
        const [cx, cy] = w;
        for (const c of usable) {
          const x = c % N,
            y = (c / N) | 0;
          for (let f = 0; f < 4; f++) {
            const to = B.blinkTo(x, y, f, cx, cy);
            if (!to) continue;
            const n = to[1] * N + to[0];
            if (region[n] < 0) floodFrom(n);
            const nid = region[n];
            const nw = B.centreWindow(to[0], to[1]);
            const key = `${nid}:${nw.join(',')}`;
            if (prev.has(key)) continue;
            prev.set(key, [from, x, y, f, cx, cy]);
            queue.push([nid, nw, n]);
            if (nid === region[goal]) {
              const steps = [['walk', tx, ty]];
              for (let at = key; prev.get(at); at = prev.get(at)[0]) {
                const [, lx, ly, ff, wx, wy] = prev.get(at);
                steps.unshift(['walk', lx, ly], ['blink', ff, wx, wy]);
              }
              return steps;
            }
          }
        }
      }
    }
    return null;
  };
  // The window slid to (cx, cy) by walking: to the nearest square of the chamber past the edge to be crossed,
  // a chunk at a time; false if it cannot be done from here.
  B.slideWindow = async (cx, cy) => {
    const s = g.s;
    const N = 256;
    for (let n = 0; n < 6 && (s.chunkX !== cx || s.chunkY !== cy); n++) {
      const dx = s.chunkX === cx ? 0 : ((cx - s.chunkX) & 0xff) === 16 ? 1 : -1;
      const dy = s.chunkY === cy ? 0 : ((cy - s.chunkY) & 0xff) === 16 ? 1 : -1;
      // The nearest square just past the edge to cross, reached without leaving the window on the way.
      const [wx0, wy0] = [s.chunkX, s.chunkY];
      const inBand = (x, y) => {
        const rx = (x - wx0) & 0xff,
          ry = (y - wy0) & 0xff;
        return rx >= 5 && rx <= 26 && ry >= 5 && ry <= 26;
      };
      const dist = new Map([[s.y * N + s.x, 0]]);
      const q = [s.y * N + s.x];
      let best = null;
      while (q.length && !best) {
        const c = q.shift();
        const x = c % N,
          y = (c / N) | 0;
        for (const [ddx, ddy] of [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
        ]) {
          const nx = (x + ddx) & 0xff,
            ny = (y + ddy) & 0xff;
          const n = ny * N + nx;
          if (dist.has(n)) continue;
          const t = B.world[n];
          if (!(B.actors.canEnter(g, 0x1c, t) || (s.grapple && t === 0x0c))) continue;
          const rx = (nx - wx0) & 0xff,
            ry = (ny - wy0) & 0xff;
          const ok =
            dx !== 0 ? (dx > 0 ? rx === 27 : rx === 4) && ry >= 5 && ry <= 26 : (dy > 0 ? ry === 27 : ry === 4) && rx >= 5 && rx <= 26;
          if (ok) {
            best = [nx, ny, dist.get(c) + 1];
            break;
          }
          if (!inBand(nx, ny)) continue;
          dist.set(n, dist.get(c) + 1);
          q.push(n);
        }
      }
      if (!best) return false;
      const [wx, wy] = [s.chunkX, s.chunkY];
      // The way there keeps within the window (a step past another edge would slide it the wrong way).
      B.avoid = (x, y) => {
        const rx = (x - wx) & 0xff,
          ry = (y - wy) & 0xff;
        return rx < 5 || rx > 26 || ry < 5 || ry > 26;
      };
      await B.trek(best[0], best[1]);
      B.avoid = null;
      if (s.chunkX === wx && s.chunkY === wy) return false;
    }
    return s.chunkX === cx && s.chunkY === cy;
  };
  // A square the route must not take, while set (the Blink walker keeps to the window it has arranged).
  B.avoid = null;
  B.blinkWay = async (tx, ty) => {
    const s = g.s;
    const log = [];
    // Planned afresh before each step: where the party stands, and what its window is, changes as it walks.
    for (let hops = 0; hops < 30; hops++) {
      const plan = B.blinkPlan(tx, ty);
      if (!plan) return [...log, 'no way'];
      log.push(['plan', plan.length]);
      let step = plan[0];
      if (step[0] === 'walk' && !(s.x === step[1] && s.y === step[2])) {
        // To a launch square, keeping within the window its Blink wants (else the walk would slide it).
        const want = plan[1] && plan[1][0] === 'blink' ? plan[1] : null;
        if (want && s.chunkX === want[2] && s.chunkY === want[3])
          B.avoid = (x, y) =>
            ((x - want[2]) & 0xff) < 5 || ((x - want[2]) & 0xff) > 26 || ((y - want[3]) & 0xff) < 5 || ((y - want[3]) & 0xff) > 26;
        const r = await B.trek(step[1], step[2]);
        B.avoid = null;
        log.push(['walk', step[1], step[2], r.at(-1)]);
        if (s.x !== step[1] || s.y !== step[2]) return [...log, 'stopped'];
        if (s.x === tx && s.y === ty) return [...log, 'arrived'];
        continue;
      }
      if (step[0] === 'walk') step = plan[1]; // standing on the launch square already: the Blink from it
      const [, f, cx, cy] = step;
      if (s.chunkX !== cx || s.chunkY !== cy) {
        const slid = await B.slideWindow(cx, cy);
        log.push(['window', cx, cy, slid, s.chunkX, s.chunkY]);
        if (!slid) return [...log, 'window not to be had'];
        continue; // and back to the launch square by the next plan
      }
      if (s.members[0].mp < 10) await B.cheat('Full restore');
      const [bx, by] = [s.x, s.y];
      await B.cmd(/^Cast$/);
      await B.ready();
      for (let k = 0; k < 6 && !(B.menu() && B.menu().title === 'Spells'); k++) {
        await B.press('z');
        await B.ready();
      }
      await B.pick(/Blink/i);
      await B.ready();
      await B.press('wdsa'[f]);
      await B.ready(5000);
      if (B.menu()) await B.closeMenus();
      log.push(['blink', f, bx, by, '->', s.x, s.y]);
      if (s.x === bx && s.y === by) return [...log, 'blink failed: ' + g.said.replace(/\s+/g, ' ').slice(-40)];
      if (s.x === tx && s.y === ty) return [...log, 'arrived'];
    }
    return [...log, 'short'];
  };
  // Travel, fighting what bars the way.
  B.trek = async (x, y) => {
    const gen = B.gen;
    const log = [];
    let idle = 0;
    for (let n = 0; n < 60 && alive(gen); n++) {
      const r = await B.travel(x, y, 400);
      if (r === 'arrived') return [...log, r];
      if (/combat/.test(r) || g.s.mapId >= 0x80) {
        log.push(['fight', await B.fight(), B.st().hp]);
        if (B.st().hp.some((h) => h === 0) && g.commandPrompt === 'outdoors') log.push(await B.cheat('Full restore'));
        else if (B.st().hp.some((h, i) => h < g.s.members[i].maxHp / 2)) await B.heal();
        continue;
      }
      if (/^more/.test(r)) continue;
      if (B.menu()) {
        // A toll asked, a question put: answered as the menus are closed (pay the trolls, keep walking).
        log.push('menu:' + B.menu().title);
        await B.closeMenus();
        continue;
      }
      if (g.commandPrompt === '') {
        // Text still going by (a bridge crossed, a sight seen): wait for the prompt rather than press keys into it.
        await B.ready(3000);
        if (g.commandPrompt === '' && !B.menu()) {
          B.key('z');
          await sleep(120);
        }
        if (++idle > 40) return [...log, 'stuck without a prompt'];
        continue;
      }
      log.push(r);
      if (r === 'nopath' || /^blocked/.test(r)) return log;
    }
    return log;
  };

  B.camp = async (h) => {
    await B.cmd(/^(Hole up|Sleep|Camp)$/);
    await B.ready();
    // The hours' dial starts at nine and goes to twenty-three: steered to `h` by what it shows.
    for (let i = 0; i < 30; i++) {
      const n = Number(B.menu()?.labels?.[0]);
      if (!Number.isFinite(n) || n === h) break;
      await B.press(n < h ? 'w' : 's');
    }
    await B.press('z');
    for (let i = 0; i < 12; i++) {
      await B.ready(6000);
      const st = B.st();
      if (st.prompt === 'outdoors' && !st.menu) break;
      if (st.prompt === 'combat') {
        await B.fight();
        continue;
      }
      if (st.menu) {
        if (!(await B.pick(/^No/))) await B.press('z');
      } else await B.press('z');
    }
    return B.st().time;
  };
  // In a settlement the night is slept in the nearest free bed (Hole up works only there), else passed standing.
  B.bedDown = async (h) => {
    const s = g.s;
    const z = sgn(s.level);
    const beds = [];
    for (let k = 0; k < 1024; k++) {
      if (g.map[k] !== 0xab) continue;
      const x = k & 31,
        y = k >> 5;
      if (s.actors.some((a, i) => i > 0 && a.tile && a.z === s.level && a.x === x && a.y === y)) continue;
      // Not a bed someone keeps by day (the sleeper is put out on its right, and may be boxed in there).
      const kept = [...Array(32).keys()].some((i) => {
        if (i === 0 || !s.npcTypes[i]) return false;
        const sc = s.schedules[i];
        return [0, 1, 2].some((k) => sc.z(k) === s.level && sc.y(k) === y && sc.x(k) >= x - 1 && sc.x(k) <= x + 1);
      });
      if (kept) continue;
      const plan = B.seekPlan(x, y, z);
      if (plan && !plan.some((p) => /:/.test(p))) beds.push([plan.length, x, y]);
    }
    beds.sort((a, b) => a[0] - b[0]);
    if (!beds.length) return 'no bed';
    const r = await B.seek(beds[0][1], beds[0][2], z, false, 300);
    if (r[r.length - 1] !== 'there') return r.slice(-1);
    await B.cmd(/^(Hole up|Sleep|Camp)$/);
    await B.ready();
    // The hours' dial starts at nine and goes to twenty-three: steered to `h` by what it shows.
    for (let i = 0; i < 30; i++) {
      const n = Number(B.menu()?.labels?.[0]);
      if (!Number.isFinite(n) || n === h) break;
      await B.press(n < h ? 'w' : 's');
    }
    await B.press('z');
    for (let i = 0; i < 12; i++) {
      await B.ready(6000);
      if (g.commandPrompt === 'town' && !B.menu()) break;
      await B.press('z');
    }
    return ['slept', ...B.st().time];
  };
  B.untilMorning = async () => {
    const out = [];
    if (g.s.mapId !== 0 && g.s.mapId < 0x80) {
      for (let i = 0; i < 3 && (g.s.hour >= 19 || g.s.hour < 8); i++) {
        const r = await B.bedDown(g.s.hour >= 19 ? 9 : Math.max(1, 8 - g.s.hour));
        out.push(r);
        if (r === 'no bed') return [...out, await B.untilHour(8)];
      }
      return out;
    }
    if ((g.s.hour >= 19 || g.s.hour < 8) && (g.s.partyTile & 0xfe) === 0x14) out.push(await B.packCarpet());
    for (let i = 0; i < 3 && (g.s.hour >= 19 || g.s.hour < 8); i++) out.push(await B.camp(g.s.hour >= 19 ? 9 : Math.max(1, 8 - g.s.hour)));
    return out;
  };
  // Across a counter: stand two squares from the keeper with the counter between, and Talk that way.
  B.counter = async (i) => {
    const s = g.s;
    const a = s.actors[s.npcs[i].actor];
    if (!a || a.z !== s.level) return 'not here';
    for (const [k, dx, dy] of [
      ['w', 0, 1],
      ['s', 0, -1],
      ['a', 1, 0],
      ['d', -1, 0],
    ]) {
      const mid = g.map[(a.y + dy) * 32 + a.x + dx];
      if (okT(mid)) continue;
      const cx = a.x + 2 * dx,
        cy = a.y + 2 * dy;
      if (cx < 0 || cy < 0 || cx > 31 || cy > 31 || !okT(g.map[cy * 32 + cx])) continue;
      const r = await B.seek(cx, cy, sgn(s.level), false, 300);
      if (r[r.length - 1] !== 'there') continue;
      await B.cmd(/^Talk/);
      await B.press(k);
      await B.ready();
      if (/Nobody's here/.test(g.said.slice(-40))) continue;
      return 'talking';
    }
    // No counter between (a wall taken for one, or the keeper about the shop): in by the door, and beside them.
    const r = await B.seek(a.x, a.y, sgn(s.level), true, 300);
    const dx = a.x - s.x,
      dy = a.y - s.y;
    if (Math.abs(dx) + Math.abs(dy) !== 1) return 'no counter: ' + r.slice(-1);
    await B.cmd(/^Talk/);
    await B.press(dx < 0 ? 'a' : dx > 0 ? 'd' : dy < 0 ? 'w' : 's');
    await B.ready();
    return 'talking';
  };
  // Rations at a pub: as many lots as asked, or as the gold allows.
  B.buyFood = async (lots) => {
    const keeper = B.npcs().find((v) => v[2] === 130 && v[5] === g.s.level);
    if (!keeper) return 'no pub';
    const c = await B.counter(keeper[0]);
    if (c !== 'talking') return c;
    const log = [];
    for (let n = 0; n < 30; n++) {
      await B.ready();
      const m = B.menu();
      const said = B.st().said;
      if (!m) {
        if (g.commandPrompt) break;
        B.key('z');
        await sleep(60);
        continue;
      }
      if (m.title === 'Choose') {
        await B.pick(/Rations/i);
        continue;
      }
      if (m.title === 'How many?') {
        for (let k = 1; k < lots; k++) await B.press('w');
        await B.press('z');
        log.push('asked ' + lots);
        lots = 0;
        continue;
      }
      if (m.labels.includes('Yes')) {
        await B.pick(lots > 0 && /serve thee|anything else/i.test(said.slice(-80)) ? /Yes/ : lots > 0 ? /Yes/ : /No/);
        continue;
      }
      await B.press('x');
    }
    log.push([g.s.food, g.s.gold]);
    return log;
  };
  // Arms from the armoury (fa 129): each [name, member or -1] bought and readied on the spot, or kept packed.
  B.buyArms = async (wants) => {
    const keeper = B.npcs().find((v) => v[2] === 129 && v[5] === g.s.level);
    if (!keeper) return 'no armourer';
    const c = await B.counter(keeper[0]);
    if (c !== 'talking') return c;
    const log = [];
    const queue = wants.slice();
    let current = null;
    for (let n = 0; n < 200; n++) {
      await B.ready();
      const m = B.menu();
      const said = g.said.replace(/\s+/g, ' ').slice(-160);
      if (!m) {
        if (g.commandPrompt) break;
        B.key('z');
        await sleep(60);
        continue;
      }
      if (m.title === 'Choose' && m.labels.some((l) => /^Buy$/i.test(l))) {
        if (!queue.length) {
          await B.press('x');
          continue;
        }
        await B.pick(/^Buy$/i);
        continue;
      }
      if (m.title === 'Choose') {
        // The wares, by their long or short names: the next wanted one on the list; none left, back out.
        const long = g.data.table(0x17f6, 0x30);
        const short = g.data.table(0x1962, 0x38).map((n) => n.trim());
        const label = (w) => {
          const k = long.findIndex((l) => l.toLowerCase() === w.toLowerCase());
          return m.labels.find((l) => l.toLowerCase() === w.toLowerCase() || (k >= 0 && l === short[k]));
        };
        const i = queue.findIndex((w) => label(w[0]));
        if (i < 0) {
          await B.press('x');
          continue;
        }
        current = queue.splice(i, 1)[0];
        await B.pick(m.labels.indexOf(label(current[0])));
        continue;
      }
      if (m.title === 'Ready it?') {
        const who = current && current[1] >= 0 ? g.s.members[current[1]].name.slice(0, 8) : null;
        const i = who ? m.labels.findIndex((l) => l.startsWith(who + ' (')) : -1;
        await B.pick(i >= 0 ? i : m.labels.length - 1);
        log.push([current && current[0], i >= 0 ? who : 'packed', g.s.gold]);
        continue;
      }
      if (m.labels.includes('Yes')) {
        const price = /gold|pay|take it|wilt thou/i.test(said);
        const more = /anything else|then\?/i.test(said);
        const yes = more ? queue.length > 0 : price ? g.s.gold >= 0 : true;
        await B.pick(yes ? /^Yes/ : /^No/);
        continue;
      }
      await B.press('x');
    }
    await B.closeMenus();
    return log;
  };
  // A ship from the shipwright (fa 132): a frigate, or a skiff for the one already owned. It waits at the dock.
  B.buyShip = async (skiff = false) => {
    const keeper = B.npcs().find((v) => v[2] === 132 && v[5] === g.s.level);
    if (!keeper) return 'no shipwright';
    const c = await B.counter(keeper[0]);
    if (c !== 'talking') return c;
    const log = [];
    let wanted = true;
    for (let n = 0; n < 30; n++) {
      await B.ready();
      const m = B.menu();
      const said = g.said.replace(/\s+/g, ' ').slice(-200);
      if (!m) {
        if (g.commandPrompt) break;
        B.key('z');
        await sleep(60);
        continue;
      }
      if (m.labels.some((l) => /^Frigates?$/i.test(l))) {
        await B.pick(skiff ? /^Skiffs?$/i : /^Frigates?$/i);
        log.push(skiff ? 'skiff' : 'frigate');
        continue;
      }
      if (m.labels.includes('Yes')) {
        // Interested? Yes. The price: yes, once. Anything else? No.
        const buying = /gold|price|\d+ ?g/i.test(said) && wanted;
        if (buying) wanted = false;
        const yes = buying || /interest|see (my|our)|seek|help thee|ships?\?|boats?\?|vessel/i.test(said) ? wanted || buying : false;
        await B.pick(yes ? /^Yes/ : /^No/);
        log.push((yes ? 'yes: ' : 'no: ') + said.slice(-70));
        continue;
      }
      await B.press('x');
    }
    log.push([g.s.gold, g.s.boughtShip, g.s.shipX, g.s.shipY]);
    return log;
  };
  // A shrine: reached on the carpet (or afoot), entered, the virtue and its mantra given thrice from the menus.
  B.shrine = async (v) => {
    const s = g.s;
    const xs = g.data.bytes(0x1f6e, 8),
      ys = g.data.bytes(0x1f76, 8);
    const virtue = g.data.table(0x1f4e, 8)[v];
    const mantra = g.data.table(0x1f5e, 8)[v];
    const log = [];
    log.push((await B.reach(xs[v], ys[v])).slice(-1));
    if (s.x !== xs[v] || s.y !== ys[v]) return [...log, 'not reached', B.st().at];
    if ((s.partyTile & 0xfe) === 0x14) log.push(await B.packCarpet());
    if (s.x !== xs[v] || s.y !== ys[v]) log.push((await B.trek(xs[v], ys[v])).slice(-1));
    await B.cmd(/^Enter/);
    await B.ready(8000);
    for (let n = 0; n < 40; n++) {
      await B.ready(8000);
      const m = B.menu();
      if (m && m.title === 'Virtue') {
        log.push('virtue: ' + (await B.pick(new RegExp('^' + virtue + '$', 'i'))));
        continue;
      }
      if (m && m.title === 'Mantra') {
        log.push('mantra: ' + (await B.pick(new RegExp('^' + mantra + '$', 'i'))));
        continue;
      }
      if (m && m.title === 'Amount') {
        // Gold offered when nothing is owed: none.
        await B.press('x');
        continue;
      }
      if (m) {
        log.push('menu ' + m.title);
        await B.press('x');
        continue;
      }
      if (g.commandPrompt === 'outdoors') break;
      await B.press('z');
    }
    log.push(g.said.replace(/\s+/g, ' ').slice(-160));
    return log;
  };
  // To the Codex on the Isle of the Avatar (by ship and carpet), and up to it past its guardian at (233, 235),
  // who lets a seeker on a quest by; read, it answers the quest ordained first.
  B.codex = async () => {
    const s = g.s;
    const log = [];
    log.push(['reach', (await B.reach(233, 237)).slice(-2)]);
    if (s.x !== 233 || s.y !== 237) return [...log, 'not reached', s.x, s.y];
    if ((s.partyTile & 0xfe) === 0x14) log.push(['pack', await B.packCarpet()]);
    if (s.x !== 233 || s.y !== 237) log.push(['back', (await B.trek(233, 237)).slice(-1)]);
    const before = s.questDone;
    for (let n = 0; n < 40 && s.questDone === before; n++) {
      await B.ready(8000);
      if (B.menu()) {
        await B.press('x');
        continue;
      }
      if (!g.commandPrompt) {
        await B.press('z');
        continue;
      }
      if (g.commandPrompt === 'combat' || s.mapId >= 0x80) {
        await B.fight();
        continue;
      }
      if (s.y > 233) {
        await B.press('w');
        continue;
      }
      // On the Codex's square: Entered, as a shrine is; the reading is a page at a time.
      await B.cmd(/^Enter/);
      for (let k = 0; k < 40 && s.questDone === before; k++) {
        await B.ready(8000);
        if (B.menu()) await B.press('x');
        else if (!g.commandPrompt) await B.press('z');
        else break;
      }
    }
    for (let n = 0; n < 30 && !g.commandPrompt; n++) {
      await B.press('z');
      await B.ready(4000);
    }
    log.push(['read', before, s.questDone, g.said.replace(/\s+/g, ' ').slice(-120)]);
    return log;
  };
  // The Shrine of Spirituality, which no road reaches: through a moongate as the day turns, the gate's square
  // held from a little before midnight.
  B.spirituality = async () => {
    const s = g.s;
    const log = [];
    let best = null;
    for (let i = 0; i < 8; i++) {
      if (s.moonstoneHeld[i] !== 0) continue;
      const d = Math.abs(s.moonstoneX[i] - s.x) + Math.abs(s.moonstoneY[i] - s.y);
      if (!best || d < best[0]) best = [d, s.moonstoneX[i], s.moonstoneY[i]];
    }
    if (!best) return ['no gate known'];
    await B.fly();
    // Beside the gate until 23:50, then onto it (a gate stood on is not ridden until the party steps on).
    log.push((await B.trek(best[1], best[2] + 1)).slice(-1));
    if (s.x !== best[1] || s.y !== best[2] + 1) log.push((await B.trek(best[1] + 1, best[2])).slice(-1));
    if ((s.partyTile & 0xfe) === 0x14) log.push(await B.packCarpet());
    while (!(s.hour === 23 && s.minute >= 50) && !(s.hour === 0 && s.minute < 8)) {
      if (g.commandPrompt === 'combat' || s.mapId >= 0x80) {
        await B.fight();
        continue;
      }
      if (B.menu() || !g.commandPrompt) {
        await B.closeMenus();
        continue;
      }
      if (s.hour < 22 && s.hour >= 5) {
        await B.camp(Math.min(9, 23 - s.hour));
        continue;
      }
      await B.press('x');
    }
    if (s.hour === 23) {
      while (s.hour === 23) await B.press('x');
    }
    const dir = s.x < best[1] ? 'd' : s.x > best[1] ? 'a' : s.y < best[2] ? 's' : 'w';
    // Onto the gate: a press now and then may be lost to the turn in hand, so it is made until the ride begins.
    for (let t = 0; t < 6 && s.mapId === 0 && !(s.x === best[1] && s.y === best[2]); t++) {
      await B.press(dir);
      await B.ready(15000);
    }
    for (let n = 0; n < 60; n++) {
      await B.ready(15000);
      if (g.commandPrompt === 'outdoors' && s.mapId === 0) break;
      const m = B.menu();
      if (m && m.title === 'Virtue') {
        log.push('virtue: ' + (await B.pick(/^Spirituality$/i)));
        continue;
      }
      if (m && m.title === 'Mantra') {
        log.push('mantra: ' + (await B.pick(new RegExp('^' + g.data.table(0x1f5e, 8)[6] + '$', 'i'))));
        continue;
      }
      if (m && m.title === 'Amount') {
        await B.press('x');
        continue;
      }
      if (m) log.push('menu ' + m.title);
      await B.press(m ? 'x' : 'z');
    }
    log.push(g.said.replace(/\s+/g, ' ').slice(-200));
    log.push(['done', s.questDone, 'active', s.questActive]);
    return log;
  };
  // The cheats, reached as a player reaches them: Pause, Cheats. Only what grinding would give - never an item of
  // the quest, a word, an unsealed dungeon or a journey.
  const GRIND =
    /^(Full restore|Raise every level|Gold \+500|Food \+100|Gems, keys, torches|Glass swords \+5|Reagents|Mix 10 of every spell|Auto kill: (Off|On)|Slay every foe)$/;
  B.cheat = async (...labels) => {
    const done = [];
    for (const label of labels) {
      if (!GRIND.test(label)) {
        done.push('refused: ' + label);
        continue;
      }
      // Escape: the Pause menu, as a keyboard's player opens it (Start on a pad).
      await B.ready();
      B.key('Escape');
      await sleep(60);
      await B.ready();
      await B.pick(/^Cheats/);
      await B.ready();
      if (B.menu()?.title !== 'Cheats') {
        done.push('no cheats menu: ' + B.menu()?.title);
        break;
      }
      await B.pick(new RegExp('^' + label.replace(/[+]/g, '\\+') + '$'));
      await B.ready();
      for (let i = 0; i < 8 && (B.menu() || !g.commandPrompt); i++) {
        if (B.menu()?.title === 'Paused') {
          await B.pick(/^Resume/);
          break;
        }
        B.key('x');
        await sleep(60);
        await B.ready();
      }
      done.push(label);
    }
    await B.closeMenus();
    return [done, B.st().gold, B.st().food, B.st().hp];
  };
  B.closeMenus = async () => {
    for (let i = 0; i < 14; i++) {
      await B.ready(2000);
      await sleep(120);
      const m = B.menu();
      if (!m) {
        if (g.commandPrompt && !g.paused) return true;
        B.key('x');
        await sleep(150);
        continue;
      }
      if (m.title === 'Paused') {
        await B.pick(/^Resume/);
        continue;
      }
      if (m.labels.includes('Yes') && /Dost thou pay|come quietly|half thy gold|tribute/i.test(g.said.replace(/\s+/g, ' ').slice(-160))) {
        await B.pick(/^Yes/);
        continue;
      }
      B.key('x');
      await sleep(120);
    }
    return false;
  };
  // Off the carpet and the carpet into the pack: X-it, a step aside, and Get it back (else it lies where it was left).
  B.packCarpet = async () => {
    const s = g.s;
    if ((s.partyTile & 0xfe) !== 0x14) return 'not riding';
    // Not while a fight is ending: an X-it then lands the carpet in the arena, and it is gone with it.
    for (let i = 0; i < 40 && (g.commandPrompt !== 'outdoors' || s.mapId !== 0 || B.menu()); i++) {
      if (B.menu()) await B.closeMenus();
      else await sleep(150);
    }
    if (g.commandPrompt !== 'outdoors' || s.mapId !== 0) return 'not out in the world';
    await B.cmd(/^(Dismount|Disembark)/);
    await B.ready();
    if ((s.partyTile & 0xfe) === 0x14) return 'could not land: ' + g.said.replace(/\s+/g, ' ').slice(-30);
    const x0 = s.x,
      y0 = s.y;
    for (const [k, back] of [
      ['d', 'a'],
      ['a', 'd'],
      ['s', 'w'],
      ['w', 's'],
    ]) {
      await B.press(k);
      if (s.x === x0 && s.y === y0) continue;
      await B.cmd(/^Get/);
      await B.press(back);
      await B.ready();
      if (/Player/.test(g.said.slice(-30))) {
        await B.press('z');
        await B.ready();
      }
      return s.carpets > 0 ? 'packed' : 'not got: ' + g.said.replace(/\s+/g, ' ').slice(-40);
    }
    // Hemmed in by mountains: climb onto one with the grapple and take the carpet up from there.
    if (s.grapple !== 0) {
      for (const [k, back, dx, dy] of [
        ['d', 'a', 1, 0],
        ['a', 'd', -1, 0],
        ['s', 'w', 0, 1],
        ['w', 's', 0, -1],
      ]) {
        if (B.world[((y0 + dy + 256) % 256) * 256 + ((x0 + dx + 256) % 256)] !== 0x0c) continue;
        await B.cmd(/^Climb$/);
        await B.ready();
        await B.press(k);
        await B.ready(3000);
        if (s.x === x0 && s.y === y0) continue;
        await B.cmd(/^Get/);
        await B.press(back);
        await B.ready();
        if (/Player/.test(g.said.slice(-30))) {
          await B.press('z');
          await B.ready();
        }
        return s.carpets > 0 ? 'packed from the rocks' : 'not got: ' + g.said.replace(/\s+/g, ' ').slice(-40);
      }
    }
    return 'nowhere to step';
  };
  B.fly = async () => {
    if ((g.s.partyTile & 0xfe) === 0x14) return 'flying';
    const here = g.s.actors.findIndex((a, k) => k > 0 && a.tile === 0x1b && a.x === g.s.x && a.y === g.s.y);
    if (here > 0) {
      await B.cmd(/^Board/);
      await B.ready();
      return 'boarded';
    }
    if (g.s.carpets > 0) {
      await B.cmd(/^Use item/);
      await B.ready();
      await B.pick(/carpet|crpt/i);
      await B.ready();
      return 'unrolled';
    }
    return 'no carpet';
  };
  B.tour2 = async (places) => {
    const out = [];
    B.tourLog = out;
    for (const [x, y, name] of places) {
      await B.closeMenus();
      await B.fly();
      const t = await B.trek(x, y);
      if (g.s.x !== x || g.s.y !== y) {
        out.push([name, 'not reached', t.slice(-2), B.st().at]);
        if (g.s.mapId !== 0) break;
        continue;
      }
      await B.untilMorning();
      const p = await B.doPlace();
      out.push([name, p, B.st().time]);
      if (g.s.mapId !== 0) {
        out.push('stuck inside ' + name);
        break;
      }
      if (g.s.food < 60) out.push(await B.cheat('Food +100'));
    }
    return out;
  };
  // A whole place: everyone on every floor the ladders reach, then out by the south gate.
  // --- a place as a whole: every floor from the player's files, joined by ladders (Klimb) and stairs (walked onto
  // the way they face); locked doors are jimmied where there are keys, hidden ones searched for. One step at a time.
  B.maps = null;
  import('/src/data/maps.ts').then((m) => {
    B.maps = m;
  });
  const sgn = (lv) => (lv > 0x80 ? lv - 256 : lv);
  B.floor = (lv) => {
    const loc = g.data.locations[g.s.mapId - 1];
    if (lv === sgn(g.s.level)) return g.map;
    if (!loc.levels || !loc.levels.includes(lv)) return null;
    return B.maps.readTownLevel(g.data.files, loc, lv).tiles;
  };
  // A door locked by magic opens to the spell for it, cast at it (the caster must have the circle and the points).
  B.magicSpell = () => {
    const m = B.magicMod;
    if (!m) return -1;
    return m.SPELL_EFFECTS.findIndex((e) => /^magic unlock$/i.test(e));
  };
  import('/src/game/magic.ts').then((m) => {
    B.magicMod = m;
  });
  B.canUnlockMagic = () => {
    const i = B.magicSpell();
    return i >= 0 && g.s.mixtures[i] > 0;
  };
  // A skull key at a magic lock: Use item, the key from the list, the direction.
  B.skullUnlock = async (k) => {
    await B.cmd(/^Use item$/);
    await B.ready();
    const m = B.menu();
    if (!m || m.title !== 'Items') return 'no items menu: ' + (m && m.title);
    const i = m.labels.findIndex((l) => /skull/i.test(l));
    if (i < 0) {
      await B.closeMenus();
      return 'no skull key in the list';
    }
    await B.pick(i);
    await B.ready();
    await B.press(k);
    await B.ready(3000);
    return 'skull key: ' + g.said.replace(/\s+/g, ' ').slice(-40);
  };
  B.magicUnlock = async (k) => {
    await B.cmd(/^Cast$/);
    await B.ready();
    for (let n = 0; n < 6; n++) {
      const m = B.menu();
      if (m && m.title === 'Spells') {
        await B.pick(/Magic unlock/i);
        break;
      }
      await B.press('z');
      await B.ready();
    }
    await B.ready();
    await B.press(k);
    await B.ready();
    return 'magic unlock: ' + B.st().said.slice(-20);
  };
  B.seekPlan = (tx, ty, tz, adjacent) => {
    const s = g.s;
    const z0 = sgn(s.level);
    const key = (z, x, y) => (z + 2) * 1024 + y * 32 + x;
    const start = key(z0, s.x, s.y);
    const dist = new Map([[start, 0]]);
    const prev = new Map();
    const open = [[0, start]];
    let end = -1;
    // Who stands where, on every floor (those not on this one are where the table says): the same view from any
    // floor, or the plan flips between floors as each looks emptier from the other.
    const occ = new Set();
    s.actors.forEach((a, i) => i > 0 && a.tile && isBody(a) && a.z === s.level && occ.add(key(sgn(a.z), a.x, a.y)));
    for (let i = 1; i < 32; i++) {
      const n = s.npcs[i];
      if (s.npcTypes[i] && !n.actor) occ.add(key(sgn(n.z), n.x, n.y));
    }
    while (open.length) {
      open.sort((a, b) => a[0] - b[0]);
      const [d, c] = open.shift();
      if (d > dist.get(c)) continue;
      const z = Math.floor(c / 1024) - 2,
        x = c % 32,
        y = (c >> 5) & 31;
      if (z === tz && (adjacent ? Math.abs(x - tx) + Math.abs(y - ty) === 1 : x === tx && y === ty)) {
        end = c;
        break;
      }
      const m = B.floor(z);
      if (!m) continue;
      const push = (n, w, how) => {
        if (!dist.has(n) || d + w < dist.get(n)) {
          dist.set(n, d + w);
          prev.set(n, [c, how]);
          open.push([d + w, n]);
        }
      };
      const here = m[y * 32 + x];
      if (here === 0xc8 && B.floor(z + 1)) push(key(z + 1, x, y), 3, 'up');
      if (here === 0xc9 && B.floor(z - 1)) push(key(z - 1, x, y), 3, 'down');
      [
        [0, -1, 0, 'w'],
        [1, 0, 1, 'd'],
        [0, 1, 2, 's'],
        [-1, 0, 3, 'a'],
      ].forEach(([dx, dy, f, k]) => {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx > 31 || ny > 31) return;
        const t = m[ny * 32 + nx];
        if (B.bad.has(s.mapId + ':' + ((z + 256) & 255) + ':' + (ny * 32 + nx))) return;
        // Someone in the way will move on: going round by another floor, where nobody can be seen, only comes back to them.
        const crowd = occ.has(key(z, nx, ny)) && !(nx === tx && ny === ty && z === tz) ? 40 : 0;
        if (crowd && (t === 0xab || t === 0xac)) return; // but a sleeper stays till morning
        if (t >= 0xc4 && t <= 0xc7) {
          const up = t - 0xc4 === f,
            down = t - 0xc4 === (f ^ 2);
          const nz = up ? z + 1 : down ? z - 1 : z;
          if (nz !== z && !B.floor(nz)) return;
          push(key(nz, nx, ny), 2 + crowd, k);
          return;
        }
        if (t === 0x97 || t === 0x98) {
          // A magic lock: the spell, or a skull key where magic is absorbed (Blackthorn's palace) or none is mixed.
          const absorbed = (s.mapId === 0x12 && s.crown === 0) || s.mapId === 0x1d;
          if (B.canUnlockMagic() && !absorbed) push(key(z, nx, ny), 20, 'magic:' + k);
          else if (s.skullKeys > 0) push(key(z, nx, ny), 20, 'skull:' + k);
          return;
        }
        if (t === 0xb9 || t === 0xbb) {
          if (s.keys > 0) push(key(z, nx, ny), 12, 'jimmy:' + k);
          return;
        }
        if (t === 0x4e) {
          push(key(z, nx, ny), 15, 'search:' + k);
          return;
        }
        if (t === 0xbc) {
          push(key(z, nx, ny), 25, k);
          return;
        } // through a fireplace, burning: where a way is hidden behind one
        if (t === 0x8c) {
          // A trapdoor drops the party a floor (at Stonegate, into the lava; in Blackthorn's palace, into his hands: never).
          if (s.mapId !== 0x1d && s.mapId !== 0x12 && B.floor(z - 1)) push(key(z - 1, nx, ny), 6, k);
          return;
        }
        if (okT(t)) push(key(z, nx, ny), 1 + crowd, k);
      });
    }
    if (end < 0) return null;
    const steps = [];
    for (let c = end; c !== start; c = prev.get(c)[0]) steps.push(prev.get(c)[1]);
    return steps.reverse();
  };
  // Where the party has been in this place, a square at a time (B.retrace walks it back, the way it came).
  B.trail = [];
  B.retrace = async (to = 0) => {
    const log = [];
    for (let i = B.trail.length - 2; i >= to; i--) {
      const [z, x, y] = B.trail[i];
      const r = await B.seek(x, y, z, false, 60);
      if (r[r.length - 1] !== 'there') return [...log, 'lost the way at ' + i, r.slice(-2)];
      B.trail.length = i + 1;
    }
    return [...log, 'back'];
  };
  B.seek = async (tx, ty, tz = sgn(g.s.level), adjacent = false, maxSteps = 400) => {
    const gen = B.gen;
    const log = [];
    let stalls = 0;
    let crowded = 0;
    const mark = () => {
      const s = g.s;
      const here = [sgn(s.level), s.x, s.y, s.mapId];
      const last = B.trail[B.trail.length - 1];
      if (last && last[3] !== s.mapId) B.trail.length = 0;
      if (!last || last[0] !== here[0] || last[1] !== here[1] || last[2] !== here[2] || last[3] !== here[3]) B.trail.push(here);
    };
    mark();
    for (let n = 0; n < maxSteps && alive(gen); n++) {
      mark();
      const s = g.s;
      if (s.mapId === 0 || s.mapId >= 0x80) return [...log, 'left the place'];
      if (B.menu() || g.commandPrompt !== 'town') return [...log, 'interrupted:' + g.commandPrompt];
      const z = sgn(s.level);
      if (z === tz && (adjacent ? Math.abs(s.x - tx) + Math.abs(s.y - ty) === 1 : s.x === tx && s.y === ty)) return [...log, 'there'];
      const plan = B.seekPlan(tx, ty, tz, adjacent);
      if (!plan) {
        if (++stalls > 5) return [...log, 'no plan'];
        await B.press('x x x x x x');
        continue;
      }
      const step = plan[0];
      if (step === 'up' || step === 'down') {
        await B.cmd(/^Climb/);
        await B.ready();
        if (B.menu()) await B.pick(step === 'up' ? /up/i : /down/i);
        await B.ready(4000);
        log.push(step);
        continue;
      }
      if (step.startsWith('magic:')) {
        log.push(await B.magicUnlock(step.slice(6)));
        continue;
      }
      if (step.startsWith('jimmy:')) {
        log.push(await B.jimmy(step.slice(6)));
        continue;
      }
      if (step.startsWith('skull:')) {
        log.push(await B.skullUnlock(step.slice(6)));
        continue;
      }
      if (step.startsWith('search:')) {
        await B.cmd(/^Search/);
        await B.press(step.slice(7));
        if (/Player/.test(B.st().said.slice(-30))) await B.press('z');
        log.push('searched');
        continue;
      }
      const [ddx, ddy] = { w: [0, -1], d: [1, 0], s: [0, 1], a: [-1, 0] }[step] || [0, 0];
      if (s.actors.some((a, i) => i > 0 && a.tile && isBody(a) && a.z === s.level && a.x === s.x + ddx && a.y === s.y + ddy)) {
        if (++crowded > 25) return [...log, 'someone in the way'];
        await B.press('x');
        continue;
      }
      await B.step(step);
    }
    return [...log, 'toolong'];
  };
  // Talk to one of the townsfolk wherever in the place they are.
  B.stepAside = async () => {
    const s = g.s;
    const free = (x, y) =>
      x >= 0 &&
      y >= 0 &&
      x < 32 &&
      y < 32 &&
      okT(g.map[y * 32 + x]) &&
      !s.actors.some((a, i) => i > 0 && a.tile && isBody(a) && a.z === s.level && a.x === x && a.y === y);
    // Two steps off, where there is room, then a few turns for them to go by.
    const dirs = [
      ['w', 0, -1],
      ['s', 0, 1],
      ['a', -1, 0],
      ['d', 1, 0],
    ];
    for (const [k, dx, dy] of dirs) {
      if (!free(s.x + dx, s.y + dy)) continue;
      const twice = free(s.x + 2 * dx, s.y + 2 * dy);
      await B.press(k);
      if (twice) await B.press(k);
      break;
    }
    await B.press('x x x x x x');
    return [s.x, s.y];
  };
  B.visit = async (i, policy) => {
    const s = g.s;
    for (let n = 0; n < 6; n++) {
      const npc = s.npcs[i];
      const a = npc.actor ? s.actors[npc.actor] : null;
      const z = a && a.tile ? sgn(a.z) : sgn(npc.z);
      const x = a && a.tile ? a.x : npc.x,
        y = a && a.tile ? a.y : npc.y;
      const r = await B.seek(x, y, z, true, 300);
      if (r[r.length - 1] === 'someone in the way' && n < 4) {
        // Standing in a doorway or a passage keeps them from passing: step aside and let the traffic through.
        await B.stepAside();
        continue;
      }
      if (/^interrupted/.test(r[r.length - 1]) && n < 4) {
        // A keeper's greeting, a guard's demand: dealt with, and on again.
        if (g.commandPrompt === 'combat' || g.s.mapId >= 0x80) await B.fight();
        else await B.closeMenus();
        continue;
      }
      if (r[r.length - 1] !== 'there') return r;
      const t = await B.talkTo(i, policy);
      if (t && t.heard) return t;
      if (typeof t === 'string' && t !== 'nopath' && !t.startsWith('on level')) return t;
    }
    return 'kept moving';
  };
  // Ways between floors: ladders (Klimb on them) and stairs (walked onto). Each is used once, and where it led is kept.
  B.ways = () => {
    const out = [];
    for (let k = 0; k < 1024; k++) {
      const t = g.map[k];
      if (t === 0xc8 || t === 0xc9 || (t >= 0xc4 && t <= 0xc7)) {
        const p = B.path(k % 32, k >> 5, false);
        if (p || (k % 32 === g.s.x && k >> 5 === g.s.y)) out.push({ x: k % 32, y: k >> 5, t, d: p ? p.length : 0 });
      }
    }
    return out.sort((m, n) => m.d - n.d);
  };
  B.useWay = async (w) => {
    const lv = g.s.level;
    if (w.t >= 0xc4 && w.t <= 0xc7) {
      const p = B.path(w.x, w.y, false);
      if (p && p.length > 1) {
        const r = await B.go(
          ...(() => {
            let x = g.s.x,
              y = g.s.y;
            for (const k of p.slice(0, -1)) {
              x += DIR[k][0];
              y += DIR[k][1];
            }
            return [x, y];
          })(),
        );
        if (r !== true) return false;
      }
      const last = B.path(w.x, w.y, false);
      if (last && last.length === 1) await B.press(last[0]);
    } else {
      const r = await B.go(w.x, w.y);
      if (r !== true) return false;
      await B.cmd(/^Climb/);
      await B.ready();
      if (B.menu()) await B.pick(w.t === 0xc8 ? /up/i : /down/i);
    }
    await B.ready(4000);
    return g.s.level !== lv;
  };
  B.goHome = async () => {
    const gen = B.gen;
    const tried = new Set();
    const trail = [];
    for (let n = 0; n < 16 && alive(gen) && g.s.mapId !== 0 && g.s.mapId < 0x80; n++) {
      const lv = g.s.level;
      if (lv === 0 && B.path(15, 31, false)) return trail;
      const here = (v) => v.x === g.s.x && v.y === g.s.y;
      const toward = (v) => (v.t >= 0xc4 && v.t <= 0xc7) || (lv === 0 ? true : lv > 0x80 ? v.t === 0xc8 : v.t === 0xc9);
      const pick = B.ways().find(
        (v) =>
          toward(v) &&
          !tried.has(lv + ':' + v.x + ':' + v.y) &&
          !(here(v) && lv !== 0 && trail.length && trail[trail.length - 1] === 'arrived here'),
      );
      if (!pick) {
        trail.push('no way on ' + lv);
        if (lv === 0) {
          await B.press('x x x x x x');
          tried.clear();
        } else break;
        continue;
      }
      tried.add(lv + ':' + pick.x + ':' + pick.y);
      const moved = await B.useWay(pick);
      trail.push(lv + '>' + g.s.level);
      if (moved) tried.add(g.s.level + ':' + g.s.x + ':' + g.s.y);
    }
    return trail;
  };
  B.untilHour = async (h) => {
    for (let i = 0; i < 1500 && g.s.hour !== h; i++) {
      if (g.commandPrompt === 'combat' || g.s.mapId >= 0x80) {
        await B.fight();
        await B.heal();
        continue;
      }
      if (B.menu() || !g.commandPrompt) {
        await B.closeMenus();
        continue;
      }
      await B.press('x', 2);
    }
    return [g.s.hour, g.s.minute];
  };
  // A whole place: everyone who has anything to say, wherever in it they are - by day, at the hours most keep - and
  // out again by the south gate.
  B.doPlace = async (policy) => {
    const log = {};
    const e = await B.enter();
    log.enter = e;
    if (g.s.mapId === 0) return log;
    if (/An air of/.test(g.said.slice(-200))) {
      log.shadowlord = true;
      log.leave = await B.leaveTown();
      return log;
    }
    // The night is passed inside, where nothing comes hunting, and the folk are sought once they are up and about.
    if (g.s.hour < 10 || g.s.hour >= 17) {
      if (g.s.hour >= 17) await B.untilMorning();
      log.waited = await B.untilHour(11);
    }
    return B.sweepHere(policy, log);
  };
  B.sweepHere = async (policy, log = {}) => {
    const gen = B.gen;
    const s = g.s;
    const talkers = [...Array(32).keys()].filter((i) => i > 0 && s.npcTypes[i] && s.npcs[i].fa > 0 && s.npcs[i].fa < 129);
    log.talked = {};
    // Someone who had nothing new to say last time is left alone until the party has learnt a good deal more
    // (reaching a prisoner costs keys, a tower's keeper a spell).
    B.memo = B.memo || {};
    const fresh = (i) => {
      const k = g.s.mapId + ':' + i;
      const was = B.memo[k];
      const owed = Object.keys(B.open).some((o) => o.startsWith(k + ':') && g.words.size - B.open[o] >= 10);
      return !was || was.heard > 1 || owed || g.words.size - was.size >= 60;
    };
    for (const i of talkers) {
      if (!alive(gen) || g.s.mapId === 0 || g.s.mapId >= 0x80) break;
      if (!fresh(i)) {
        log.talked[i] = 'nothing new';
        continue;
      }
      const r = await B.visit(i, policy);
      if (r && r.heard) B.memo[g.s.mapId + ':' + i] = { heard: r.heard.length, size: g.words.size };
      log.talked[i] = r && r.heard ? r.heard.length : Array.isArray(r) ? r[r.length - 1] : r;
      if (g.commandPrompt === 'combat' || g.s.mapId >= 0x80) {
        await B.fight();
        await B.heal();
      } else if (B.menu() || !g.commandPrompt) {
        await B.talk(policy);
        await B.closeMenus();
      }
    }
    // Whoever could not be reached or was cut short is tried once more: a guard in a doorway has moved on by then.
    for (const i of talkers) {
      if (!alive(gen) || g.s.mapId === 0 || g.s.mapId >= 0x80) break;
      if (typeof log.talked[i] === 'number' || log.talked[i] === 'asleep' || log.talked[i] === 'silent') continue;
      const r = await B.visit(i, policy);
      log.talked[i] = r && r.heard ? r.heard.length : 'again: ' + (Array.isArray(r) ? r[r.length - 1] : r);
      if (g.commandPrompt === 'combat' || g.s.mapId >= 0x80) {
        await B.fight();
        await B.heal();
      } else if (B.menu() || !g.commandPrompt) {
        await B.talk(policy);
        await B.closeMenus();
      }
    }
    if (g.s.mapId !== 0 && g.s.mapId < 0x80) {
      log.home = (await B.seek(15, 31, 0, false, 500)).slice(-2);
      if (log.home[log.home.length - 1] !== 'there' && (g.s.hour >= 19 || g.s.hour < 8)) {
        // The gates are shut for the night: sleep, and go out in the morning.
        log.overnight = await B.untilMorning();
        log.home = (await B.seek(15, 31, 0, false, 500)).slice(-2);
      }
      log.leave = await B.leaveTown();
    }
    log.party = g.s.partySize;
    return log;
  };

  // --- a dungeon: eight levels of eight by eight, walked in the first person (W advances, A and D turn) ---
  const D = (B.dng = {});
  D.cell = (x, y, lv = g.s.level) => g.s.dungeon[lv * 64 + (y & 7) * 8 + (x & 7)];
  // A room's map from DUNGEON.CBT (as the engine's enterRoom finds it: 16 rooms a dungeon, Despise having none).
  D.roomMap = (cell, mapId = g.s.mapId > 0x7f ? g.s.savedMapId : g.s.mapId) => {
    let d = mapId - 0x21;
    if (d >= 1) d--;
    const at = 0x1600 * d + (cell & 0xf) * 0x160;
    return g.data.files.get('DUNGEON.CBT').subarray(at, at + 0x160);
  };
  // The sides of a room (as D.dirs numbers them) with floor at the edge to walk out by.
  D.roomSides = (cell) => {
    const m = D.roomMap(cell);
    const out = new Set();
    // A magical barrier (a 0x70 tile) at the edge is a side too, with the Sceptre to dissolve it.
    const walkable = (t) => t !== 0xff && (B.actors.canEnter(g, 0x1c, t) || (g.s.sceptre !== 0 && (t & 0xf0) === 0x70));
    // What the room's triggers would put on its edges counts too (a wall that a trigger turns to floor).
    const after = new Map();
    for (let i = 0; i < 8; i++) {
      const tx = m[8 * 32 + 11 + i],
        ty = m[8 * 32 + 19 + i];
      if ((tx === 0 && ty === 0) || tx > 10 || ty > 10) continue;
      for (const row of [9, 10]) {
        const x = m[row * 32 + 11 + i],
          y = m[row * 32 + 19 + i];
        if (x < 11 && y < 11) after.set(y * 11 + x, m[11 + i]);
      }
    }
    D.dirs().forEach(([dx, dy], f) => {
      for (let i = 0; i < 11; i++) {
        const x = dx < 0 ? 0 : dx > 0 ? 10 : i;
        const y = dy < 0 ? 0 : dy > 0 ? 10 : i;
        if (walkable(m[y * 32 + x]) || (after.has(y * 11 + x) && walkable(after.get(y * 11 + x)))) {
          out.add(f);
          break;
        }
      }
    });
    return out;
  };
  // Which room the party is in, by matching the field to the dungeon's rooms (the floor as the file has it;
  // what the fight put on it differs): the room's index, or -1.
  D.whichRoom = () => {
    const cm = g.combatMap;
    let best = -1,
      bestScore = 0;
    for (let r = 0; r < 16; r++) {
      const m = D.roomMap(0xa0 | r);
      if (!m) continue;
      let score = 0;
      for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) if (m[y * 32 + x] === cm[y * 32 + x]) score++;
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }
    return bestScore >= 100 ? best : -1;
  };
  // The cell of the room the party is in, found from its map on the party's level (the nearest of several).
  D.findRoomCell = () => {
    const s = g.s;
    const r = D.whichRoom();
    if (r < 0) return null;
    const cells = [];
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) if (D.isRoom(D.kind(x, y, s.level)) && (D.cell(x, y, s.level) & 0xf) === r) cells.push([s.level, x, y]);
    if (!cells.length) return null;
    if (D.roomCell)
      cells.sort(
        (a, b) =>
          Math.abs(a[1] - D.roomCell[1]) +
          Math.abs(a[2] - D.roomCell[2]) -
          (Math.abs(b[1] - D.roomCell[1]) + Math.abs(b[2] - D.roomCell[2])),
      );
    return cells[0];
  };
  // Whether a room's field (or what its triggers put there) has the tile.
  D.roomHas = (cell, tile) => {
    const m = D.roomMap(cell);
    for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) if (m[y * 32 + x] === tile) return true;
    for (let i = 0; i < 8; i++) if (m[11 + i] === tile && (m[8 * 32 + 11 + i] || m[8 * 32 + 19 + i])) return true;
    return false;
  };
  D.kind = (x, y, lv) => D.cell(x, y, lv) & 0xf0;
  // A cell found impassable is kept out of the plans - a field, though, is only until dispelled (see D.stepTo).
  D.blocked = (l, x, y) => D.bad.has(l + ':' + (y * 8 + x)) && D.kind(x, y, l) !== 0x80 && D.kind(x, y, l) !== 0xe0;
  D.dirs = () => [0, 1, 2, 3].map((f) => [g.data.swords(0x24d6, 4)[f], g.data.swords(0x24de, 4)[f]]);
  D.map = (lv = g.s.level) => {
    let out = '';
    for (let y = 0; y < 8; y++) {
      let r = '';
      for (let x = 0; x < 8; x++)
        r += D.cell(x, y, lv).toString(16).padStart(2, '0') + (x === g.s.x && y === g.s.y && lv === g.s.level ? '*' : ' ');
      out += r + '\n';
    }
    return out;
  };
  D.bad = new Set();
  // A room (0xa0 or 0xf0: the engine enters either) costs a fight to cross.
  D.isRoom = (k) => k === 0xa0 || k === 0xf0;
  const dcost = (k) => (k === 0xb0 || k === 0xc0 ? 0 : D.isRoom(k) ? 40 : k === 0x60 ? 15 : k === 0x80 ? 12 : k === 0xd0 ? 6 : 1);
  D.route = (tx, ty) => {
    const s = g.s;
    const dirs = D.dirs();
    const dist = new Map();
    const prev = new Map();
    const start = s.y * 8 + s.x;
    dist.set(start, 0);
    const open = [[0, start]];
    while (open.length) {
      open.sort((a, b) => a[0] - b[0]);
      const [d, c] = open.shift();
      if (c === ty * 8 + tx) break;
      const cx = c % 8,
        cy = c >> 3;
      dirs.forEach(([dx, dy], f) => {
        const nx = (cx + dx) & 7,
          ny = (cy + dy) & 7;
        const n = ny * 8 + nx;
        const w = D.blocked(s.level, nx, ny) ? 0 : dcost(D.kind(nx, ny));
        if (!w) return;
        if (!dist.has(n) || d + w < dist.get(n)) {
          dist.set(n, d + w);
          prev.set(n, [c, f]);
          open.push([d + w, n]);
        }
      });
    }
    if (!prev.has(ty * 8 + tx)) return null;
    const steps = [];
    for (let c = ty * 8 + tx; c !== start; c = prev.get(c)[0]) steps.push(prev.get(c)[1]);
    return steps.reverse();
  };
  // With the whole level's map up (the Modern look's full view), the d-pad goes by the compass: the way pressed is
  // faced and stepped, the turn alone where the step meets something (dungeon.ts compassStep). Else W advances and
  // A and D turn, as 1988's keys.
  D.compass = () => g.options.tileSet === 'standard' && g.options.dungeonView === 'full';
  D.want = null;
  D.face = async (f) => {
    if (D.compass()) {
      D.want = f;
      return;
    }
    for (let i = 0; i < 4 && g.s.facing !== f; i++) await B.press(((f - g.s.facing) & 3) === 3 ? 'a' : 'd');
  };
  // A step the way faced (D.face's): by the compass, pressed again where the first press only turned.
  D.fwd = async () => {
    if (!D.compass()) return B.press('w');
    const f = D.want ?? g.s.facing;
    const [bx, by, lv] = [g.s.x, g.s.y, g.s.level];
    await B.press('wdsa'[f]);
    if (g.s.x === bx && g.s.y === by && g.s.level === lv && g.s.facing === f && g.commandPrompt === 'dungeon' && !B.menu())
      await B.press('wdsa'[f]);
  };
  // One square forward in direction f; a room or a fight on the way is fought; false if the way is barred.
  // A spell from the Cast menu, by its name in the list; false when it is not there (no mixture).
  D.cast = async (name) => {
    await B.cmd(/^Cast$/);
    await B.ready();
    for (let k = 0; k < 6; k++) {
      const m = B.menu();
      if (m && m.title === 'Spells') {
        const ok = await B.pick(name);
        await B.ready(4000);
        if (B.menu()) await B.closeMenus();
        return ok;
      }
      await B.press('z');
      await B.ready();
    }
    await B.closeMenus();
    return false;
  };
  D.stepTo = async (f) => {
    const s = g.s;
    await D.face(f);
    const bx = s.x,
      by = s.y,
      lv = s.level;
    {
      // An electric field ahead throws the party back: dispelled first (An Grav), as the others could be but
      // need not - they are walked through, and their hurts borne.
      const [dx, dy] = D.dirs()[f];
      const nx = (bx + dx) & 7,
        ny = (by + dy) & 7;
      if (D.cell(nx, ny) === 0x83) {
        if (s.members[0].mp < 20) await B.cheat('Full restore');
        await D.cast(/Dispel field/i);
      }
      if (D.isRoom(D.kind(nx, ny))) {
        D.roomCell = [lv, nx, ny];
        D.roomEntry = f;
        D.roomBad.clear();
      } else if ((D.cell(nx, ny) & 0xf7) === 0x61 && lv < 7 && D.isRoom(D.kind(nx, ny, lv + 1))) {
        // A pit that drops the party into a room below.
        D.roomCell = [lv + 1, nx, ny];
        D.roomEntry = 'fall';
        D.roomBad.clear();
      }
    }
    await D.fwd();
    if (g.commandPrompt === 'combat' || s.mapId >= 0x80) {
      D.fights = (D.fights || 0) + 1;
      await B.fight(f); // a room is left by the side the party was heading for
      await B.ready();
    }
    for (let i = 0; i < 6 && !g.commandPrompt; i++) {
      if (B.menu()) {
        await B.press('x');
      } else {
        B.key('z');
        await sleep(80);
      }
      await B.ready(3000);
    }
    if (s.x === bx && s.y === by && s.level === lv) {
      const [dx, dy] = D.dirs()[f];
      const nx = (bx + dx) & 7,
        ny = (by + dy) & 7;
      // A door still hidden in the rock ahead is found by searching, and then walked through.
      if (D.kind(nx, ny) === 0xd0 && !D.searched.has(lv + ':' + (ny * 8 + nx))) {
        D.searched.add(lv + ':' + (ny * 8 + nx));
        await B.cmd(/^Search/);
        await B.ready(3000);
        if (/Player/.test(g.said.slice(-30))) await B.press('z'); // whoever is first searches
        await B.ready(3000);
        await B.closeMenus();
        // The finding is told, then the door is walked through: a few tries, as the telling takes its time.
        for (let t = 0; t < 4 && s.x === bx && s.y === by && s.level === lv && g.commandPrompt !== 'combat'; t++) {
          await sleep(500);
          await B.ready(3000);
          if (B.menu()) await B.closeMenus();
          await D.fwd();
          await B.ready(3000);
        }
        if (g.commandPrompt === 'combat' || s.mapId >= 0x80) {
          await B.fight();
          await B.ready();
        }
        if (!(s.x === bx && s.y === by && s.level === lv)) return true;
      }
      D.bad.add(lv + ':' + (ny * 8 + nx));
      return false;
    }
    return true;
  };
  D.searched = new Set();
  D.goto = async (tx, ty) => {
    const gen = B.gen;
    for (let n = 0; n < 80 && alive(gen); n++) {
      const s = g.s;
      if (!g.inDungeon) return 'left the dungeon';
      if (s.x === tx && s.y === ty) return true;
      const r = D.route(tx, ty);
      if (!r) return 'nopath';
      const lv = s.level;
      await D.stepTo(r[0]);
      if (s.level !== lv) return 'fell to level ' + s.level;
    }
    return 'toolong';
  };
  // Up and out (or down and out) by magic: Uus Por or Des Por a level at a time, from a square with open floor
  // on the level it leads to (the spell fails into a wall, as the original's DUNGEON_1c0c has it), the way to
  // one walked; a room met on the way is crossed. From the top, Uus Por leaves for Britannia; from the bottom,
  // Des Por for the Underworld.
  D.magicClimb = async (up = true) => {
    const gen = B.gen;
    const s = g.s;
    const log = [];
    const dl = up ? -1 : 1;
    for (let n = 0; n < 24 && alive(gen) && (g.inDungeon || s.mapId >= 0x80); n++) {
      const openAt = (l) => (x, y) => (l + dl < 0 || l + dl > 7 ? true : D.cell(x, y, l + dl) >> 4 === 0);
      const goalFor = (l) => (gl, x, y, k) =>
        !D.isRoom(k) && k !== 0xb0 && k !== 0xc0 && ((up ? gl < l : gl > l) || (gl === l && openAt(l)(x, y)));
      if (g.commandPrompt === 'combat' || s.mapId >= 0x80) {
        // In a room: the way out is the plan's from the room's own cell (the party's place set there for the
        // planning and put back) - a side, or a ladder of the room's.
        let exit = up ? 0 : 2;
        if (D.roomCell) {
          const [rl, rx, ry] = D.roomCell;
          const saved = [s.level, s.x, s.y];
          [s.level, s.x, s.y] = [rl, rx, ry];
          const plan = D.plan(goalFor(rl));
          [s.level, s.x, s.y] = saved;
          if (plan && plan.length) exit = plan[0];
          if (exit === 'up' || exit === 'down') exit = exit === 'up' ? 'roomup' : 'roomdown';
        }
        log.push(['fight', exit, (await B.fight(exit)).slice(-2)]);
        continue;
      }
      const lv = s.level;
      const open = openAt(lv);
      if (!open(s.x, s.y)) {
        // A ladder the right way is as good as the spell: any square a level on will do.
        const f = await D.follow(goalFor(lv), 60);
        log.push(['walk', lv, s.x, s.y, f.at(-1)]);
        if (!g.inDungeon || s.level !== lv || g.commandPrompt === 'combat') continue;
        if (!open(s.x, s.y)) return [...log, 'no way on from level ' + lv];
      }
      if (!(s.d58a6 || s.d58a7)) log.push(await D.light());
      if (s.members[0].mp < 20) log.push(await B.cheat('Full restore'));
      await B.cmd(/^Cast$/);
      await B.ready();
      for (let k = 0; k < 6; k++) {
        const m = B.menu();
        if (m && m.title === 'Spells') {
          await B.pick(up ? /Up a level/i : /Down a level/i);
          break;
        }
        await B.press('z');
        await B.ready();
      }
      await B.ready(4000);
      if (B.menu()) await B.closeMenus();
      log.push([s.level, s.x, s.y, g.said.replace(/\s+/g, ' ').slice(-24)]);
    }
    return log;
  };
  // To wherever `goal` is true, rooms and all: a room the party is in is left the way the plan from its cell
  // says (a side, or a ladder of its own), and the walking goes on from there.
  D.walk = async (goal, max = 300) => {
    const gen = B.gen;
    const s = g.s;
    const log = [];
    for (let n = 0; n < 40 && alive(gen) && (g.inDungeon || s.mapId >= 0x80); n++) {
      if (g.commandPrompt === 'combat' || s.mapId >= 0x80) {
        let exit = 2;
        // The room is known by its field (what was recorded on the way in can be stale: a climb that failed
        // leaves the party where it was).
        const found = D.findRoomCell();
        if (found) D.roomCell = found;
        else if (D.roomCell && D.roomCell[0] !== s.level) D.roomCell = [s.level, D.roomCell[1], D.roomCell[2]];
        if (D.roomCell) {
          const [rl, rx, ry] = D.roomCell;
          // The sides the party can reach on the field as it stands (from where its first member is).
          const me = g.combat.find((c) => c.flags & 0x80);
          D.liveSides = new Set();
          D.liveSquares = new Set();
          if (me) {
            const cm = g.combatMap;
            const mine = s.actors[me.actor].tile;
            const seen = D.liveSquares;
            seen.add(me.y * 11 + me.x);
            const q = [me.y * 11 + me.x];
            for (let i = 0; i < q.length; i++) {
              const cx = q[i] % 11,
                cy = (q[i] / 11) | 0;
              if (cy === 0) D.liveSides.add(0);
              if (cx === 10) D.liveSides.add(1);
              if (cy === 10) D.liveSides.add(2);
              if (cx === 0) D.liveSides.add(3);
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
                const t = cm[ny * 32 + nx];
                if (seen.has(n) || !(arenaOk(mine, t) || (s.sceptre && (t & 0xf0) === 0x70))) continue;
                seen.add(n);
                q.push(n);
              }
            }
          }
          // Triggers still to fire may open more than the field shows: then nothing is ruled out yet.
          const unfired = Array.from({ length: 8 }, (_, i) => [g.combatMap[8 * 32 + 11 + i], g.combatMap[8 * 32 + 19 + i]]).some(
            ([tx, ty]) => !(tx === 0 && ty === 0) && tx <= 10 && ty <= 10,
          );
          if (unfired) D.liveSides = null;
          if (me && D.roomEntry != null && !unfired) {
            // Remembered for the plans: what this room offers, entered this way.
            const offer = new Set(D.liveSides);
            const cm = g.combatMap;
            const seenHas = (t) => {
              for (let y = 0; y < 11; y++)
                for (let x = 0; x < 11; x++) if (cm[y * 32 + x] === t && D.liveSquares.has(y * 11 + x)) return true;
              return false;
            };
            if (seenHas(0xc8)) offer.add('roomup');
            if (seenHas(0xc9) || seenHas(0x86)) offer.add('roomdown');
            D.sidesKnown.set(`${rl},${rx},${ry}:${D.roomEntry}`, offer);
          }
          const saved = [s.level, s.x, s.y];
          [s.level, s.x, s.y] = [rl, rx, ry];
          const plan = D.plan(goal);
          [s.level, s.x, s.y] = saved;
          D.liveSides = null;
          if (plan && plan.length) exit = plan[0];
          if (exit === 'up' || exit === 'down') exit = exit === 'up' ? 'roomup' : 'roomdown';
          if (exit === 'fall') exit = 2;
        }
        const r = await B.fight(exit);
        log.push(['fight', exit, r.slice(-2)]);
        // Out by a ladder into another room: entered that way, its cell the one over or under.
        if ((g.commandPrompt === 'combat' || s.mapId >= 0x80) && (exit === 'roomup' || exit === 'roomdown') && D.roomCell) {
          D.roomCell = [D.roomCell[0] + (exit === 'roomup' ? -1 : 1), D.roomCell[1], D.roomCell[2]];
          D.roomEntry = exit;
          D.roomBad.clear();
        }
        continue;
      }
      if (goal(s.level, s.x, s.y, D.kind(s.x, s.y))) return [...log, 'there'];
      // Nobody dead goes on: a room is set up for the living, and the empty place of the dead (the room's own
      // table gives it one all the same) can stand on the very square the way out needs. And nobody weak or
      // poisoned, who might die in the next room's fight.
      if (s.members.slice(0, s.partySize).some((m) => m.status === 80 || (m.hp > 0 && m.hp < 100))) await B.cheat('Full restore');
      for (let m = 0; m < s.partySize; m++) {
        if (s.members[m].status !== 68) continue;
        if (s.members[0].mp < 30) await B.cheat('Full restore');
        await D.cast(/Resurrect/i);
        await B.ready(3000);
        if (/On who/.test(g.said.slice(-30))) {
          await B.press([...Array(m).fill('s'), 'z'].join(' '));
          await B.ready(8000);
        }
        log.push(['raised', s.members[m].name, s.members[m].status]);
      }
      let f = await D.follow(goal, max);
      if (/^no plan/.test(f.at(-1)) && D.bad.size) {
        // A cell found blocked earlier (a creature in the way, as often as not) is tried afresh.
        D.bad.clear();
        f = await D.follow(goal, max);
      }
      log.push(['walk', f.slice(-3)]);
      if (f.at(-1) === 'there') return [...log, 'there'];
      if (f.at(-1) === 'left the dungeon' && g.inDungeon) return [...log, 'stopped'];
      if (!g.inDungeon && s.mapId < 0x80) return [...log, 'left the dungeon'];
    }
    return [...log, 'toolong'];
  };
  D.magicUp = () => D.magicClimb(true);
  D.magicDown = () => D.magicClimb(false);
  D.light = async () => {
    if (g.s.d58a6 || g.s.d58a7) return 'lit';
    await B.cmd(/^(Cast \((Great light|Light)\)|Ignite torch)/);
    await B.ready();
    return 'lit now';
  };
  D.klimb = async (up) => {
    const lv = g.s.level;
    await B.cmd(/^Climb/);
    await B.ready();
    if (B.menu()) await B.pick(up ? /up/i : /down/i);
    await B.ready(4000);
    return [lv, g.s.level, g.inDungeon];
  };
  // The nearest square of a kind on this level that can be walked to.
  D.nearest = (...kinds) => {
    let best = null;
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        if (!kinds.includes(D.kind(x, y))) continue;
        if (x === g.s.x && y === g.s.y) return [x, y, 0];
        const r = D.route(x, y);
        if (r && (!best || r.length < best[2])) best = [x, y, r.length];
      }
    return best;
  };
  // Down (or up) a level by the nearest ladder that goes that way.
  D.descend = async (up = false) => {
    await D.light();
    const t = D.nearest(up ? 0x10 : 0x20, 0x30);
    if (!t) {
      // No ladder to be reached: going down, a pit will do (a fall, and a bruise or two).
      const pit = up ? null : D.nearest(0x60);
      if (!pit) return 'no ladder ' + (up ? 'up' : 'down') + ' reachable on level ' + g.s.level;
      const lv = g.s.level;
      const r = await D.goto(pit[0], pit[1]);
      if (r !== true) return r;
      for (let i = 0; i < 20 && g.s.level === lv; i++) await B.ready(500);
      return g.s.level !== lv ? true : 'stood on the pit and did not fall';
    }
    const r = await D.goto(t[0], t[1]);
    if (r !== true) return r;
    return D.klimb(up);
  };

  // In a won room, the member whose turn it is goes a step toward the way out - a side of the room (0-3, as the
  // dungeon's headings) or a ladder ('roomdown', 'roomup') - and takes it when there.
  D.trace = [];
  D.roomExit = async (exit) => {
    const asked = exit;
    const r = await D.roomExit0(exit);
    D.trace.push([g.s.combatTurn, g.combat[g.s.combatTurn]?.who, asked, g.s.exitDir, r]);
    if (D.trace.length > 60) D.trace.shift();
    return r;
  };
  D.roomExit0 = async (exit) => {
    const s = g.s;
    // The first out sets the exit for all ("All must use the same exit!"): the rest follow it.
    if (s.exitDir !== 0 && s.combatFlags & 0x80) {
      const forced = { 3: 0, 2: 1, 4: 2, 1: 3, 5: 'roomup', 6: 'roomdown' }[s.exitDir];
      if (forced !== undefined) exit = forced;
    }
    const me = g.combat[s.combatTurn];
    const cm = g.combatMap;
    const tileAt = (x, y) => cm[y * 32 + x];
    const mine = s.actors[me.actor].tile;
    const others = new Set(g.combat.filter((c, i) => i !== s.combatTurn && c.flags && !(c.flags & 0x20)).map((c) => c.y * 11 + c.x));
    const start = me.y * 11 + me.x;
    const isExit = (x, y) =>
      exit === 'roomdown'
        ? tileAt(x, y) === 0xc9 || tileAt(x, y) === 0x86
        : exit === 'roomup'
          ? tileAt(x, y) === 0xc8
          : (() => {
              const [dx, dy] = D.dirs()[exit];
              return dx < 0 ? x === 0 : dx > 0 ? x === 10 : dy < 0 ? y === 0 : y === 10;
            })();
    // The shortest way from the member to a square `isGoal`, the others' squares blocked or (through) walked
    // through: [the goal square, the way back] or [-1].
    const search = (isGoal, through, barriers = false) => {
      const prev = new Map([[start, -1]]);
      const q = [start];
      while (q.length) {
        const c = q.shift();
        const cx = c % 11,
          cy = (c / 11) | 0;
        if (isGoal(cx, cy)) return [c, prev];
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
          const t = tileAt(nx, ny);
          const ok = arenaOk(mine, t) || (barriers && s.sceptre !== 0 && (t & 0xf0) === 0x70);
          if (prev.has(n) || (!through && others.has(n)) || D.roomBad.has(n) || !ok) continue;
          prev.set(n, c);
          q.push(n);
        }
      }
      return [-1, prev];
    };
    const stepAlong = async (end, prev) => {
      let c = end;
      while (prev.get(c) !== start) c = prev.get(c);
      const d = c - start;
      const key = d === -11 ? 'w' : d === 11 ? 's' : d === 1 ? 'd' : 'a';
      // A chest (or what came out of one) on the next square is in the way: opened, or taken, from here.
      const lying = s.actors.find((a, i) => i > 0 && a.tile > 0 && a.tile < 0x10 && a.x === c % 11 && a.y === ((c / 11) | 0));
      if (lying) {
        await B.cmd(lying.tile === 1 ? /^Open/ : /^Get/);
        await B.ready();
        await B.press(key);
        await B.ready(3000);
        return (lying.tile === 1 ? 'opened: ' : 'got: ') + g.said.replace(/\s+/g, ' ').slice(-30);
      }
      const bx = me.x,
        by = me.y;
      await B.press(key);
      if (me.x === bx && me.y === by && g.combat[s.combatTurn] === me) D.roomBad.add(c);
      return 'step';
    };
    let [end, prev] = search(isExit, false);
    if (end < 0 && search(isExit, true)[0] >= 0) {
      // Only the party in the way (a passage one wide): wait for them to move on.
      await B.pass();
      return 'waiting';
    }
    if (end < 0 && s.sceptre) {
      // A magical barrier (a 0x70 tile) between the member and the way out: the Sceptre dissolves those about
      // whoever wields it (a 3x3), so go up to the first barrier on the way and wield it there.
      const [e3, p3] = search(isExit, false, true);
      if (e3 >= 0) {
        const path = [];
        for (let c = e3; c !== start; c = p3.get(c)) path.push(c);
        path.reverse();
        const wall = path.find((n) => (tileAt(n % 11, (n / 11) | 0) & 0xf0) === 0x70);
        if (wall != null) {
          const bx = wall % 11,
            by = (wall / 11) | 0;
          if (Math.abs(bx - me.x) <= 1 && Math.abs(by - me.y) <= 1) {
            await B.cmd(/^Use item/);
            await B.ready();
            const m = B.menu();
            const i = m ? m.labels.findIndex((l) => /^Sceptre/.test(l)) : -1;
            if (i >= 0) await B.pick(i);
            else await B.closeMenus();
            await B.ready(6000);
            return 'sceptre at the barrier: ' + g.said.replace(/\s+/g, ' ').slice(-30);
          }
          return stepAlong(wall, p3);
        }
      } else if (search(isExit, true, true)[0] >= 0) {
        await B.pass();
        return 'waiting';
      }
    }
    if (end < 0) {
      // No way there. The room's own triggers (its table: the squares that fire, their new tile) may open one -
      // a wall or fence pushed, as the original's Push fires a trigger first: to a square beside one not yet
      // fired, and push it.
      const beside = new Map();
      for (let i = 0; i < 8; i++) {
        const tx = cm[8 * 32 + 11 + i],
          ty = cm[8 * 32 + 19 + i];
        if ((tx === 0 && ty === 0) || tx > 10 || ty > 10) continue;
        for (const [dx, dy, k] of [
          [0, -1, 's'],
          [1, 0, 'a'],
          [0, 1, 'w'],
          [-1, 0, 'd'],
        ])
          if (tx + dx >= 0 && ty + dy >= 0 && tx + dx < 11 && ty + dy < 11) beside.set((ty + dy) * 11 + tx + dx, k);
      }
      // A trigger out of reach (in a river, say) is fired by a missile landing on it: a member with a ranged
      // weapon shoots at the square (Doom's river room lays its bridge so).
      // (A range of 3 or more: a missile or a thrown weapon; a halberd's two is its reach.)
      const ranged = (() => {
        const w = s.members[me.who].equips[2];
        return w !== 0xff && (g.data.bytes(0x1664, 0x38)[w] ?? 1) >= 3;
      })();
      const shootable = [];
      for (let i = 0; i < 8; i++) {
        const tx = cm[8 * 32 + 11 + i],
          ty = cm[8 * 32 + 19 + i];
        if ((tx === 0 && ty === 0) || tx > 10 || ty > 10) continue;
        // (A missile lands on its target square whatever it is, so long as the way to it is clear: shoot.ts
        // checks the flight, not the landing.)
        if (!B.actors.canEnter(g, mine, tileAt(tx, ty))) shootable.push([tx, ty]);
      }
      const anyRanged = g.combat.some((c) => {
        if (!(c.flags & 0x80)) return false;
        const w = s.members[c.who].equips[2];
        return w !== 0xff && (g.data.bytes(0x1664, 0x38)[w] ?? 1) >= 3;
      });
      const toShoot = shootable.find(([tx, ty]) => !D.shotAt.has(`${tx},${ty}`));
      if (toShoot && anyRanged) {
        if (!ranged) {
          // Another member's shot to wait for.
          await B.pass();
          return 'waiting for a shot';
        }
        const [tx, ty] = toShoot;
        const shot = await D.shootAt(tx, ty);
        if (!/out of range|no crosshair/.test(shot)) D.shotAt.add(`${tx},${ty}`);
        return 'shot at trigger: ' + shot;
      }
      // A trigger on a floor square fires as it is stepped on: to it, then.
      const onFloor = new Set();
      for (let i = 0; i < 8; i++) {
        const tx = cm[8 * 32 + 11 + i],
          ty = cm[8 * 32 + 19 + i];
        if ((tx === 0 && ty === 0) || tx > 10 || ty > 10) continue;
        if (B.actors.canEnter(g, mine, tileAt(tx, ty))) onFloor.add(ty * 11 + tx);
      }
      if (onFloor.size) {
        [end, prev] = search((x, y) => onFloor.has(y * 11 + x) && !(x === me.x && y === me.y), false);
        if (end >= 0) return stepAlong(end, prev);
      }
      if (beside.size) {
        [end, prev] = search((x, y) => beside.has(y * 11 + x), false);
        if (end === start) {
          await B.cmd(/^Push/);
          await B.ready();
          await B.press(beside.get(start));
          await B.ready(3000);
          return 'pushed a trigger: ' + g.said.replace(/\s+/g, ' ').slice(-30);
        }
        if (end >= 0) return stepAlong(end, prev);
        if (search((x, y) => beside.has(y * 11 + x), true)[0] >= 0) {
          await B.pass();
          return 'waiting';
        }
      }
      // A cavern walled by magical barriers (the 0x70 tiles) is opened with the Sceptre, which dissolves those
      // about the party: to a floor square beside the barrier on the side wanted, and wield it there.
      if (s.sceptre) {
        // On the side wanted where the exit is a side; anywhere in reach where it is a ladder walled off.
        const onEdge =
          typeof exit === 'number'
            ? ((edx, edy) => (x, y) => (edx < 0 ? x === 0 : edx > 0 ? x === 10 : edy < 0 ? y === 0 : y === 10))(...D.dirs()[exit])
            : () => true;
        const nearBarrier = (x, y) => {
          for (let dx = -1; dx <= 1; dx++)
            for (let dy = -1; dy <= 1; dy++) {
              const bx = x + dx,
                by = y + dy;
              if (bx < 0 || by < 0 || bx > 10 || by > 10) continue;
              if (onEdge(bx, by) && (tileAt(bx, by) & 0xf0) === 0x70) return true;
            }
          return false;
        };
        const [e2, p2] = search(nearBarrier, false);
        if (e2 === start) {
          await B.cmd(/^Use item/);
          await B.ready();
          const m = B.menu();
          const i = m ? m.labels.findIndex((l) => /^Sceptre/.test(l)) : -1;
          if (i >= 0) await B.pick(i);
          else await B.closeMenus();
          await B.ready(6000);
          return 'sceptre: ' + g.said.replace(/\s+/g, ' ').slice(-30);
        }
        if (e2 >= 0) return stepAlong(e2, p2);
      }
      // Another side the party can reach will do (the corridor beyond joins up more often than not); a ladder
      // only when there is no side at all.
      if (typeof exit === 'number') {
        for (const other of [(exit + 1) & 3, (exit + 3) & 3, (exit + 2) & 3]) {
          const [odx, ody] = D.dirs()[other];
          const goal = (x, y) => (odx < 0 ? x === 0 : odx > 0 ? x === 10 : ody < 0 ? y === 0 : y === 10);
          if (search(goal, false)[0] >= 0 || search(goal, true)[0] >= 0) return D.roomExit(other);
        }
        const has = (t) => Array.from({ length: 121 }, (_, k) => cm[((k / 11) | 0) * 32 + (k % 11)]).some((v) => v === t);
        if (has(0xc9) || has(0x86)) return D.roomExit('roomdown');
        if (has(0xc8)) return D.roomExit('roomup');
      }
      await B.pass();
      return 'no way to ' + exit;
    }
    if (end === start) {
      if (typeof exit === 'number') {
        const [dx, dy] = D.dirs()[exit];
        await B.press(dx < 0 ? 'a' : dx > 0 ? 'd' : dy < 0 ? 'w' : 's');
        return 'out by side ' + exit;
      }
      await B.cmd(/^Climb/);
      await B.ready();
      if (B.menu()) await B.pick(exit === 'roomup' ? /up/i : /down/i);
      return 'out by ladder';
    }
    return stepAlong(end, prev);
  };
  D.roomBad = new Set();
  D.noClimb = new Set();
  D.shotAt = new Set();
  // The member whose turn it is shoots at a square: Attack, the crosshair walked there by the d-pad, A.
  D.shootAt = async (tx, ty) => {
    const s = g.s;
    await B.cmd(/^Attack/);
    for (let n = 0; n < 20 && !s.crosshair; n++) await sleep(50);
    for (let n = 0; n < 30 && s.crosshair && !(s.crossX === tx && s.crossY === ty); n++) {
      const [bx, by] = [s.crossX, s.crossY];
      const k = s.crossX < tx ? 'd' : s.crossX > tx ? 'a' : s.crossY < ty ? 's' : 'w';
      B.key(k);
      await sleep(60);
      if (s.crossX === bx && s.crossY === by) {
        // Out of range that way: give it up.
        B.key('x');
        await B.ready(3000);
        return 'out of range at ' + bx + ',' + by;
      }
    }
    if (!s.crosshair) return 'no crosshair';
    B.key('z');
    await B.ready(5000);
    return g.said.replace(/\s+/g, ' ').slice(-30);
  };
  D.liveSides = null;
  // How the party came into the room it is in (a side it moved in by, 'roomup', 'roomdown', 'fall'), and what
  // each room offered when entered each way: the sides and ladders reachable on its field.
  D.roomEntry = window.__pilotRoomEntry ?? null;
  // (Kept on the window: the bot is reloaded often while a run goes on.)
  D.sidesKnown = window.__pilotSidesKnown ?? (window.__pilotSidesKnown = new Map());
  import('/src/game/combat.ts').then((m) => {
    B.combatMod = m;
  });
  // A plan through the whole dungeon: squares and ladders, to the first place `goal(l, x, y, kind)` is true.
  D.plan = (goal) => {
    const s = g.s;
    const dirs = D.dirs();
    const key = (l, x, y) => l * 64 + y * 8 + x;
    const start = key(s.level, s.x, s.y);
    const dist = new Map([[start, 0]]);
    const prev = new Map();
    const open = [[0, start]];
    let end = -1;
    while (open.length) {
      open.sort((a, b) => a[0] - b[0]);
      const [d, c] = open.shift();
      if (d > dist.get(c)) continue;
      const l = c >> 6,
        x = c & 7,
        y = (c >> 3) & 7;
      const k = D.kind(x, y, l);
      if (c !== start && goal(l, x, y, k)) {
        end = c;
        break;
      }
      const push = (n, w, how) => {
        if (!dist.has(n) || d + w < dist.get(n)) {
          dist.set(n, d + w);
          prev.set(n, [c, how]);
          open.push([d + w, n]);
        }
      };
      // A room is entered from any side (the party is set down within), but left only by a side its map has
      // floor on, or by a ladder its map has (or a trigger of its puts there).
      let sides = D.isRoom(k) ? D.roomSides(D.cell(x, y, l)) : null;
      // The room the party is in: only the sides it can reach on the field as it is (a river may cut it off).
      if (sides && D.liveSides && D.roomCell && D.roomCell[0] === l && D.roomCell[1] === x && D.roomCell[2] === y)
        sides = new Set([...sides].filter((f) => D.liveSides.has(f)));
      // A room seen before, entered the same way, offers what it offered then (the field is the same).
      const entry = c === start ? D.roomEntry : (prev.get(c) ?? [null, null])[1];
      const known = sides && entry != null ? D.sidesKnown.get(`${l},${x},${y}:${entry}`) : null;
      if (known) sides = new Set([...sides].filter((f) => known.has(f)));
      const ladderKnown = known ? known : null;
      dirs.forEach(([dx, dy], f) => {
        if (sides && !sides.has(f)) return;
        const nx = (x + dx) & 7,
          ny = (y + dy) & 7;
        const w = D.blocked(l, nx, ny) ? 0 : dcost(D.kind(nx, ny, l));
        if (w) push(key(l, nx, ny), w, f);
      });
      const noClimb = D.noClimb.has(l + ':' + (y * 8 + x));
      if ((k === 0x20 || k === 0x30) && l < 7 && !noClimb) push(key(l + 1, x, y), 2, 'down');
      if ((k === 0x10 || k === 0x30) && l > 0 && !noClimb) push(key(l - 1, x, y), 2, 'up');
      // A pit trap (0x61) drops the party to the level below as it is stepped on (dungeon.ts pitTrap).
      if ((D.cell(x, y, l) & 0xf7) === 0x61 && l < 7) push(key(l + 1, x, y), 6, 'fall');
      // A hole in the ceiling (bit 3 of the cell) is climbed with the grapple (dungeon.ts klimbInDungeon); a
      // fall through a pit leaves one, so the cell under a pit counts as having it once the fall is made.
      if (
        k < 0xa0 &&
        s.grapple &&
        l > 0 &&
        !D.noClimb.has(l + ':' + (y * 8 + x)) &&
        ((D.cell(x, y, l) & 8) !== 0 || (D.cell(x, y, l - 1) & 0xf7) === 0x61)
      )
        push(key(l - 1, x, y), (D.cell(x, y, l) & 8) !== 0 ? 3 : 400, 'up'); // (the hole is not there until the fall)
      if (
        sides &&
        l < 7 &&
        (!ladderKnown || ladderKnown.has('roomdown')) &&
        (D.roomHas(D.cell(x, y, l), 0xc9) || D.roomHas(D.cell(x, y, l), 0x86))
      )
        push(key(l + 1, x, y), 5, 'roomdown');
      if (sides && l > 0 && (!ladderKnown || ladderKnown.has('roomup')) && D.roomHas(D.cell(x, y, l), 0xc8))
        push(key(l - 1, x, y), 5, 'roomup');
    }
    if (end < 0) return null;
    const steps = [];
    for (let c = end; c !== start; c = prev.get(c)[0]) steps.push(prev.get(c)[1]);
    return steps.reverse();
  };
  D.follow = async (goal, max = 120) => {
    const gen = B.gen;
    const log = [];
    for (let n = 0; n < max && alive(gen); n++) {
      if (!g.inDungeon) return [...log, 'left the dungeon'];
      const s = g.s;
      if (goal(s.level, s.x, s.y, D.kind(s.x, s.y)) && n > 0) return [...log, 'there'];
      await D.light();
      const plan = D.plan(goal);
      if (!plan) return [...log, 'no plan from ' + [s.level, s.x, s.y]];
      const step = plan[0];
      if (typeof step === 'number') {
        const [dx, dy] = D.dirs()[step];
        const nx = (s.x + dx) & 7,
          ny = (s.y + dy) & 7;
        if (D.isRoom(D.kind(nx, ny))) {
          const exit = plan.length > 1 ? plan[1] : (step + 2) & 3;
          D.roomCell = [s.level, nx, ny];
          D.roomEntry = step;
          D.roomBad.clear();
          await D.face(step);
          await D.fwd();
          log.push('room ' + D.cell(nx, ny).toString(16) + ' out by ' + exit);
          if (g.commandPrompt === 'combat' || g.s.mapId >= 0x80) {
            D.fights = (D.fights || 0) + 1;
            log.push((await B.fight(exit)).filter((e) => e !== 'step').slice(-4));
            await B.ready();
            for (let i = 0; i < 6 && !g.commandPrompt; i++) {
              B.key('z');
              await sleep(80);
              await B.ready(3000);
            }
          } else D.bad.add(s.level + ':' + (ny * 8 + nx));
          continue;
        }
      }
      if (step === 'fall') {
        // The step onto the pit did the falling; standing on one that did not (it was here already), a step
        // off and back on does.
        const lv = s.level;
        await D.face((D.dirs().findIndex(([dx, dy]) => D.kind((s.x + dx) & 7, (s.y + dy) & 7) < 0xa0) + 2) & 3);
        await D.fwd();
        await B.ready(3000);
        await D.face((s.facing + 2) & 3);
        await D.fwd();
        await B.ready(3000);
        log.push('fall->' + s.level);
        if (s.level === lv) D.bad.add(lv + ':' + (s.y * 8 + s.x));
        continue;
      }
      if (step === 'down' || step === 'up') {
        const to = s.level + (step === 'up' ? -1 : 1);
        if (D.isRoom(D.kind(s.x, s.y, to))) {
          D.roomCell = [to, s.x, s.y];
          D.roomEntry = step;
          D.roomBad.clear();
        }
        const r = await D.klimb(step === 'up');
        log.push(step + '->' + g.s.level);
        if (r[0] === r[1] && g.inDungeon) {
          // No climbing here after all (no hole yet, no ladder): the cell keeps its place in the plans, but not
          // as a way up or down.
          D.noClimb.add(s.level + ':' + (s.y * 8 + s.x));
        }
      } else {
        const lv = s.level;
        await D.stepTo(step);
        if (s.level !== lv) {
          log.push('fell->' + s.level);
          // A fall leaves a hole above to climb back through: what could not be climbed before may be now.
          D.noClimb.clear();
        }
      }
    }
    return [...log, 'toolong'];
  };

  // --- running something long without holding the tool call open ---
  B.bg = (fn) => {
    B.busy = true;
    B.result = null;
    fn().then(
      (r) => {
        B.result = r;
        B.busy = false;
      },
      (e) => {
        B.result = 'ERR ' + (e?.stack ?? e);
        B.busy = false;
      },
    );
    return 'started';
  };
  B.st = () => {
    const s = g.s;
    return {
      at: [s.x, s.y, s.level, s.mapId],
      prompt: g.commandPrompt,
      menu: g.menuShown && { t: g.menuShown.title, l: g.menuShown.labels, at: g.menuShown.at },
      hp: [...Array(s.partySize).keys()].map((i) => s.members[i].hp),
      gold: s.gold,
      food: s.food,
      time: [s.month, s.day, s.hour, s.minute],
      said: g.said.replace(/\s+/g, ' ').slice(-220),
    };
  };
  B.poll = async (ms = 38000) => {
    const t0 = performance.now();
    while (B.busy && performance.now() - t0 < ms) await sleep(150);
    return JSON.stringify({ busy: B.busy, result: B.result, st: B.st() });
  };
  return 'bot ' + B.gen;
})();
