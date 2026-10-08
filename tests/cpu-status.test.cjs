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
const status = require('./cpu-status-loader.cjs');

function freeze(value) {
  if (value && typeof value == 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test('pure CPU status helpers accept frozen backend and draft inputs without mutation', () => {
  const allocation = {configured_cpus:8,allocated_workers:6,cpu_mode:'classes',
    cpu_class_counts:[8,0],potential_full_smt:true};
  const unit = {...allocation,group:'A',number:42,full_smt:false};
  const input = freeze({config:{cpu_mode:'classes'},classCounts:[8,0],groupName:'A',
    cpuAffinity:{group_allocations:{A:allocation},unit_allocations:{wu:unit}}});
  const before = JSON.stringify(input);
  assert.equal(status.matchingRuntimeAllocation(input),allocation);
  assert.deepEqual(status.matchingRuntimeUnits(input),[unit]);
  assert.deepEqual(status.matchingFullSMTUnits([unit]),[]);
  assert.equal(status.runtimeCPUShortage(allocation),allocation);
  assert.equal(status.hasSMTWarning({...input,cpuGroupCount:1,runtimeUnits:[unit],
    smtAllocation:status.runtimeSMTAllocation(allocation)}),false);
  assert.equal(JSON.stringify(input),before);
});

test('runtime matching rejects changed policy and stale class identities', () => {
  const input={config:{cpu_mode:'classes'},classCounts:[8,0],groupName:'A',
    cpuAffinity:{group_allocations:{A:{configured_cpus:8,cpu_mode:'classes',cpu_class_counts:[0,8]}},
      unit_allocations:{old:{group:'A',configured_cpus:8,cpu_mode:'classes',cpu_class_counts:[0,8]}}}};
  assert.equal(status.matchingRuntimeAllocation(input),undefined);
  assert.deepEqual(status.matchingRuntimeUnits(input),[]);
  input.classCounts=[0,8];input.allocationPolicyChanged=true;
  assert.equal(status.matchingRuntimeAllocation(input),undefined);
  assert.deepEqual(status.matchingRuntimeUnits(input),[]);
});

test('pure SMT display preserves confirmed WU precedence and restricted class topology', () => {
  const unit={full_smt:false};
  assert.equal(status.hasSMTWarning({config:{cpus:16},runtimeUnits:[unit],smtAllocation:{},cpuGroupCount:1}),false);
  assert.equal(status.hasSMTWarning({config:{},runtimeUnits:[unit],fullSMTUnits:[{full_smt:true}]}),true);
  assert.deepEqual(status.smtWarningClasses(true,[4,4],{performance_levels:[
    {logical_cpus:8,available_logical_cpus:4,physical_cpus:4},
    {logical_cpus:4,physical_cpus:2}]}),[1]);
  assert.deepEqual(status.smtWarningClasses(true,[4],{}),[]);
  assert.match(status.smtWarningText(),/^This configuration may/);
  assert.match(status.smtWarningText([{full_smt:true}]),/^Full SMT utilisation/);
});

test('missing runtime metadata degrades without inventing allocations or SMT', () => {
  const input={config:{cpus:8},classCounts:[]};
  assert.equal(status.matchingRuntimeAllocation(input),undefined);
  assert.deepEqual(status.matchingRuntimeUnits(input),[]);
  assert.equal(status.runtimeCPUShortage(),undefined);
  assert.equal(status.hasSMTWarning({...input,cpuGroupCount:1}),false);
});


test('higher-only SMT classes ignore Performance Level 1 GPU reservations', () => {
  const cpuAffinity={performance_levels:[
    {physical_cpus:4,available_logical_cpus:8},
    {physical_cpus:2,available_logical_cpus:4},
    {physical_cpus:1,available_logical_cpus:2}]};
  const input={config:{cpu_mode:'classes'},cpuAffinity,cpuGroupCount:1,
    gpuReservedCores:4,gpuReservedLogicalCpus:8};
  for (const counts of [[0,4,0],[0,0,2],[0,4,2]]) {
    assert.equal(status.hasSMTWarning({...input,classCounts:counts}),true);
    assert.deepEqual(status.smtWarningClasses(true,counts,cpuAffinity),
      counts.flatMap((count,i)=>count ? [i] : []));
  }
  for (const counts of [[0,3,0],[0,0,1],[0,3,1],[0,0,0]])
    assert.equal(status.hasSMTWarning({...input,classCounts:counts}),false);
  cpuAffinity.performance_levels[1]={physical_cpus:4,available_logical_cpus:4,logical_cpus:8};
  assert.equal(status.hasSMTWarning({...input,classCounts:[0,4,0]}),false);
  delete cpuAffinity.performance_levels[2].physical_cpus;
  assert.equal(status.hasSMTWarning({...input,classCounts:[0,0,2]}),false);
});


test('another group shortage does not mark a fully allocated selected group short', () => {
  const cpuAffinity={runtime_fallback:true,group_allocations:{
    A:{cpu_mode:'count',configured_cpus:4,allocated_workers:4},
    B:{cpu_mode:'count',configured_cpus:4,allocated_workers:2}}};
  const input={config:{cpu_mode:'count',cpus:4},cpuAffinity,groupName:'A'};
  assert.equal(status.runtimeCPUShortage(status.matchingRuntimeAllocation(input)),undefined);
  input.groupName='B';
  assert.equal(status.runtimeCPUShortage(status.matchingRuntimeAllocation(input)),cpuAffinity.group_allocations.B);
  input.allocationPolicyChanged=true;
  assert.equal(status.runtimeCPUShortage(status.matchingRuntimeAllocation(input)),undefined);
});

test('class warnings follow actual per-class WU policy and preserve zero class indices', () => {
  const counts=[2,0,1];
  const affinity={performance_levels:[{logical_cpus:2,physical_cpus:1},{},{logical_cpus:2,physical_cpus:1}]};
  const unit={full_smt:true,class_allocations:[{full_smt:true},{full_smt:false},{full_smt:false}]};
  const group={potential_full_smt:true,class_allocations:[{potential_full_smt:false},{},{potential_full_smt:true}]};
  assert.deepEqual(status.smtWarningClasses(true,counts,affinity,{runtimeUnits:[unit],smtAllocation:group}),[0]);
  assert.deepEqual(status.smtWarningClasses(true,counts,affinity,{smtAllocation:group}),[2]);
  unit.class_allocations[0].full_smt=false;
  assert.deepEqual(status.smtWarningClasses(true,counts,affinity,{runtimeUnits:[unit],smtAllocation:group}),[]);
  delete unit.class_allocations;
  assert.deepEqual(status.smtWarningClasses(true,counts,affinity,{runtimeUnits:[unit]}),[0,2]);
});

test('a single saturated draft class warns while other selected classes remain partial', () => {
  const input={config:{cpu_mode:'classes'},classCounts:[2,1],cpuGroupCount:1,
    cpuAffinity:{performance_levels:[{logical_cpus:2,physical_cpus:1},{logical_cpus:2,physical_cpus:1}]}};
  assert.equal(status.hasSMTWarning(input),true);
  input.classCounts=[1,1];
  assert.equal(status.hasSMTWarning(input),false);
});


test('draft SMT icons identify only saturated classes',()=>{
 const cpuAffinity={performance_levels:[
  {physical_cpus:1,available_logical_cpus:2},
  {physical_cpus:1,available_logical_cpus:2}]};
 for (const [counts,icons] of [[[2,1],[0]],[[1,2],[1]],[[2,2],[0,1]],[[1,1],[]],[[0,2],[1]],[[0,0],[]]]) {
  const warning=status.hasSMTWarning({config:{cpu_mode:'classes'},classCounts:counts,cpuAffinity,cpuGroupCount:1});
  assert.equal(warning,icons.length>0);
  assert.deepEqual(status.smtWarningClasses(warning,counts,cpuAffinity),icons);
 }
 delete cpuAffinity.performance_levels[0].physical_cpus;
 assert.deepEqual(status.smtWarningClasses(true,[2,2],cpuAffinity),[1]);
});

test('draft SMT icons deduct GPU reservations only from Performance Level 1',()=>{
 const cpuAffinity={performance_levels:[{physical_cpus:2,logical_cpus:4},{physical_cpus:1,logical_cpus:2}]};
 const reservations={gpuReservedCores:1,gpuReservedLogicalCpus:2};
 assert.deepEqual(status.smtWarningClasses(true,[2,1],cpuAffinity,reservations),[0]);
 assert.deepEqual(status.smtWarningClasses(true,[1,2],cpuAffinity,reservations),[1]);
 assert.deepEqual(status.smtWarningClasses(true,[2,2],cpuAffinity,reservations),[0,1]);
});
