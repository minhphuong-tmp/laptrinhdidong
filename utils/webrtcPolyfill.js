// WebRTC Polyfill for React Native
// Import this file at the top of your app entry point

// Polyfill EventTarget for react-native-webrtc
if (typeof global.EventTarget === 'undefined') {
    global.EventTarget = class EventTarget {
        constructor() {
            this.listeners = {};
        }

        addEventListener(type, listener, options) {
            if (!this.listeners[type]) {
                this.listeners[type] = [];
            }
            this.listeners[type].push(listener);
        }

        removeEventListener(type, listener) {
            if (this.listeners[type]) {
                this.listeners[type] = this.listeners[type].filter(l => l !== listener);
            }
        }

        dispatchEvent(event) {
            if (this.listeners[event.type]) {
                this.listeners[event.type].forEach(listener => {
                    if (typeof listener === 'function') {
                        listener(event);
                    } else if (listener && typeof listener.handleEvent === 'function') {
                        listener.handleEvent(event);
                    }
                });
            }
            return true;
        }
    };
}

// Polyfill Event for react-native-webrtc
if (typeof global.Event === 'undefined') {
    global.Event = class Event {
        constructor(type, eventInitDict = {}) {
            this.type = type;
            this.bubbles = eventInitDict.bubbles || false;
            this.cancelable = eventInitDict.cancelable || false;
            this.defaultPrevented = false;
        }

        preventDefault() {
            this.defaultPrevented = true;
        }

        stopPropagation() {
            // Not implemented
        }
    };
}

// Polyfill CustomEvent for react-native-webrtc
if (typeof global.CustomEvent === 'undefined') {
    global.CustomEvent = class CustomEvent extends global.Event {
        constructor(type, eventInitDict = {}) {
            super(type, eventInitDict);
            this.detail = eventInitDict.detail || null;
        }
    };
}


