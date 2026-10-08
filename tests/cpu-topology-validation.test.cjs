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
const assert = require('node:assert/strict');
const {isDeepStrictEqual} = require('node:util');
const {test} = require('node:test');
const policy = require('./cpu-policy-loader.cjs');
function valid(initial, groups, levels) {
  const ctx = {saved_groups:initial, groups, cpu_managed_mode:true,
    cpu_class_supported:true, cpu_affinity:{performance_levels:levels.map(logical_cpus=>({logical_cpus}))},
    available_cpus:levels.reduce((a,b)=>a+b,0), isEqual:isDeepStrictEqual};
  ctx.cpu_intent_changed = policy.cpuIntentChanged(ctx);
  return policy.cpuConfigValid(ctx);
}
const saved = {A:{cpu_mode:'classes',cpu_class_counts:[2,2,0]},B:{cpu_mode:'count',cpus:1}};
test('another group can edit count with unchanged mismatched class vector',()=>{
  const next=structuredClone(saved);next.B.cpus=2;assert.equal(valid(saved,next,[4,4]),true);
});
test('nonzero saved missing class counts still contribute to total',()=>{
  const initial=structuredClone(saved);initial.A.cpu_class_counts=[2,2,3];
  const next=structuredClone(initial);next.B.cpus=2;assert.equal(valid(initial,next,[4,4]),false);
  next.B.cpus=1;assert.equal(valid(initial,next,[4,4]),true);
});
test('changing a mismatched vector is rejected',()=>{
  const next=structuredClone(saved);next.A.cpu_class_counts=[1,2,0];assert.equal(valid(saved,next,[4,4]),false);
});
test('new mismatched class group is rejected',()=>{
  const next=structuredClone(saved);next.C={cpu_mode:'classes',cpu_class_counts:[0,0,0]};assert.equal(valid(saved,next,[4,4]),false);
});
test('aggregate class and machine limits remain enforced',()=>{
  const next=structuredClone(saved);next.B.cpus=5;assert.equal(valid(saved,next,[4,4]),false);
  next.B.cpus=2;assert.equal(valid(saved,next,[1,7]),false);
});

test('an open draft is revalidated when topology shrinks, without truncating saved intent',()=>{
  const initial={A:{cpu_mode:'classes',cpu_class_counts:[2,2]},B:{cpu_mode:'count',cpus:1}};
  const draft=structuredClone(initial);draft.B.cpus=2;
  assert.equal(valid(initial,draft,[4,4]),true);
  assert.equal(valid(initial,draft,[2,2]),false);
  assert.deepEqual(draft.A.cpu_class_counts,[2,2]);
  assert.equal(valid(initial,draft,[4,4]),true);
});


test('GPU reservation intent is uint32 even for inactive GPUs and unchanged policy', () => {
  for (const value of [-1, 1.5, 0x100000000, NaN, Infinity, '1', null]) {
    const groups = {GPU: {cpus: 0, gpus: {}, gpu_reserved_cores: value}};
    const plan = policy.gpuReservationPlan({groups, info: {gpus: {}}});
    assert.equal(plan.valid, false, String(value));
    for (const changed of [false, true])
      assert.equal(policy.cpuConfigValid({groups, gpu_reservation_plan: plan,
        cpu_intent_changed: changed, cpu_managed_mode: false,
        cpu_class_supported: false}), false, String(value));
  }
  for (const value of [undefined, 0, 0xffffffff]) {
    const groups = {GPU: {cpus: 0, gpus: {}, gpu_reserved_cores: value}};
    const plan = policy.gpuReservationPlan({groups, info: {gpus: {}}});
    assert.equal(plan.valid, true);
    assert.equal(policy.cpuConfigValid({groups, gpu_reservation_plan: plan,
      cpu_intent_changed: false}), true);
  }
});


test('topology loss preserves unchanged classes and permits General edits or class removal', () => {
 const initial={A:{cpu_mode:'classes',cpus:8,cpu_class_counts:[4,4]},
  B:{cpu_mode:'count',cpus:1}};
 const check=groups=>policy.cpuConfigValid({groups,saved_groups:initial,
  cpu_intent_changed:policy.cpuIntentChanged({groups,saved_groups:initial,isEqual:isDeepStrictEqual}),
  gpu_selection_changed:false,cpu_managed_mode:policy.managedMode({groups}),
  cpu_class_supported:false,gpu_reservation_plan:{count:0,valid:true},isEqual:isDeepStrictEqual});
 assert.equal(check(structuredClone(initial)),true);
 const general=structuredClone(initial);general.B.cpus=2;assert.equal(check(general),true);
 const changed=structuredClone(initial);changed.A.cpu_class_counts=[6,4];assert.equal(check(changed),false);
 const switched=structuredClone(initial);switched.A.cpu_mode='count';assert.equal(check(switched),true);
 const removed=structuredClone(initial);delete removed.A;assert.equal(check(removed),true);
 const added=structuredClone(initial);added.C={cpu_mode:'classes',cpu_class_counts:[0,0]};
 assert.equal(check(added),false);
 const newMode=structuredClone(initial);newMode.B.cpu_mode='classes';newMode.B.cpu_class_counts=[0,1];
 assert.equal(check(newMode),false);
});
