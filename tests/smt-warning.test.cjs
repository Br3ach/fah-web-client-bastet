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

const loadComponent = require('./gpu-policy-loader.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {isDeepStrictEqual}=require('node:util');
const {test}=require('node:test');
const {source: text, component: c} = loadComponent('GroupSettings.vue');
function warning(config,extra={}) {
 const ctx={$util:{isEqual:isDeepStrictEqual},config,cpuAffinity:{physical_cpus:8,available:16,performance_levels:[{physical_cpus:4,logical_cpus:8},{physical_cpus:4,logical_cpus:8}]},gpuReservedCores:0,gpuReservedLogicalCpus:0,cpuGroupCount:1,...extra};
 ctx.class_counts=config.cpu_class_counts||[];
 ctx.runtime_cpu_allocation=c.computed.runtime_cpu_allocation.call(ctx);
 ctx.runtime_cpu_units=c.computed.runtime_cpu_units.call(ctx);
 ctx.runtime_full_smt_units=c.computed.runtime_full_smt_units.call(ctx);
 ctx.runtime_smt_allocation=c.computed.runtime_smt_allocation.call(ctx);
 return c.computed.smt_warning.call(ctx);
}
test('full SMT warning is advisory and does not appear merely above physical count',()=>{
 for(const cpus of [0,8,9,12,14,15,17])assert.equal(warning({cpus}),false);
 assert.equal(warning({cpus:16}),true);assert.equal(warning({cpus:16},{cpuAffinity:{}}),false);
});
test('GPU reservation adjusts full capacity to seven cores and fourteen LPs',()=>{
 const extra={gpuReservedCores:1,gpuReservedLogicalCpus:2};
 assert.equal(warning({cpus:13},extra),false);assert.equal(warning({cpus:14},extra),true);
});
test('class selection evaluates selected pool capacity',()=>{
 assert.equal(warning({cpu_mode:'classes',cpu_class_counts:[7,0]}),false);
 assert.equal(warning({cpu_mode:'classes',cpu_class_counts:[8,0]}),true);
 assert.equal(warning({cpu_mode:'classes',cpu_class_counts:[8,7]}),true);
 assert.equal(warning({cpu_mode:'classes',cpu_class_counts:[8,8]}),true);
});
test('multiple CPU groups use authoritative per-group whole-core capacities',()=>{
 const cpuAffinity={physical_cpus:8,available:16,group_allocations:{A:{configured_cpus:8,cpu_mode:'count',potential_full_smt:true,pool_logical_cpus:8,pool_physical_cpus:4}}};
 assert.equal(warning({cpus:8},{cpuAffinity,groupName:'A',cpuGroupCount:2}),true);
 assert.equal(warning({cpus:7},{cpuAffinity,groupName:'A',cpuGroupCount:2}),false);
 assert.equal(warning({cpus:16},{cpuAffinity,groupName:'B',cpuGroupCount:2}),false);
});
test('changed class policy cannot reuse an old full-SMT warning',()=>{
 const cpuAffinity={group_allocations:{A:{configured_cpus:8,cpu_mode:'classes',cpu_class_counts:[8,0],potential_full_smt:true}}};
 assert.equal(warning({cpu_mode:'classes',cpu_class_counts:[8,0]},{cpuAffinity,groupName:'A',cpuGroupCount:2}),true);
 assert.equal(warning({cpu_mode:'classes',cpu_class_counts:[0,8]},{cpuAffinity,groupName:'A',cpuGroupCount:2}),false);
});
test('non-SMT and legacy partial metadata do not generate false warnings',()=>{
 assert.equal(warning({cpus:8},{cpuAffinity:{physical_cpus:8,available:8}}),false);
 assert.equal(warning({cpus:8},{cpuAffinity:{group_allocations:{'':{logical_cpus:8,physical_cpus:4}}},cpuGroupCount:2}),false);
 assert(!text.includes('worker placement'));assert(!text.includes('Keeping SMT siblings'));
});

test('full SMT in an individual WU warns even when its RG total is below full capacity',()=>{
 const cpuAffinity={physical_cpus:8,available:16,unit_allocations:{B:{group:'A',number:42,
   configured_cpus:14,cpu_mode:'count',allocated_workers:6,logical_cpus:6,
   physical_cpus:3,full_smt:true}},group_allocations:{A:{configured_cpus:14,cpu_mode:'count',full_smt:false}}};
 assert.equal(warning({cpus:14},{cpuAffinity,groupName:'A',cpuGroupCount:2}),true);
 assert.equal(warning({cpus:13},{cpuAffinity,groupName:'A',cpuGroupCount:2}),false);
 assert.equal(warning({cpus:14},{cpuAffinity,groupName:'C',cpuGroupCount:2}),false);
 const ctx={config:{cpus:14},cpuAffinity,groupName:'A',class_counts:[]};
 ctx.runtime_cpu_units=c.computed.runtime_cpu_units.call(ctx);
 assert.deepEqual(c.computed.runtime_full_smt_units.call(ctx).map(u=>u.number),[42]);
});


test('other allocation policy edits invalidate saved RG and WU SMT metadata',()=>{
 const cpuAffinity={physical_cpus:8,available:16,
  group_allocations:{A:{configured_cpus:8,cpu_mode:'count',potential_full_smt:true}},
  unit_allocations:{one:{group:'A',number:1,configured_cpus:8,cpu_mode:'count',full_smt:true}}};
 const extra={cpuAffinity,groupName:'A',cpuGroupCount:1,allocationPolicyChanged:true};
 // The other eight-worker group was reduced to zero in the draft. The
 // remaining eight workers can spread over eight physical cores after Save.
 assert.equal(warning({cpus:8},extra),false);
 // A draft that still fills SMT capacity must retain the prospective warning.
 assert.equal(warning({cpus:16},extra),true);
 // Unrelated edits may continue displaying the current saved allocation.
 assert.equal(warning({cpus:8},{...extra,allocationPolicyChanged:false}),true);
});

test('reservation edits do not reuse a full-SMT estimate from the previous pool',()=>{
 const cpuAffinity={physical_cpus:8,available:16,
  group_allocations:{A:{configured_cpus:14,cpu_mode:'count',potential_full_smt:true}}};
 // Removing a reservation changes the CPU pool from 14 LPs to 16 LPs.
 assert.equal(warning({cpus:14},{cpuAffinity,groupName:'A',cpuGroupCount:1,
  allocationPolicyChanged:true,gpuReservedCores:0,gpuReservedLogicalCpus:0}),false);
});

 test('missing class metadata cannot match an empty saved vector',()=>{
  const cpuAffinity={group_allocations:{A:{configured_cpus:0,cpu_mode:'classes',full_smt:true}},
   unit_allocations:{one:{group:'A',configured_cpus:0,cpu_mode:'classes',full_smt:true}}};
  assert.equal(warning({cpu_mode:'classes',cpu_class_counts:[]},{cpuAffinity,groupName:'A',cpuGroupCount:2}),false);
 });


test('warning icon targets selected SMT classes and excludes single-thread cores',()=>{
 const ctx={smt_warning:true,class_counts:[12,4],cpuAffinity:{performance_levels:[
  {physical_cpus:6,logical_cpus:12},{physical_cpus:4,logical_cpus:4}]}};
 assert.deepEqual(c.computed.smt_warning_classes.call(ctx),[0]);
 ctx.class_counts=[0,4];
 assert.deepEqual(c.computed.smt_warning_classes.call(ctx),[]);
 ctx.smt_warning=false;ctx.class_counts=[12,4];
 assert.deepEqual(c.computed.smt_warning_classes.call(ctx),[]);
 ctx.smt_warning=true;ctx.cpuAffinity={};
 assert.deepEqual(c.computed.smt_warning_classes.call(ctx),[]);
});

test('SMT help retains the advisory text and existing help defaults',()=>{
 assert.equal(c.computed.smt_warning_text.call({runtime_full_smt_units:[{number:1}]}),
  'Full SMT utilisation may reduce performance. Using all hardware threads of an allocated physical-core pool can increase contention. Some CPU workloads may perform better with one fewer worker. Consider reducing the CPU count by one and comparing performance.');
 const help=fs.readFileSync(path.join(__dirname,'../src/HelpBalloon.vue'),'utf8');
 const component=new Function(help.match(/<script>([\s\S]*?)<\/script>/)[1].replace('export default','return'))();
 assert.equal(component.props.icon.default,'question-circle');
 assert.equal(component.props.iconOnly,Boolean);
 assert.equal(component.data().active,false);
 assert.ok(!text.includes('.cpu-smt-warning(v-if='));
 assert.ok(text.includes('smt_warning_classes.includes(i)'));
 assert.ok(text.includes('Affected work units:'));
});


test('SMT icon uses available logical capacity with the legacy metadata fallback',()=>{
 const level={logical_cpus:8,available_logical_cpus:4,physical_cpus:4};
 const ctx={smt_warning:true,class_counts:[4],cpuAffinity:{performance_levels:[level]},
  runtime_cpu_units:[{full_smt:true}]};
 assert.deepEqual(c.computed.smt_warning_classes.call(ctx),[]);
 level.available_logical_cpus=0;
 assert.deepEqual(c.computed.smt_warning_classes.call(ctx),[]);
 level.available_logical_cpus=8;
 assert.deepEqual(c.computed.smt_warning_classes.call(ctx),[0]);
 delete level.available_logical_cpus;
 assert.deepEqual(c.computed.smt_warning_classes.call(ctx),[0]);
});


test('known WU policy overrides group predictions but drafts retain prospective help',()=>{
 const unit={group:'A',configured_cpus:16,cpu_mode:'count',full_smt:false};
 const cpuAffinity={physical_cpus:8,available:16,
  group_allocations:{A:{configured_cpus:16,cpu_mode:'count',potential_full_smt:true}},
  unit_allocations:{one:unit}};
 const extra={cpuAffinity,groupName:'A',cpuGroupCount:1};
 assert.equal(warning({cpus:16},extra),false);
 unit.full_smt=true;
 assert.equal(warning({cpus:16},extra),true);
 unit.full_smt=false;
 assert.equal(warning({cpus:16},{...extra,allocationPolicyChanged:true}),true);
 delete cpuAffinity.unit_allocations;
 assert.equal(warning({cpus:16},{...extra,cpuGroupCount:2}),true);
 assert.match(c.computed.smt_warning_text.call({}),/^This configuration may fully utilise SMT/);
});


test('class icon computed forwards both GPU reservation quantities',()=>{
 const ctx={smt_warning:true,class_counts:[2,1],
  cpuAffinity:{performance_levels:[{physical_cpus:2,logical_cpus:4},{physical_cpus:1,logical_cpus:2}]},
  runtime_cpu_units:[],runtime_smt_allocation:undefined,
  gpuReservedCores:1,gpuReservedLogicalCpus:2};
 assert.deepEqual(c.computed.smt_warning_classes.call(ctx),[0]);
 ctx.gpuReservedCores=0;
 assert.deepEqual(c.computed.smt_warning_classes.call(ctx),[]);
 ctx.gpuReservedCores=1;ctx.gpuReservedLogicalCpus=0;
 assert.deepEqual(c.computed.smt_warning_classes.call(ctx),[]);
});
