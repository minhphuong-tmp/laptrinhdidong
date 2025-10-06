// Web polyfills để tránh lỗi "window is not defined"
if (typeof global !== 'undefined') {
  // Polyfill window cho server-side rendering
  if (typeof global.window === 'undefined') {
    global.window = global;
  }
  
  // Polyfill localStorage cho server-side rendering
  if (typeof global.localStorage === 'undefined') {
    global.localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null,
    };
  }
  
  // Polyfill document cho server-side rendering
  if (typeof global.document === 'undefined') {
    global.document = {
      createElement: () => ({}),
      getElementById: () => null,
      querySelector: () => null,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  }
}

export {};

