/**
 * xmi.ts
 *
 * The Ultima V Upgrade's music files (Miles "extended MIDI") read as the
 * timed events a General MIDI synthesizer plays: each note's start and end,
 * program changes, the controllers that shape a part (volume, pan,
 * expression, sustain) and pitch bends - for the music's render
 * (tools/music): the Upgrade's files are what both versions of the music are
 * rendered from, and nothing else reads them.
 *
 * XMI is an IFF file (FORM XDIR, then CAT XMID, FORM XMID with TIMB and
 * EVNT chunks). EVNT is MIDI without note-offs: a note-on carries its own
 * duration (a MIDI variable-length number) after the velocity, and the
 * time between events is a run of bytes under 0x80, summed. Time counts at
 * 120 ticks a second whatever the tempo events say, as Miles' driver played
 * it.
 */

/** XMI's clock: ticks a second, whatever its tempo events say. */
export const XMI_TICKS_PER_SECOND = 120;

/** A timed event of a tune, as a synthesizer takes it. */
export type XmiEvent =
  | { time: number; kind: 'on'; channel: number; note: number; velocity: number }
  | { time: number; kind: 'off'; channel: number; note: number }
  | { time: number; kind: 'program'; channel: number; program: number }
  | { time: number; kind: 'controller'; channel: number; controller: number; value: number }
  | { time: number; kind: 'bend'; channel: number; value: number };

export interface XmiSequence {
  /** In time order (seconds), an end before a start at the same moment. */
  events: XmiEvent[];
  /** Seconds to the end of the last event: one turn of the loop. */
  length: number;
}

/** An IFF chunk's contents by id, searched through FORM and CAT containers. */
function chunk(b: Uint8Array, id: string, start = 0, end = b.length): Uint8Array | null {
  const tag = (at: number): string => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
  const be32 = (at: number): number => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
  let at = start;
  while (at + 8 <= end) {
    const t = tag(at);
    const size = be32(at + 4);
    const body = at + 8;
    if (t === id) return b.subarray(body, Math.min(end, body + size));
    if (t === 'FORM' || t === 'CAT ') {
      const inner = chunk(b, id, body + 4, Math.min(end, body + size));
      if (inner) return inner;
    }
    at = body + size + (size & 1);
  }
  return null;
}

/**
 * Order at a moment: what ends first, then what sets a part up (its bank, which a program change is read in, then its
 * program and the rest), then what starts.
 */
function rank(e: XmiEvent): number {
  switch (e.kind) {
    case 'off':
      return 0;
    case 'controller':
      return e.controller === 0 || e.controller === 32 ? 1 : 3;
    case 'program':
      return 2;
    case 'bend':
      return 4;
    case 'on':
      return 5;
  }
}

/** An XMI file's first sequence, as timed events. Throws where it is no XMI. */
export function readXmiEvents(file: Uint8Array): XmiSequence {
  const ev = chunk(file, 'EVNT');
  if (!ev) throw new Error('not an XMI file');
  const events: XmiEvent[] = [];
  let tick = 0;
  let end = 0;
  let i = 0;
  const vlq = (): number => {
    let v = 0;
    for (;;) {
      const b = ev[i++];
      v = (v << 7) | (b & 0x7f);
      if ((b & 0x80) === 0 || i >= ev.length) return v;
    }
  };
  const at = (t: number): number => t / XMI_TICKS_PER_SECOND;
  while (i < ev.length) {
    // The interval: bytes under 0x80, added up.
    while (i < ev.length && ev[i] < 0x80) tick += ev[i++];
    if (i >= ev.length) break;
    const status = ev[i++];
    const channel = status & 0x0f;
    switch (status & 0xf0) {
      case 0x90: {
        const note = ev[i++];
        const velocity = ev[i++];
        const dur = Math.max(vlq(), 1);
        if (velocity > 0) {
          events.push({ time: at(tick), kind: 'on', channel, note, velocity });
          events.push({ time: at(tick + dur), kind: 'off', channel, note });
        }
        end = Math.max(end, tick + dur);
        break;
      }
      case 0x80:
      case 0xa0:
        i += 2;
        break;
      case 0xb0: {
        const controller = ev[i++];
        const value = ev[i++];
        events.push({ time: at(tick), kind: 'controller', channel, controller, value });
        break;
      }
      case 0xc0:
        events.push({ time: at(tick), kind: 'program', channel, program: ev[i++] });
        break;
      case 0xd0:
        i += 1;
        break;
      case 0xe0: {
        const lo = ev[i++];
        const hi = ev[i++];
        events.push({ time: at(tick), kind: 'bend', channel, value: (hi << 7) | lo });
        break;
      }
      case 0xf0:
        if (status === 0xff) {
          const type = ev[i++];
          const len = vlq();
          i += len;
          if (type === 0x2f) i = ev.length;
        } else {
          i += vlq();
        }
        break;
    }
  }
  end = Math.max(end, tick);
  events.sort((a, b) => a.time - b.time || rank(a) - rank(b));
  return { events, length: at(end) };
}
