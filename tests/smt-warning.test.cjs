require('./gpu-policy-loader.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {test}=require('node:test');
const text=fs.readFileSync(path.join(__dirname,'../src/GroupSettings.vue'),'utf8');
const c=new Function(text.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm,'').replace('export default','return'))();
function warning(config,extra={}) {
 const ctx={config,cpuAffinity:{physical_cpus:8,available:16,performance_levels:[{physical_cpus:4,logical_cpus:8},{physical_cpus:4,logical_cpus:8}]},gpuReservedCores:0,gpuReservedLogicalCpus:0,cpuGroupCount:1,...extra};
 ctx.class_counts=config.cpu_class_counts||[];
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
 assert.equal(warning({cpu_mode:'classes',cpu_class_counts:[8,7]}),false);
 assert.equal(warning({cpu_mode:'classes',cpu_class_counts:[8,8]}),true);
});
test('multiple CPU groups use authoritative per-group whole-core capacities',()=>{
 const cpuAffinity={physical_cpus:8,available:16,group_allocations:{A:{configured_cpus:8,cpu_mode:'count',full_smt:true,pool_logical_cpus:8,pool_physical_cpus:4}}};
 assert.equal(warning({cpus:8},{cpuAffinity,groupName:'A',cpuGroupCount:2}),true);
 assert.equal(warning({cpus:7},{cpuAffinity,groupName:'A',cpuGroupCount:2}),false);
 assert.equal(warning({cpus:16},{cpuAffinity,groupName:'B',cpuGroupCount:2}),false);
});
test('changed class policy cannot reuse an old full-SMT warning',()=>{
 const cpuAffinity={group_allocations:{A:{configured_cpus:8,cpu_mode:'classes',cpu_class_counts:[8,0],full_smt:true}}};
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
 assert.deepEqual(c.computed.runtime_full_smt_units.call(ctx).map(u=>u.number),[42]);
});
