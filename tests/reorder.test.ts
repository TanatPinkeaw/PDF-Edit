import { describe, expect, it } from 'vitest';

import { moveBlock } from '../src/lib/reorder';

const items = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
const ids = (list: { id: string }[]) => list.map((item) => item.id);

describe('moveBlock', () => {
  it('moves one row down after the target', () => {
    expect(ids(moveBlock(items, 'b', 'd'))).toEqual(['a', 'c', 'd', 'b', 'e']);
  });

  it('moves one row up before the target', () => {
    expect(ids(moveBlock(items, 'd', 'b'))).toEqual(['a', 'd', 'b', 'c', 'e']);
  });

  it('moves a selected block down and keeps its order', () => {
    expect(ids(moveBlock(items, 'b', 'd', ['b', 'c']))).toEqual(['a', 'd', 'b', 'c', 'e']);
  });

  it('moves a selected block up as one unit', () => {
    expect(ids(moveBlock(items, 'd', 'a', ['c', 'd', 'e']))).toEqual(['c', 'd', 'e', 'a', 'b']);
  });

  it('does nothing when the target is inside the dragged block', () => {
    expect(ids(moveBlock(items, 'b', 'c', ['b', 'c']))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('ignores ids that are no longer in the list', () => {
    expect(ids(moveBlock(items, 'gone', 'a', ['gone']))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('returns a copy so callers can compare by reference', () => {
    const next = moveBlock(items, 'a', 'a');
    expect(next).not.toBe(items);
    expect(ids(next)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});
