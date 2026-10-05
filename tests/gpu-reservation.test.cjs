require('./gpu-policy-loader.cjs');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {isDeepStrictEqual} = require('node:util');
const {test} = require('node:test');
function load(name) {
  const text=fs.readFileSync(path.join(__dirname,'../src/',name+'.vue'),'utf8');
  const script=text.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm,'').replace(/^import .*$/gm,'').replace('export default','return');
  return {text,component:new Function('CommonSettings','GroupSettings',script)({}, {})};
}
const settings=load('SettingsView').component;
const groupView=load('GroupSettings');
const gpu=(n,cpus=0)=>({cpu_mode:'count',cpus,gpu_reserved_cores:n,gpus:{GPU:{enabled:true}}});
function context(groups,initial=groups,widths=[2,2,2,2]) {
 const ctx={groups,initial_config:{groups:structuredClone(initial)},group:'A',
  info:{gpus:{GPU:{supported:true,cuda:{}},GPU2:{supported:true,cuda:{}},NEW:{supported:true,cuda:{}}},cpus:10,cpu_affinity:{available:10,gpu_cpu_reservation:true,
   performance1_core_threads:widths,performance_levels:[{logical_cpus:8,available_logical_cpus:8},{logical_cpus:2,available_logical_cpus:2}]}},
  $util:{isEqual:isDeepStrictEqual}};
 for(const name of ['cpu_affinity','gpu_reservation_plan','available_cpus','cpu_class_capacities','current_group_gpu_limit','cpu_managed_mode','cpu_class_supported','cpu_policy_changed','gpu_policy_changed','cpu_config_valid','current_group_cpu_limit','current_group_class_limits'])
  Object.defineProperty(ctx,name,{get:()=>settings.computed[name].call(ctx)});
 return ctx;
}
test('zero reserves nothing and excludes cores reserved by other groups',()=>{
 const ctx=context({A:gpu(0,10)});assert.equal(ctx.available_cpus,10);assert.equal(ctx.gpu_reservation_plan.count,0);
 assert.equal(ctx.cpu_managed_mode,false);assert.equal(ctx.current_group_gpu_limit,4);
 const initial={A:gpu(0,6),B:gpu(0)};
 const groups=structuredClone(initial);groups.B.gpu_reserved_cores=2;
 const shared=context(groups,initial);
 assert.equal(shared.available_cpus,6);
 assert.deepEqual(shared.cpu_class_capacities,[4,2]);
 assert.equal(shared.current_group_gpu_limit,2);
 assert.equal(shared.cpu_config_valid,true);
 groups.A.cpus=7;assert.equal(shared.cpu_config_valid,false);
});
test('unsaved reservation reduces total and class capacities immediately',()=>{
 const initial={A:gpu(0,0),B:{cpu_mode:'count',cpus:8}};
 const groups=structuredClone(initial);groups.A.gpu_reserved_cores=1;
 const ctx=context(groups,initial);assert.equal(ctx.available_cpus,8);assert.deepEqual(ctx.cpu_class_capacities,[6,2]);
 assert.equal(ctx.cpu_policy_changed,true);assert.equal(ctx.cpu_config_valid,true);
 groups.B.cpus=9;assert.equal(ctx.cpu_config_valid,false);
});
test('reservation alone cannot save an overlapping explicit class allocation',()=>{
 const initial={A:gpu(0),B:{cpu_mode:'classes',cpu_class_counts:[8,0]}};
 const groups=structuredClone(initial);groups.A.gpu_reserved_cores=1;
 assert.equal(context(groups,initial).cpu_config_valid,false);
 groups.B.cpu_class_counts=[6,0];assert.equal(context(groups,initial).cpu_config_valid,true);
});
test('each RG maximum accounts for other reservations and allows all cores',()=>{
 const ctx=context({A:gpu(1),B:gpu(2)});assert.equal(ctx.current_group_gpu_limit,2);
 assert.equal(ctx.available_cpus,4);ctx.groups.A.gpu_reserved_cores=2;
 assert.equal(ctx.available_cpus,2);assert.equal(ctx.gpu_reservation_plan.valid,true);
 ctx.groups.A.gpu_reserved_cores=3;assert.equal(ctx.gpu_reservation_plan.valid,false);
});
test('GPU deselection makes saved reservation inactive and releases capacity',()=>{
 const initial={A:gpu(2)};const groups=structuredClone(initial);groups.A.gpus.GPU.enabled=false;
 const ctx=context(groups,initial);assert.equal(ctx.available_cpus,10);assert.equal(ctx.cpu_policy_changed,true);
 assert.equal(ctx.cpu_config_valid,true);
 assert.equal(groupView.component.computed.gpu_selected.call({config:groups.A}),false);
 assert.match(groupView.text,/:disabled="!gpu_selected \|\| !gpu_reservation_supported"/);
});
test('each selected GPU receives a separate whole-core reservation',()=>{
 const groups={A:gpu(1)};groups.A.gpus.GPU2={enabled:true};
 const ctx=context(groups);
 assert.equal(ctx.gpu_reservation_plan.count,2);
 assert.equal(ctx.gpu_reservation_plan.logical,4);
 assert.equal(ctx.current_group_gpu_limit,2);
 groups.A.gpu_reserved_cores=3;assert.equal(ctx.gpu_reservation_plan.valid,false);
});
test('fractional, negative, excessive and unsupported reservations cannot save',()=>{
 for(const n of [-1,1.5,5]) {
  const ctx=context({A:gpu(n)},{A:gpu(0)});assert.equal(ctx.cpu_config_valid,false);
 }
 const ctx=context({A:gpu(1)},{A:gpu(0)});ctx.info.cpu_affinity.gpu_cpu_reservation=false;
 assert.equal(ctx.cpu_config_valid,false);
});
test('unrelated edits preserve saved reservations during temporary core loss',()=>{
 const initial={A:gpu(3)};const groups=structuredClone(initial);groups.A.beta=true;
 const ctx=context(groups,initial,[2]);assert.equal(ctx.gpu_reservation_plan.valid,false);
 assert.equal(ctx.cpu_policy_changed,false);assert.equal(ctx.cpu_config_valid,true);
});
test('mixed core widths are subtracted as whole cores',()=>{
 const ctx=context({A:gpu(2)},{A:gpu(0)},[1,2,1]);
 assert.equal(ctx.gpu_reservation_plan.logical,3);assert.equal(ctx.available_cpus,7);
});
test('reservation survives group config normalization for saves and reconnects',()=>{
 const ctx={version:'8.5.7',cpu_affinity:{gpu_cpu_reservation:true},available_gpus:{GPU:{}},$util:{version_less:()=>true}};
 const out=settings.methods.get_group_config.call(ctx,gpu(2));
 assert.equal(out.gpu_reserved_cores,2);assert.deepEqual(out.gpus,{GPU:{enabled:true}});
});

test('all performance cores cannot be reserved while another GPU group shares',()=>{
 const initial={A:gpu(0),B:gpu(0)};
 const groups=structuredClone(initial);groups.A.gpu_reserved_cores=4;
 const ctx=context(groups,initial);
 assert.equal(ctx.gpu_reservation_plan.sharedBlocked,true);
 assert.equal(ctx.cpu_config_valid,false);
 groups.A.gpu_reserved_cores=3;assert.equal(ctx.cpu_config_valid,true);
 groups.B.gpu_reserved_cores=1;assert.equal(ctx.cpu_config_valid,true);
 groups.A.gpu_reserved_cores=4;groups.B.gpus.GPU.enabled=false;
 assert.equal(ctx.cpu_config_valid,true);
});
test('unchanged saved blocked policy permits unrelated edits during topology loss',()=>{
 const initial={A:gpu(4),B:gpu(0)};const groups=structuredClone(initial);groups.B.beta=true;
 const ctx=context(groups,initial);
 assert.equal(ctx.gpu_reservation_plan.sharedBlocked,true);
 assert.equal(ctx.cpu_config_valid,true);
});

test('an unreserved partial physical core remains available to shared GPU helpers',()=>{
 const initial={A:gpu(0),B:gpu(0)},groups=structuredClone(initial);groups.A.gpu_reserved_cores=4;
 const ctx=context(groups,initial);ctx.info.cpus=11;ctx.info.cpu_affinity.available=11;
 ctx.info.cpu_affinity.performance_levels[0].logical_cpus=9;
 ctx.info.cpu_affinity.performance_levels[0].available_logical_cpus=9;
 assert.equal(ctx.gpu_reservation_plan.logical,8);
 assert.equal(ctx.gpu_reservation_plan.sharedBlocked,false);
 assert.equal(ctx.cpu_config_valid,true);
});

test('enabling a shared GPU revalidates unchanged reservations',()=>{
 const initial={A:gpu(4),B:gpu(0)};initial.B.gpus.GPU.enabled=false;
 const groups=structuredClone(initial);groups.B.gpus.GPU.enabled=true;
 const ctx=context(groups,initial);
 assert.equal(ctx.cpu_policy_changed,false);
 assert.equal(ctx.gpu_policy_changed,true);
 assert.equal(ctx.gpu_reservation_plan.sharedBlocked,true);
 assert.equal(ctx.cpu_config_valid,false);
 groups.A.gpu_reserved_cores=3;assert.equal(ctx.cpu_config_valid,true);
});
test('GPU policy comparison tracks enabled device identity and ignores key order',()=>{
 const initial={A:gpu(0)};initial.A.gpus.GPU2={enabled:false};
 const groups=structuredClone(initial);groups.A.gpus.GPU.enabled=false;groups.A.gpus.GPU2.enabled=true;
 assert.equal(context(groups,initial).gpu_policy_changed,true);
 groups.A.gpus={GPU2:{enabled:false},GPU:{enabled:true}};
 assert.equal(context(groups,initial).gpu_policy_changed,false);
});
test('runtime fallback copy covers reduced budgets and suspended allocations',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/SettingsView.vue'),'utf8');
 assert.match(source,/CPU allocation could not fully match your settings/);
 assert.match(source,/Your saved preferences are unchanged/);
 assert.match(source,/cpu_affinity.runtime_fallback_reason/);
 assert(!source.includes('CPU performance-class settings are temporarily running as general'));
});

test('shared GPU edits retain unchanged CPU intent during topology loss',()=>{
 const initial={A:gpu(0),B:{cpu_mode:'classes',cpus:20,cpu_class_counts:[20,0]}};
 initial.A.gpus.GPU.enabled=false;
 const groups=structuredClone(initial);groups.A.gpus.GPU.enabled=true;
 const ctx=context(groups,initial);
 assert.equal(ctx.cpu_policy_changed,false);assert.equal(ctx.gpu_policy_changed,true);
 assert.equal(ctx.cpu_config_valid,true);
});

test('a newly selected GPU revalidates per-device reservations before save',()=>{
 const initial={A:gpu(3)};const groups=structuredClone(initial);
 const ctx=context(groups,initial);assert.equal(ctx.cpu_config_valid,true);
 groups.A.gpus.NEW={enabled:true};
 assert.equal(ctx.gpu_policy_changed,true);
 assert.equal(ctx.cpu_config_valid,false);
 groups.A.gpu_reserved_cores=2;assert.equal(ctx.cpu_config_valid,true);
});

test('inactive GPUs retain saved reservations without consuming capacity',()=>{
 for (const detected of [{}, {GPU:{supported:false,cuda:{}}}, {GPU:{supported:true}}]) {
  const ctx=context({A:gpu(2)});ctx.info.gpus=detected;
  assert.equal(ctx.gpu_reservation_plan.count,0);
  assert.equal(ctx.current_group_gpu_limit,0);
  assert.equal(ctx.groups.A.gpu_reserved_cores,2);
 }
 const ctx=context({A:gpu(2)});ctx.groups.A.cuda=false;
 assert.equal(ctx.gpu_reservation_plan.count,0);
 ctx.info.gpus.GPU.opencl={};assert.equal(ctx.gpu_reservation_plan.count,2);
 assert.equal(groupView.component.computed.gpu_selected.call({config:gpu(2),gpus:[]}),false);
});

test('General and class limits remain consistent across every GPU reservation',()=>{
 for(const mode of ['count','classes']) {
  const groups={A:{...gpu(0),cpu_mode:mode,cpu_class_counts:[0,0]},B:{cpu_mode:'count',cpus:6}};
  const ctx=context(groups,groups,[2,2,2,2]);
  ctx.info.cpus=16;ctx.info.cpu_affinity.available=16;
  ctx.info.cpu_affinity.performance_levels=[
   {logical_cpus:8,available_logical_cpus:8},
   {logical_cpus:8,available_logical_cpus:8}];
  for(const [reserved,limit] of [[0,10],[1,8],[2,6],[3,4],[4,2],[0,10]]) {
   groups.A.gpu_reserved_cores=reserved;
   assert.equal(ctx.current_group_cpu_limit,limit);
   assert.deepEqual(ctx.cpu_class_capacities,[8-2*reserved,8]);
   assert.deepEqual(ctx.current_group_class_limits,[Math.min(8-2*reserved,limit),Math.min(8,limit)]);
   assert.equal(groups.A.cpus,0);
   assert.deepEqual(groups.A.cpu_class_counts,[0,0]);
   assert.equal(groups.B.cpus,6);
  }
  ctx.info.cpu_affinity=undefined;
  assert.equal(ctx.current_group_cpu_limit,16);
 }
});
