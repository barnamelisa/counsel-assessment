import { describe, expect, it } from 'vitest';
import pilot from './fixtures/pilot-workspace.json';
import { decodeData } from './model';
import type { Data, Entry } from './model';
import {
  countNeedingReview,
  planUndo,
  saveEntry,
  splitSelection,
  undoEntries,
  updateEntries,
} from './review';

const data: Data = decodeData(JSON.stringify(pilot));
const find = (d: Data, text: string): Entry => {
  const entry = d.entries.find((e) => e.description.includes(text));
  if (!entry) throw new Error(`Missing fixture entry: ${text}`);
  return entry;
};
const shareholder = find(data, 'Shareholder agreement');
const otherClient = data.clients.find((c) => c.id !== shareholder.clientId)!;

describe('review state after corrections', () => {
  it('starts reviewed in the fixture', () => {
    expect(shareholder.reviewed).toBe(true);
  });
  it('requires review again after moving to another client', () => {
    const next = updateEntries(data, [shareholder.id], {
      clientId: otherClient.id,
    });
    expect(find(next, 'Shareholder agreement').reviewed).toBe(false);
  });
  it('requires review again after changing billability', () => {
    const next = updateEntries(data, [shareholder.id], { billable: false });
    expect(find(next, 'Shareholder agreement').reviewed).toBe(false);
  });
  it('keeps review when the patch changes nothing', () => {
    const next = updateEntries(data, [shareholder.id], {
      clientId: shareholder.clientId,
      billable: shareholder.billable,
    });
    expect(find(next, 'Shareholder agreement').reviewed).toBe(true);
  });
  it('still lets the reviewer mark an entry reviewed explicitly', () => {
    const open = updateEntries(data, [shareholder.id], { reviewed: false });
    const done = updateEntries(open, [shareholder.id], { reviewed: true });
    expect(find(done, 'Shareholder agreement').reviewed).toBe(true);
  });
  it('keeps review when a form save changes nothing', () => {
    const next = saveEntry(data, { ...shareholder }, undefined, shareholder);
    expect(find(next, 'Shareholder agreement').reviewed).toBe(true);
  });
});

describe('undo', () => {
  it('reverses only the affected entry and keeps independent work', () => {
    const moved = updateEntries(data, [shareholder.id], {
      clientId: otherClient.id,
    });
    const undo = planUndo(data, moved, [shareholder.id]);
    const other = data.entries.find((e) => e.id !== shareholder.id)!;
    const later = updateEntries(moved, [other.id], {
      reviewed: !other.reviewed,
    });
    const restored = undoEntries(later, undo);
    expect(find(restored, 'Shareholder agreement')).toEqual(shareholder);
    expect(restored.entries.find((e) => e.id === other.id)?.reviewed).toBe(
      !other.reviewed,
    );
  });
  it('declines when the same entry changed after the action', () => {
    const moved = updateEntries(data, [shareholder.id], {
      clientId: otherClient.id,
    });
    const undo = planUndo(data, moved, [shareholder.id]);
    const edited = updateEntries(moved, [shareholder.id], {
      billable: !shareholder.billable,
    });
    expect(() => undoEntries(edited, undo)).toThrow(/Can't undo/);
  });
});
describe('selection scope', () => {
  it('splits selection into in-view and hidden-by-filter entries', () => {
    const [a, b, c] = data.entries;
    const { inView, hidden } = splitSelection(
      [a.id, b.id, 'gone'],
      [a, c],
      data.entries,
    );
    expect(inView).toEqual([a.id]);
    expect(hidden).toEqual([b.id]);
  });
});

describe('needs-review count', () => {
  it('counts unreviewed entries in the week only', () => {
    const week = '2026-09-28';
    const inWeek = data.entries.filter(
      (e) => e.date >= week && e.date <= '2026-10-04',
    );
    expect(countNeedingReview(data.entries, week)).toBe(
      inWeek.filter((e) => !e.reviewed).length,
    );
  });
});
