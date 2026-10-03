const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {test}=require('node:test');
test('unavailable performance pin hint belongs below its checkbox',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/GroupSettings.vue'),'utf8');
 assert.match(source,/\.pin-control\n      input[\s\S]*?small\(v-if="!pin_supported"\)/);
 assert.match(source,/Unavailable: no distinct performance cores reported\./);
 assert.doesNotMatch(source,/this client does not report usable performance classes/);
});

const script=fs.readFileSync(path.join(__dirname,'../src/GroupSettings.vue'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1].replace('export default','return');
const component=new Function(script)();
test('managed pinning requires an enabled GPU and preserves saved intent',()=>{
 const ctx={class_supported:true,cpuManagedMode:true,config:{gpus:{gpu:{enabled:false}},pin_to_perf_cores:true}};
 assert.equal(component.computed.pin_supported.call(ctx),false);
 assert.match(component.computed.pin_unavailable_reason.call(ctx),/enable a GPU in this resource group/);
 assert.equal(ctx.config.pin_to_perf_cores,true);
 ctx.config.gpus.gpu.enabled=true;
 assert.equal(component.computed.pin_supported.call(ctx),true);
 ctx.config.gpus={undetected:{enabled:true}};
 assert.equal(component.computed.pin_supported.call(ctx),true);
 ctx.config.gpus={};assert.equal(component.computed.pin_supported.call(ctx),false);
 delete ctx.config.gpus;assert.equal(component.computed.pin_supported.call(ctx),false);
 ctx.cpuManagedMode=false;assert.equal(component.computed.pin_supported.call(ctx),true);
 ctx.class_supported=false;assert.equal(component.computed.pin_supported.call(ctx),false);
 assert.match(component.computed.pin_unavailable_reason.call(ctx),/no distinct performance cores/);
});

test('long GPU helper pin label is not constrained to the short scheduling-label width',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/GroupSettings.vue'),'utf8');
 assert.match(source,/\.setting\.pin-setting\(v-if=/);
 assert.match(source,/\.setting\.pin-setting > :first-child\n      width auto\n      flex 0 1 auto\n      min-width 0/);
 assert.match(source,/overflow-wrap anywhere/);
});

test('managed GPU helper help explains minimum shared CPU allowance',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/GroupSettings.vue'),'utf8');
 assert.match(source,/GPU work receives its core's minimum CPU allowance/);
 assert.match(source,/consume or expand into the group's exclusive CPU-folding budget/);
});
