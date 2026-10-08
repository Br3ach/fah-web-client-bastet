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
const {normalizeGroupConfig,normalizeAccountConfig,normalizeSettings} = require('./settings-normalization-loader.cjs');

function freeze(value) {
  if (value && typeof value == 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test('normalization retains supported intent and returns detached group values', () => {
  const config=freeze({cpus:7,cpu_mode:'classes',cpu_class_counts:[6,1],gpu_reserved_cores:2,
    gpus:{detected:{enabled:true},missing:{enabled:true},disabledMissing:{enabled:false}},
    on_battery:true,keep_awake:true,pin_to_perf_cores:true});
  const capabilities=freeze({cpuAffinity:{gpu_cpu_reservation:false},availableGPUs:{detected:{},new:{}},batterySettings:true});
  const before=JSON.stringify(config);
  const normalized=normalizeGroupConfig(config,capabilities);
  assert.deepEqual(normalized.cpu_class_counts,[6,1]);
  assert.notEqual(normalized.cpu_class_counts,config.cpu_class_counts);
  assert.deepEqual(normalized.gpus,{detected:{enabled:true},new:{enabled:false},missing:{enabled:true}});
  assert.equal(normalized.gpu_reserved_cores,2);
  assert.equal(normalized.on_battery,true);
  assert.equal(normalized.keep_awake,true);
  assert.equal(normalized.cuda,true);assert.equal(normalized.hip,true);
  assert.ok(!('pin_to_perf_cores' in normalized));
  assert.equal(JSON.stringify(config),before);
  assert.deepEqual(normalizeGroupConfig(normalized,capabilities),normalized);
});

test('legacy capabilities omit unsupported fields without rewriting the source', () => {
  const input={cpu_mode:'classes',cpu_class_counts:[3,2],gpu_reserved_cores:1,on_battery:true,keep_awake:true};
  const result=normalizeGroupConfig(input);
  for(const key of ['cpu_mode','cpu_class_counts','gpu_reserved_cores','on_battery','keep_awake'])
    assert.ok(!(key in result));
  assert.equal(result.cpus,0);assert.equal(result.on_idle,false);
  assert.deepEqual(result.gpus,{});
  assert.deepEqual(input.cpu_class_counts,[3,2]);
});

test('draft payloads and backend snapshots normalize identically including accounts and GPUs', () => {
  const draft=freeze({user:'Tester',team:42,passkey:'abc',cause:'Cancer',groups:{A:{cpus:4,gpus:{lost:{enabled:true}}}}});
  const backend=freeze({config:{user:'Tester',team:42,passkey:'abc',cause:'cancer',ignored:'value'},
    groups:{A:{runtime:'ignored',config:{cpus:4,gpus:{lost:{enabled:true},disabled:{enabled:false}}}}}});
  const capabilities=freeze({availableGPUs:{new:{}},cpuAffinity:{},loggedIn:false});
  const expected=normalizeSettings(draft,capabilities);
  assert.deepEqual(normalizeSettings(backend,capabilities),expected);
  assert.deepEqual(normalizeSettings(expected,capabilities),expected);
  assert.equal(expected.cause,'cancer');
  const linked=normalizeSettings(draft,{...capabilities,loggedIn:true});
  assert.deepEqual(Object.keys(linked),['groups']);
});

test('pre-resource-group snapshots retain default-group settings and normalize account defaults', () => {
  const data={config:{user:'Tester',cause:'unspecified',cpus:6,on_idle:true,gpus:{gpu:{enabled:true}}}};
  const normalized=normalizeSettings(data,{availableGPUs:{gpu:{}}});
  assert.equal(normalized.groups[''].cpus,6);
  assert.equal(normalized.groups[''].on_idle,true);
  assert.deepEqual(normalized.groups[''].gpus,{gpu:{enabled:true}});
  assert.equal(normalized.cause,'any');
  assert.equal(normalizeAccountConfig({cause:'Any'}).cause,'any');
  assert.deepEqual(normalizeSettings({config:{},groups:{}},{loggedIn:true}),{groups:{}});
});
