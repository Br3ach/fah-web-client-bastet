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
const assert = require('node:assert/strict');
const {isDeepStrictEqual} = require('node:util');
const {test} = require('node:test');
const {reactive, computed} = require('vue');
const policy = require('./cpu-policy-loader.cjs');
const {component} = loadComponent('SettingsView.vue', {CommonSettings: {}, GroupSettings: {}});
function view() {
 const state=reactive({group:'GPU',config:{groups:{CPU:{cpu_mode:'count',cpus:6,gpus:{}},GPU:{cpu_mode:'count',cpus:0,gpu_reserved_cores:0,gpus:{GPU:{enabled:true}}}}},
  info:{cpus:16,gpus:{GPU:{supported:true,cuda:{}}},cpu_affinity:{available:16,gpu_cpu_reservation:true,class_selection:true,performance1_core_threads:[2,2,2,2],performance_levels:[{logical_cpus:8,available_logical_cpus:8},{logical_cpus:8,available_logical_cpus:8}]}}});
 state.initial_config=structuredClone(JSON.parse(JSON.stringify(state.config)));
 const ctx={mach:{get_info:()=>state.info},$util:{isEqual:isDeepStrictEqual}};
 for(const name of ['group','config','initial_config'])Object.defineProperty(ctx,name,{get:()=>state[name]});
 for(const [name,fn]of Object.entries(component.computed)){
  const value=computed(()=>fn.call(ctx));Object.defineProperty(ctx,name,{get:()=>value.value});
 }
 return {state,ctx};
}
test('Vue policy adapters react to draft reservations, CPU counts and selected group',()=>{
 const {state,ctx}=view();assert.equal(ctx.current_group_cpu_limit,16);assert.equal(ctx.cpu_config_valid,true);
 state.config.groups.GPU.gpu_reserved_cores=1;
 assert.equal(ctx.available_cpus,14);assert.equal(ctx.current_group_cpu_limit,8);
 assert.deepEqual(ctx.cpu_class_capacities,[6,8]);assert.equal(ctx.reservation_policy_changed,true);assert.equal(ctx.cpu_intent_changed,false);
 state.config.groups.CPU.cpus=15;assert.equal(ctx.cpu_config_valid,false);assert.equal(ctx.current_group_cpu_limit,0);
 state.group='CPU';assert.equal(ctx.current_group_cpu_limit,14);
 state.config.groups.CPU.cpus=6;state.initial_config=JSON.parse(JSON.stringify(state.config));
 assert.equal(ctx.cpu_intent_changed,false);
});
test('Vue policy adapters react to device support and topology changes',()=>{
 const {state,ctx}=view();state.config.groups.GPU.gpu_reserved_cores=1;
 assert.equal(ctx.gpu_reservation_plan.count,1);
 state.info.gpus.GPU.supported=false;assert.equal(ctx.gpu_reservation_plan.count,0);assert.equal(ctx.current_group_gpu_limit,0);
 state.info.gpus.GPU.supported=true;state.info.cpu_affinity.performance1_core_threads=[2];
 state.config.groups.GPU.gpu_reserved_cores=2;assert.equal(ctx.gpu_reservation_plan.valid,false);assert.equal(ctx.cpu_config_valid,false);
 state.info.cpu_affinity=undefined;state.config.groups.GPU.gpu_reserved_cores=0;
 assert.equal(ctx.cpu_class_supported,false);assert.equal(ctx.current_group_cpu_limit,16);
});
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
test('pure policy functions accept frozen plain inputs without Vue or mutation',()=>{
 const input=freeze({groups:{GPU:{cpu_mode:'count',cpus:0,gpu_reserved_cores:1,gpus:{GPU:{enabled:true}}}},
  saved_groups:{GPU:{cpu_mode:'count',cpus:0,gpu_reserved_cores:0,gpus:{GPU:{enabled:true}}}},group:'GPU',
  info:{cpus:4,gpus:{GPU:{supported:true,cuda:{}}}},cpu_affinity:{available:4,gpu_cpu_reservation:true,performance1_core_threads:[2,2],performance_levels:[{logical_cpus:4}]},isEqual:isDeepStrictEqual});
 const plan=policy.gpuReservationPlan(input);assert.deepEqual(plan,{count:1,valid:true,sharedBlocked:false,logical:2});
 assert.equal(policy.currentGroupGPULimit(input),2);
 assert.equal(policy.cpuIntentChanged(input),false);assert.equal(policy.reservationPolicyChanged(input),true);assert.equal(policy.gpuSelectionChanged(input),false);
 assert.equal(policy.availableCPUs({...input,gpu_reservation_plan:plan}),2);
 assert.deepEqual(policy.classCapacities({...input,gpu_reservation_plan:plan}),[2]);
 assert.equal(input.groups.GPU.gpu_reserved_cores,1);
});

test('legacy validation and empty class limits retain short-circuit evaluation',()=>{
 const {state,ctx}=view();state.info.cpu_affinity=undefined;
 state.config.groups.GPU.gpu_reserved_cores=1;
 assert.equal(ctx.cpu_config_valid,false);
 assert.deepEqual(ctx.current_group_class_limits,[]);
});

test('active GPU selections are cached across policy reads and react to permissions',()=>{
 const {state,ctx}=view();const active=ctx.active_gpus;
 assert.deepEqual(active.GPU,{ids:['GPU'],count:1});
 void ctx.gpu_reservation_plan;void ctx.current_group_gpu_limit;void ctx.cpu_intent_changed;
 assert.equal(ctx.active_gpus,active);
 state.config.groups.GPU.cuda=false;
 assert.deepEqual(ctx.active_gpus.GPU,{ids:[],count:0});
 assert.deepEqual(ctx.saved_active_gpus.GPU,{ids:['GPU'],count:1});
 assert.equal(ctx.gpu_selection_changed,true);
 state.info.gpus.GPU.supported=false;
 assert.deepEqual(ctx.saved_active_gpus.GPU,{ids:[],count:0});
 assert.equal(ctx.gpu_selection_changed,false);
});

test('reservation capacity falls back to machine CPUs when affinity metadata is missing',()=>{
 assert.equal(policy.availableCPUs({info:{cpus:16},cpu_affinity:undefined,
  gpu_reservation_plan:{count:1,logical:2}}),14);
 assert.equal(policy.availableCPUs({info:{cpus:1},cpu_affinity:null,
  gpu_reservation_plan:{count:1,logical:2}}),0);
});


test('CPU numeric validation rejects malformed values before every early return',()=>{
 const invalid=[-1,1.5,4294967296,NaN,Infinity,-Infinity,'4',null,true];
 for(const cpu_intent_changed of [false,true])
  for(const cpu_managed_mode of [false,true]) {
   const input={cpu_intent_changed,cpu_managed_mode,cpu_class_supported:false,
    gpu_selection_changed:false,gpu_reservation_plan:{count:0,valid:true}};
   for(const value of invalid) {
    assert.equal(policy.cpuConfigValid({...input,groups:{A:{cpus:value}}}),false);
    assert.equal(policy.cpuConfigValid({...input,groups:{A:{cpu_mode:'classes',cpu_class_counts:[value]}}}),false);
    assert.equal(policy.cpuConfigValid({...input,groups:{A:{cpu_mode:'count',cpu_class_counts:[value]}}}),false);
   }
   for(const value of [null,{},'4',4])
    assert.equal(policy.cpuConfigValid({...input,groups:{A:{cpu_class_counts:value}}}),false);
   assert.equal(policy.cpuConfigValid({...input,groups:{A:{cpu_class_counts:Array(1)}}}),false);
  }
});

test('uint32 boundaries and missing optional CPU fields retain legacy defaults',()=>{
 const input={cpu_intent_changed:true,cpu_managed_mode:false,cpu_class_supported:false,
  gpu_reservation_plan:{count:0,valid:true}};
 for(const cpus of [0,1,4294967295])
  assert.equal(policy.cpuConfigValid({...input,groups:{A:{cpus,cpu_class_counts:[cpus]}}}),true);
 assert.equal(policy.cpuConfigValid({...input,groups:{A:{}}}),true);
});


test('restricted affinity uses raw draft capacity until a GPU reservation is active',()=>{
 const {state,ctx}=view();
 state.info.cpu_affinity.available=8;
 for(const level of state.info.cpu_affinity.performance_levels)level.available_logical_cpus=4;
 state.config.groups.CPU.cpus=0;
 Object.assign(state.config.groups.GPU,{cpu_mode:'classes',cpu_class_counts:[8,8],cpus:16});
 assert.equal(ctx.available_cpus,16);
 assert.equal(ctx.current_group_cpu_limit,16);
 assert.deepEqual(Array.from(ctx.cpu_class_capacities),[8,8]);
 assert.equal(ctx.cpu_config_valid,true);
 state.config.groups.GPU.gpu_reserved_cores=1;
 assert.equal(ctx.available_cpus,6);
 assert.deepEqual(Array.from(ctx.cpu_class_capacities),[2,4]);
 assert.equal(ctx.cpu_config_valid,false);
});

test('draft class warning uses current capacity before Save without relying on applied fallback',()=>{
 const input={config:{cpu_mode:'classes'},classCounts:[8,0],
  cpuAffinity:{effective_classes:true,runtime_fallback:false,performance_levels:[
    {logical_cpus:8,available_logical_cpus:4},{logical_cpus:8,available_logical_cpus:8}]}};
 assert.match(policy.classCapacityWarning(input),/Fewer workers.*selected performance levels/);
 assert.equal(input.cpuAffinity.runtime_fallback,false);
 assert.equal(policy.classCapacityWarning({...input,classCounts:[4,0]}),'');
 assert.match(policy.classCapacityWarning({...input,classCounts:[4,0],reservedLogicalCpus:2}),/class capacity/);
 assert.equal(policy.classCapacityWarning({...input,classCounts:[0,8],reservedLogicalCpus:4}),'');
 assert.match(policy.classCapacityWarning({...input,classCounts:[0,0,1]}),/class capacity/);
 assert.match(policy.classCapacityWarning({...input,cpuAffinity:{effective_classes:false}}),/will wait rather than move/);
 assert.equal(policy.classCapacityWarning({...input,classCounts:[0,0]}),'');
 assert.equal(policy.classCapacityWarning({...input,config:{cpu_mode:'count'}}),'');
 const {state,ctx}=view();state.info.cpu_affinity.runtime_fallback=true;
 assert.equal(ctx.cpu_runtime_fallback,true);
 state.config.groups.CPU.cpus=7;assert.equal(ctx.cpu_runtime_fallback,false);
});

test('General oversubscription matches backend intent and mode transitions',()=>{
 const {state,ctx}=view();
 state.config.groups.CPU.cpus=12;state.config.groups.GPU.cpus=12;
 assert.equal(ctx.current_group_cpu_limit,16);assert.equal(ctx.cpu_config_valid,true);
 state.group='CPU';assert.equal(ctx.current_group_cpu_limit,16);
 state.config.groups.GPU.gpu_reserved_cores=1;
 assert.equal(ctx.current_group_cpu_limit,2);assert.equal(ctx.cpu_config_valid,false);
 state.config.groups.GPU.gpu_reserved_cores=0;
 assert.equal(ctx.current_group_cpu_limit,16);assert.equal(ctx.cpu_config_valid,true);
 // Class mode, even with zero demand, retains backend aggregate validation.
 Object.assign(state.config.groups.GPU,{cpu_mode:'classes',cpu_class_counts:[0,0],cpus:0});
 state.config.groups.CPU.cpus=17;
 assert.equal(ctx.cpu_config_valid,false);
 state.config.groups.CPU.cpus=12;
 assert.equal(ctx.cpu_config_valid,true);
 Object.assign(state.config.groups.GPU,{cpu_class_counts:[8,0],cpus:8});
 assert.equal(ctx.current_group_cpu_limit,8);assert.equal(ctx.cpu_config_valid,false);
 Object.assign(state.config.groups.GPU,{cpu_mode:'count',cpus:12});
 assert.equal(ctx.current_group_cpu_limit,16);assert.equal(ctx.cpu_config_valid,true);
 state.config.groups.CPU.cpus=-1;assert.equal(ctx.cpu_config_valid,false);
});


test('class draft becomes invalid when topology support disappears before save', () => {
 const {state,ctx}=view();
 Object.assign(state.config.groups.CPU,{cpu_mode:'classes',cpus:8,cpu_class_counts:[4,4]});
 state.initial_config=JSON.parse(JSON.stringify(state.config));
 Object.assign(state.config.groups.CPU,{cpus:10,cpu_class_counts:[6,4]});
 assert.equal(ctx.cpu_class_supported,true);assert.equal(ctx.cpu_config_valid,true);
 state.info.cpu_affinity.class_selection=false;
 assert.equal(ctx.cpu_class_supported,false);assert.equal(ctx.cpu_config_valid,false);
 assert.deepEqual(state.config.groups.CPU.cpu_class_counts,[6,4]);
 state.info.cpu_affinity.class_selection=true;assert.equal(ctx.cpu_config_valid,true);
});
