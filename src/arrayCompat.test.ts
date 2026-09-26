import { afterEach, describe, expect, it } from 'vitest';
import { installChangeArrayByCopyPolyfill } from './arrayCompat';

const proto = Array.prototype as {
  toSorted?: unknown;
  toReversed?: unknown;
  with?: unknown;
};
const originals = {
  toSorted: proto.toSorted,
  toReversed: proto.toReversed,
  with: proto.with,
};

afterEach(() => {
  proto.toSorted = originals.toSorted;
  proto.toReversed = originals.toReversed;
  proto.with = originals.with;
});

describe('installChangeArrayByCopyPolyfill', () => {
  it('installs the methods when the runtime does not provide them', () => {
    Reflect.deleteProperty(proto, 'toSorted');
    Reflect.deleteProperty(proto, 'toReversed');
    Reflect.deleteProperty(proto, 'with');

    installChangeArrayByCopyPolyfill();

    const source = [3, 1, 2];
    expect(source.toSorted((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(source.toReversed()).toEqual([2, 1, 3]);
    // oxlint-disable-next-line unicorn/no-confusing-array-with
    expect(source.with(-1, 9)).toEqual([3, 1, 9]);
    expect(source).toEqual([3, 1, 2]);
    expect(() => source.with(3, 9)).toThrow(RangeError);
  });

  it('installs them as non-enumerable', () => {
    Reflect.deleteProperty(proto, 'toSorted');

    installChangeArrayByCopyPolyfill();

    expect(Object.keys([1, 2])).toEqual(['0', '1']);
  });
});
