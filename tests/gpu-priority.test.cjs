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

const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const {normalizeGroupConfig,normalizeSettings} = require('./settings-normalization-loader.cjs');
const source = fs.readFileSync(require.resolve('../src/GroupSettings.vue'),'utf8');
const method = source.match(/gpu_priority_options\(\) \{([\s\S]*?)\n    \},/)[1];
const options = vm.runInNewContext('(function(){'+method+'})');
test('GPU priority choices follow backend capabilities and exclude privileged choices',()=>{
 for(const values of [['','idle','below-normal','normal','above-normal','high'],['','other-low','other-normal']]) {
  const actual=options.call({cpuAffinity:{gpu_priority_options:values}});
  assert.deepEqual(Array.from(actual,x=>x.value),values);
  assert.equal(actual[0].label,'No override');
  assert.ok(actual.every(x=>x.label && !x.value.includes('realtime')));
 }
 assert.equal(options.call({}).length,0);
});
test('RG priority survives missing GPUs, normalization, save comparison and removal',()=>{
 const caps={cpuAffinity:{gpu_priority_options:['','other-low','other-normal']},availableGPUs:{}};
 const saved=Object.freeze({gpu_priority:'other-low',gpus:{missing:{enabled:true}}});
 const group=normalizeGroupConfig(saved,caps);
 assert.equal(group.gpu_priority,'other-low');
 assert.deepEqual(normalizeGroupConfig(group,caps),group);
 assert.equal(normalizeSettings({groups:{GPU:group}},caps).groups.GPU.gpu_priority,'other-low');
 assert.equal(normalizeGroupConfig({...group,gpu_priority:''},caps).gpu_priority,'');
 assert.ok(!('gpu_priority' in normalizeGroupConfig(saved,{})));
 assert.match(source,/config.gpu_priority \|\| \(gpu_selected/);
 assert.match(source,/Remove override/);
});


test('priority help distinguishes live Windows edits from next-launch Linux edits',()=>{
 assert.match(source,/Changes apply live, including while the core is starting/);
 assert.match(source,/Changes take effect on the next core launch/);
 assert.ok(!source.includes('Changes apply when the core reports work progress'));
});
