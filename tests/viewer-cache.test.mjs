import assert from 'node:assert/strict'
import {createServer} from 'vite'
import Cache from '../src/cache.js'
import Updatable from '../src/updatable.js'

const vite = await createServer({server: {middlewareMode: true}, appType: 'custom'})
const {default: Machine} = await vite.ssrLoadModule('/src/machine.js')

const entries = new Map()
let failDelete = false
globalThis.caches = {open: async () => ({
  put: async (key, value) => entries.set(new URL(key, 'http://localhost/').href, value),
  match: async key => entries.get(new URL(key, 'http://localhost/').href)?.clone(),
  keys: async () => [...entries.keys()].map(url => ({url})),
  delete: async request => !failDelete && entries.delete(request.url)
})}

const cache = new Cache('viewer-test')
const data = new Updatable({units: [{id: 'wu1', start_time: 'first', pid: 1}],
  viz: {wu1: {topology: {atoms: [1]}, frames: [['old']]}}})
const machine = Object.create(Machine.prototype)
machine.state = {data}
machine.cache = cache
machine.vizUnit = 'wu1'
machine.is_connected = () => true
const commands = []
machine.send_command = (cmd, args) => commands.push({cmd, args})

await cache.set('viz/wu1/epoch', 'first/1')
await cache.set('viz/wu1/topology', {atoms: [1]})
await cache.set('viz/wu1/frames/0', ['old'])
await cache.set('viz/wu1/frames/5', ['future'])
await machine.on_message(['units', 0, 'start_time', 'second'])
await machine.on_message(['units', 0, 'pid', 2])
assert.equal(commands.at(-1).args.frame, 0)
assert.equal(data.viz.wu1, undefined)
assert.equal(await cache.get('viz/wu1/frames/0', 0), undefined)
assert.equal(await cache.get('viz/wu1/frames/5', 0), undefined)

await cache.set('viz/wu1/topology', {atoms: [1]})
await cache.set('viz/wu1/frames/0', ['new'])
const reconnect = Object.create(Machine.prototype)
reconnect.state = {data: new Updatable({units: data.units})}
reconnect.cache = new Cache('viewer-test')
reconnect.vizUnit = 'wu1'
reconnect.is_connected = () => true
reconnect.send_command = (cmd, args) => commands.push({cmd, args})
await reconnect._send_viz_enable()
assert.equal(commands.at(-1).args.frame, 1)
assert.deepEqual(reconnect.get_viz('wu1').frames, [['new']])

await cache.set('viz/wu1/frames/5', ['future'])
failDelete = true
await machine.on_message(['units', 0, 'start_time', 'third'])
await machine.on_message(['units', 0, 'pid', 3])
assert.equal(commands.at(-1).args.frame, 0)
assert.equal(data.viz.wu1, undefined)
assert.equal(await cache.get('viz/wu1/epoch', 0), 'second/2')
failDelete = false
await machine._send_viz_enable()
assert.equal(commands.at(-1).args.frame, 0)
assert.equal(await cache.get('viz/wu1/frames/5', 0), undefined)
assert.equal(await cache.get('viz/wu1/epoch', 0), 'third/3')

const originalSet = cache.set.bind(cache)
let releaseOldFrame
cache.set = async (key, value) => {
  if (key == 'viz/wu1/frames/4')
    await new Promise(resolve => {releaseOldFrame = resolve})
  return originalSet(key, value)
}
const oldFrame = machine.on_message(['viz', 'wu1', 'frames', 4, ['old-late']])
await machine.on_message(['units', 0, 'start_time', 'fourth'])
const relaunched = machine.on_message(['units', 0, 'pid', 4])
await new Promise(resolve => setImmediate(resolve))
assert.ok(releaseOldFrame)
releaseOldFrame()
await Promise.all([oldFrame, relaunched])
assert.equal(commands.at(-1).args.frame, 0)
assert.equal(await cache.get('viz/wu1/frames/4', 0), undefined)
assert.equal(await cache.get('viz/wu1/epoch', 0), 'fourth/4')

const originalClear = cache.clearPrefix.bind(cache)
let releasePurge
cache.clearPrefix = async prefix => {
  await new Promise(resolve => {releasePurge = resolve})
  return originalClear(prefix)
}
await machine.on_message(['units', 0, 'start_time', 'fifth'])
const pendingPurge = machine.on_message(['units', 0, 'pid', 5])
await new Promise(resolve => setImmediate(resolve))
assert.ok(releasePurge)
const duringPurge = machine.on_message(['viz', 'wu1', 'frames', 0, ['current']])
releasePurge()
await Promise.all([pendingPurge, duringPurge])
assert.equal(await cache.get('viz/wu1/epoch', 0), 'fifth/5')
assert.deepEqual(await cache.get('viz/wu1/frames/0', 0), ['current'])
await vite.close()
