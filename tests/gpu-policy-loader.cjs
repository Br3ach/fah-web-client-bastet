const fs = require('node:fs');
const path = require('node:path');
global.activeGPUIds = new Function(fs.readFileSync(path.join(__dirname, '../src/GPUPolicy.js'), 'utf8').replace('export function', 'function') + '\nreturn activeGPUIds')();
