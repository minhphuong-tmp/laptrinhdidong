// Global polyfills để tránh lỗi "window is not defined"
if (typeof global !== 'undefined') {
    // Polyfill window
    if (typeof global.window === 'undefined') {
        global.window = global;
    }

    // Polyfill localStorage
    if (typeof global.localStorage === 'undefined') {
        global.localStorage = {
            getItem: () => null,
            setItem: () => { },
            removeItem: () => { },
            clear: () => { },
            length: 0,
            key: () => null,
        };
    }

    // Polyfill document
    if (typeof global.document === 'undefined') {
        global.document = {
            createElement: () => ({}),
            getElementById: () => null,
            querySelector: () => null,
            addEventListener: () => { },
            removeEventListener: () => { },
        };
    }

    // Polyfill navigator
    if (typeof global.navigator === 'undefined') {
        global.navigator = {
            userAgent: 'React Native Web',
        };
    }
}

// Export để có thể import
export { };


