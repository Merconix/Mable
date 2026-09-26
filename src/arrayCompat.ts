type ChangeArrayByCopyMethods = {
  toSorted?: unknown;
  toReversed?: unknown;
  with?: unknown;
};

function define(name: string, value: unknown): void {
  // oxlint-disable-next-line no-extend-native
  Object.defineProperty(Array.prototype, name, { value, writable: true, configurable: true });
}

export function installChangeArrayByCopyPolyfill(): void {
  const proto = Array.prototype as ChangeArrayByCopyMethods;

  if (!proto.toSorted) {
    define('toSorted', function toSorted<T>(this: T[], compare?: (a: T, b: T) => number): T[] {
      // oxlint-disable-next-line unicorn/no-array-sort
      return Array.prototype.slice.call(this).sort(compare);
    });
  }

  if (!proto.toReversed) {
    define('toReversed', function toReversed<T>(this: T[]): T[] {
      // oxlint-disable-next-line unicorn/no-array-reverse
      return Array.prototype.slice.call(this).reverse();
    });
  }

  if (!proto.with) {
    define('with', function withAt<T>(this: T[], index: number, value: T): T[] {
      const copy = Array.prototype.slice.call(this) as T[];
      const target = index < 0 ? copy.length + index : index;
      if (target < 0 || target >= copy.length) throw new RangeError(`Invalid index : ${index}`);
      copy[target] = value;
      return copy;
    });
  }
}

installChangeArrayByCopyPolyfill();
