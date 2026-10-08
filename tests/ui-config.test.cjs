/******************************************************************************\

                  This file is part of the Folding@home Client.

          The fah-client runs Folding@home protein folding simulations.
                    Copyright (c) 2001-2026, foldingathome.org
                               All rights reserved.

       This program is free software; you can redistribute it and/or modify
       it under the terms of the GNU General Public License as published by
        the Free Software Foundation; either version 3 of the License, or
                       (at your option) any later version.

         This program is distributed in the hope that it will be useful,
          but WITHOUT ANY WARRANTY; without even the implied warranty of
          MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
                   GNU General Public License for more details.

     You should have received a copy of the GNU General Public License along
     with this program; if not, write to the Free Software Foundation, Inc.,
           51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

                  For information regarding this software email:
                                 Joseph Coffland
                          joseph@cauldrondevelopment.com

\******************************************************************************/

require('./gpu-policy-loader.cjs');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {isDeepStrictEqual} = require('node:util');
const {test} = require('node:test');
const root = path.resolve(__dirname, '..');
const group = fs.readFileSync(path.join(root, 'src/GroupSettings.vue'), 'utf8');
function getter(text, name) {
  const match = text.match(new RegExp(name + '\\(\\) \\{([\\s\\S]*?)\\n    \\},'));
  assert.ok(match, 'Missing getter ' + name);
  return new Function(match[1]);
}
const counts = getter(group, 'class_counts');
const {cpuIntentChanged: changed, cpuConfigValid: valid} = require('./cpu-policy-loader.cjs');
function context(initial, groups, levels) {
  const ctx = {saved_groups: initial, groups,
    isEqual: isDeepStrictEqual,
    cpu_managed_mode: Object.values(groups).some(g => g.cpu_mode == 'classes'),
    cpu_class_supported: true,
    cpu_affinity: {performance_levels: levels.map(n => ({logical_cpus: n}))},
    available_cpus: levels.reduce((a, b) => a + b, 0)};
  ctx.cpu_intent_changed = changed(ctx);
  return ctx;
}
test('displaying an old vector never pads or rewrites it', () => {
  const config = {cpu_class_counts: [1,1]};
  const before = JSON.stringify(config);
  assert.deepEqual(counts.call({config, cpuAffinity: {performance_levels: [{},{},{}]}}), [1,1]);
  assert.equal(JSON.stringify(config), before);
});
test('unrelated edit with class-capacity loss remains saveable', () => {
  const initial = {A: {cpu_mode:'classes', cpu_class_counts:[2,0], cpus:2}};
  const groups = structuredClone(initial); groups.A.beta = true;
  const ctx = context(initial, groups, [1,4]);
  assert.equal(ctx.cpu_intent_changed, false); assert.equal(valid(ctx), true);
});
test('unchanged three-class intent survives two-class topology', () => {
  const initial = {A: {cpu_mode:'classes', cpu_class_counts:[1,1,1]}};
  const ctx = context(initial, structuredClone(initial), [2,2]);
  assert.equal(valid(ctx), true);
});
test('explicit oversubscribed class edit is rejected', () => {
  const initial = {A: {cpu_mode:'classes', cpu_class_counts:[1,0]}};
  const groups = {A: {cpu_mode:'classes', cpu_class_counts:[3,0]}};
  const ctx = context(initial, groups, [2,2]);
  assert.equal(ctx.cpu_intent_changed, true); assert.equal(valid(ctx), false);
});
test('explicit switch to General remains possible', () => {
  const initial = {A: {cpu_mode:'classes', cpu_class_counts:[1,1,1]}};
  const groups = {A: {cpu_mode:'count', cpus:3, cpu_class_counts:[1,1,1]}};
  const ctx = context(initial, groups, [2,2]);
  assert.equal(ctx.cpu_intent_changed, true); assert.equal(valid(ctx), true);
});
test('count mode ignores retained inactive class values', () => {
  const initial = {A: {cpu_mode:'count', cpus:3, cpu_class_counts:[1,1]}};
  const groups = {A: {cpu_mode:'count', cpus:3, cpu_class_counts:[2,2]}};
  assert.equal(context(initial, groups, [2,2]).cpu_intent_changed, false);
});
const method = group.match(/set_class_count\(i, raw\) \{([\s\S]*?)\n    \}/);
assert.ok(method);
const setCount = new Function('i', 'raw', method[1]);
test('explicit class handler replaces intent and synchronizes compatibility count', () => {
  const original = [1,1];
  const ctx = {config:{cpu_mode:'classes', cpu_class_counts:original, cpus:2},
    class_editable:true, class_max: () => 3};
  setCount.call(ctx, 0, '2');
  assert.deepEqual(ctx.config.cpu_class_counts, [2,1]);
  assert.deepEqual(original, [1,1]); assert.equal(ctx.config.cpus, 3);
});
test('missing or incompatible class vector cannot be mutated through handler', () => {
  const ctx = {config:{cpu_mode:'classes'}, class_editable:false};
  setCount.call(ctx, 0, '2'); assert.deepEqual(ctx.config,{cpu_mode:'classes'});
});
test('handler rejects invalid count, index, budget and inactive mode', () => {
  const ctx = {config:{cpu_mode:'classes', cpu_class_counts:[1,1], cpus:2},
    class_editable:true, class_max: () => 2};
  const before = structuredClone(ctx.config);
  for (const [i,value] of [[0,'NaN'],[0,'1.5'],[0,'-1'],[0,'3'],[-1,'0'],[99,'0']])
    setCount.call(ctx,i,value);
  assert.deepEqual(ctx.config,before);
  ctx.config.cpu_mode='count';setCount.call(ctx,0,'2');
  assert.deepEqual(ctx.config.cpu_class_counts,[1,1]);
});
const {pathToFileURL} = require('node:url');
test('final tree publication works with the existing web update decoder', async () => {
  const {default: Updatable} = await import(pathToFileURL(path.join(__dirname,
    'protocol/updatable.mjs')).href);
  const view = new Updatable({groups:{B:{config:{cpus:1}}}, units:[{group:'B'}],
    info:{cpu_affinity:{managed:true}}, log:['preserve log']});
  const final = {groups:{A:{config:{cpus:4}}}, units:[{group:'A'}],
    info:{cpu_affinity:{managed:true, runtime_fallback:false}}};
  for (const key of ['groups','units','info']) view.do_update([key,final[key]]);
  for (const key of ['groups','units','info']) assert.deepEqual(view[key],final[key]);
  assert.deepEqual(view.log,['preserve log']);
});


test('unavailable class help describes fail-closed scheduling', () => {
  const help = group.match(/\.cpu-classes-unavailable([\s\S]*?)\n  \.setting\.cpu-count-row/)[1];
  assert.match(help, /preserves these settings\. CPU jobs wait/);
  assert.match(help, /selected classes or\s+required affinity cannot be provided/);
  assert.doesNotMatch(help, /runtime general allocation/);
});
