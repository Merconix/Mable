import '@testing-library/jest-dom';

class ResizeObserverPolyfill {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = globalThis.ResizeObserver ?? ResizeObserverPolyfill;

class IntersectionObserverPolyfill {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.IntersectionObserver =
  globalThis.IntersectionObserver ??
  (IntersectionObserverPolyfill as unknown as typeof IntersectionObserver);

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  })) as typeof window.matchMedia;
}

function elementScrollTo(this: Element, optionsOrX?: ScrollToOptions | number, y?: number) {
  const top = typeof optionsOrX === 'number' ? y : optionsOrX?.top;
  if (top !== undefined) this.scrollTop = top;
}

if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = elementScrollTo as typeof Element.prototype.scrollTo;
}
