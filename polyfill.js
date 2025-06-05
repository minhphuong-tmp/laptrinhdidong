import { Buffer } from 'buffer';
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

global.Buffer = Buffer;
global.process = require('process/browser.js');

global.process.env = global.process.env || {};
global.process.version = global.process.version || 'v16.0.0';

if (typeof global.self === 'undefined') {
    global.self = global;
}