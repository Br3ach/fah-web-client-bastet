const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {test}=require('node:test');
const root=path.join(__dirname,'../src');
function component(file){const source=fs.readFileSync(path.join(root,file),'utf8');const script=source.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm,'').replace('export default','return');return {source,def:new Function('CommonSettings','GroupSettings',script)({},{})}}
const settings=component('SettingsView.vue'),group=component('GroupSettings.vue');
test('Cancel returns to the in-app Machines page without browser Back',()=>{
 let route;
 const ctx={confirmed:false,$router:{replace:r=>route=r,back:()=>{throw Error('Back must not be used')}}};
 ctx.close=()=>settings.def.methods.close.call(ctx);
 settings.def.methods.cancel.call(ctx);
 assert.equal(route,'/machines');assert.equal(ctx.confirmed,true);
});
test('saving RG settings stays on settings and clears saved edits',async()=>{
 const sent=[];const ctx={connected:true,settings_stale:false,name_modified:false,config_modified:true,config:{groups:{'':{pin_to_perf_cores:true}}},$util:{deepCopy:c=>JSON.parse(JSON.stringify(c))},mach:{configure:async c=>sent.push(c)},wait_for_config:async()=>{},$root:{message:async()=>{}},close:()=>{throw Error('Save must not navigate')}};
 await settings.def.methods.save.call(ctx);assert.equal(sent.length,1);assert.equal(sent[0].groups[''].pin_to_perf_cores,true);assert.deepEqual(ctx.initial_config,ctx.config);assert.notEqual(ctx.initial_config,ctx.config);
});
test('failed save preserves the unsaved baseline',async()=>{
 const initial={groups:{'':{cpus:2}}};const ctx={connected:true,settings_stale:false,name_modified:false,config_modified:true,initial_config:initial,config:{groups:{'':{cpus:4}}},$util:{deepCopy:c=>JSON.parse(JSON.stringify(c))},mach:{configure:async()=>{throw Error('save failed')}},wait_for_config:async()=>{},$root:{message:async()=>{}},close:()=>{throw Error('Unexpected navigation')}};
 assert.equal(await settings.def.methods.save.call(ctx),false);assert.equal(ctx.initial_config,initial);
});
test('edits made during save remain unsaved',async()=>{
 const ctx={connected:true,settings_stale:false,name_modified:false,config_modified:true,config:{groups:{'':{cpus:4}}},$util:{deepCopy:c=>JSON.parse(JSON.stringify(c))},wait_for_config:async()=>{},$root:{message:async()=>{}},close:()=>{throw Error('Unexpected navigation')}};
 ctx.mach={configure:async c=>{assert.equal(c.groups[''].cpus,4);ctx.config.groups[''].cpus=6}};
 await settings.def.methods.save.call(ctx);assert.equal(ctx.initial_config.groups[''].cpus,4);assert.equal(ctx.config.groups[''].cpus,6);
});
test('class mode in another group makes pinning scope global',()=>{
 assert.equal(settings.def.computed.cpu_managed_mode.call({groups:{A:{cpu_mode:'classes'},B:{cpu_mode:'count'}}}),true);
 assert.equal(settings.def.computed.cpu_managed_mode.call({groups:{A:{cpu_mode:'count'},B:{cpu_mode:'count'}}}),false);
 assert.match(settings.source,/:cpu-managed-mode="cpu_managed_mode"/);
 assert.ok(group.def.props.includes('cpuManagedMode'));
 assert.match(group.source,/Pin GPU Helpers to Perf Cores/);
 assert.match(group.source,/CPU work units use their/);
 assert.doesNotMatch(group.source,/version\) && config\.cpu_mode != 'classes'/);
});

test('pin slider caps to fastest logical count with and without SMT',()=>{
 for(const count of [8,16]){const ctx={cpuAffinity:{class_selection:true,performance_levels:[{logical_cpus:count},{logical_cpus:8}]},cpuLimit:count+8,cpus:count+8,cpuManagedMode:false,config:{pin_to_perf_cores:true,cpus:count+8},pin_supported:true};ctx.cpu_count_limit=group.def.computed.cpu_count_limit.call(ctx);assert.equal(ctx.cpu_count_limit,count);group.def.methods.pin_changed.call(ctx);assert.equal(ctx.config.cpus,count);ctx.cpuManagedMode=true;assert.equal(group.def.computed.cpu_count_limit.call(ctx),count+8)}
});
test('pin control is disabled for stock and homogeneous clients',()=>{
 for(const cpuAffinity of [undefined,{class_selection:false,performance_levels:[]},{class_selection:false,performance_levels:[{logical_cpus:16}]}])assert.equal(group.def.computed.class_supported.call({cpuAffinity}),false);
 assert.match(group.source,/:disabled="!pin_supported"/);
});
test('enabling pinning alone blocks an over-capacity save',()=>{
 const ctx={cpu_managed_mode:false,cpu_class_supported:true,cpu_affinity:{performance_levels:[{logical_cpus:8}]},initial_config:{groups:{'':{cpu_mode:'count',cpus:16,pin_to_perf_cores:false}}},groups:{'':{cpu_mode:'count',cpus:16,pin_to_perf_cores:true}},cpu_policy_changed:false};
 assert.equal(settings.def.computed.cpu_config_valid.call(ctx),false);ctx.groups[''].cpus=8;assert.equal(settings.def.computed.cpu_config_valid.call(ctx),true);
});
