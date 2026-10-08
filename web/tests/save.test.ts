import { describe, expect, it } from 'vitest';
import { Save, Status } from '../src/game/save.ts';
import { gameFiles } from './helpers.ts';

describe('Save', () => {
  it('reads the checked-in SAVED.GAM', () => {
    const s = new Save(gameFiles().get('SAVED.GAM'));
    expect(s.partySize).toBeGreaterThan(0);
    const avatar = s.members[0];
    expect(avatar.cls).toBe('A'.charCodeAt(0));
    expect([Status.Good, Status.Poisoned, Status.Sleeping, Status.Dead]).toContain(avatar.status);
    expect(avatar.hp).toBeLessThanOrEqual(avatar.maxHp);
  });
  it("reads INIT.GAM: the new game starts in 139 in Iolo's hut", () => {
    const s = new Save(gameFiles().get('INIT.GAM'));
    expect(s.year).toBe(139);
    expect(s.mapId).toBe(13);
    expect([s.x, s.y, s.partySize]).toEqual([15, 15, 3]);
    s.gold = 1234;
    expect(s.gold).toBe(1234);
  });
});
