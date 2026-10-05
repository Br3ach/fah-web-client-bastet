require('./gpu-policy-loader.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {test}=require('node:test');
const root=path.join(__dirname,'../src');
function component(file){const source=fs.readFileSync(path.join(root,file),'utf8');const script=source.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm,'').replace(/^import .*$/gm,'').replace('export default','return');return {source,def:new Function('CommonSettings','GroupSettings',script)({},{})}}
const settings=component('SettingsView.vue');
test('Cancel returns to the in-app Machines page without browser Back',()=>{
 let route;
 const ctx={confirmed:false,$router:{replace:r=>route=r,back:()=>{throw Error('Back must not be used')}}};
 ctx.close=()=>settings.def.methods.close.call(ctx);
 settings.def.methods.cancel.call(ctx);
 assert.equal(route,'/machines');assert.equal(ctx.confirmed,true);
});
test('saving RG settings stays on settings and clears saved edits',async()=>{
 const sent=[];const ctx={connected:true,settings_stale:false,name_modified:false,config_modified:true,config:{groups:{'':{cpus:4}}},$util:{deepCopy:c=>JSON.parse(JSON.stringify(c))},mach:{configure:async c=>sent.push(c)},wait_for_config:async()=>{},$root:{message:async()=>{}},close:()=>{throw Error('Save must not navigate')}};
 await settings.def.methods.save.call(ctx);assert.equal(sent.length,1);assert.equal(sent[0].groups[''].cpus,4);assert.deepEqual(ctx.initial_config,ctx.config);assert.notEqual(ctx.initial_config,ctx.config);
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
