require('./gpu-policy-loader.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {test}=require('node:test');
const script=fs.readFileSync(path.join(__dirname,'../src/SettingsView.vue'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm,'').replace(/^import .*$/gm,'').replace('export default','return');
const c=new Function('CommonSettings','GroupSettings',script)({},{});
test('transport send alone cannot clear saved baseline',async()=>{
 const baseline={groups:{'':{cpus:2}}};let displayed;
 const ctx={connected:true,settings_stale:false,config_modified:true,name_modified:false,config:{groups:{'':{cpus:4}}},initial_config:baseline,$util:{deepCopy:structuredClone},mach:{configure:async()=>{}},wait_for_config:async()=>{throw Error('rejected')},$root:{message:async(...args)=>displayed=args}};
 assert.equal(await c.methods.save.call(ctx),false);assert.equal(ctx.initial_config,baseline);assert.equal(displayed[0],'error');assert.equal(ctx.saving,false);
});
test('authoritative groups and account confirm accepted values',async()=>{
 const saved={user:'Tester',groups:{'':{cpus:4}}};
 const ctx={connected:true,settings_stale:false,logged_in:false,$util:{isEqual:(a,b)=>JSON.stringify(a)==JSON.stringify(b)},mach:{get_data:()=>({config:{user:'Tester'},groups:{'':{config:{cpus:4}}}})},get_group_config:x=>x,get_account_config:x=>x};
 await c.methods.wait_for_config.call(ctx,saved);
});
test('unconfirmed values stay dirty after timeout',async()=>{
 const ctx={connected:true,settings_stale:false,logged_in:true,$util:{isEqual:()=>false},mach:{get_data:()=>({groups:{}})},get_group_config:x=>x};
 const original=global.setTimeout;global.setTimeout=fn=>{queueMicrotask(fn);return 0};
 try{await assert.rejects(c.methods.wait_for_config.call(ctx,{groups:{A:{cpus:4}}}),/did not confirm/)}finally{global.setTimeout=original}
});
test('disconnect during confirmation is a failed save',async()=>{
 await assert.rejects(c.methods.wait_for_config.call({connected:false},{groups:{}}),/disconnected/);
});
test('leave dialog Save resumes original destination only on success',async()=>{
 for(const success of [true,false]){let destination;const to={path:'/other'};const ctx={name_modified:false,config_modified:true,$refs:{confirm_dialog:{exec:async()=> 'save'}},save:async()=>success,$router:{push:x=>destination=x}};
 assert.equal(c.beforeRouteLeave.call(ctx,to,{}),false);await new Promise(resolve=>setImmediate(resolve));assert.equal(destination,success?to:undefined)}
});
test('overlapping save is refused',async()=>{assert.equal(await c.methods.save.call({connected:true,settings_stale:false,saving:true}),false)});

test('GPU save confirmation canonicalizes missing and newly detected devices',async()=>{
 const original=global.setTimeout;global.setTimeout=fn=>{queueMicrotask(fn);return 0};
 try {
  for(const [available,requested,stored,accepted] of [
   [{},{missing:{enabled:false}},{missing:{enabled:false}},true],
   [{},{missing:{enabled:false}},{},true],
   [{newGPU:{}},{},{},true],
   [{},{missing:{enabled:true}},{},false]
  ]) {
   const ctx={connected:true,settings_stale:false,logged_in:true,available_gpus:available,
    cpu_affinity:null,version:'8.5.7',$util:{version_less:()=>true,isEqual:(a,b)=>{try{assert.deepEqual(a,b);return true}catch{return false}}},
    mach:{get_data:()=>({groups:{A:{config:{cpus:4,gpus:stored}}}})}};
   ctx.get_group_config=config=>c.methods.get_group_config.call(ctx,config);
   const confirmation=c.methods.wait_for_config.call(ctx,{groups:{A:{cpus:4,gpus:requested}}});
   if(accepted) await confirmation;else await assert.rejects(confirmation,/did not confirm/);
  }
 } finally {global.setTimeout=original}
});
