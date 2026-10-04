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

test('pin help shows only the relevant scope for each allocation mode',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/GroupSettings.vue'),'utf8');
 const help=source.split('    HelpBalloon(:name="cpuManagedMode ?')[1].split('    .pin-control')[0];
 const [managed,general]=help.split('      template(v-else)');
 assert.match(managed,/template\(v-if="cpuManagedMode"\)/);
 assert.match(managed,/Request that GPU folding processes/);
 assert.match(managed,/This setting does not\s+affect them/);
 assert.match(managed,/Enable a GPU in\s+this group/);
 assert.doesNotMatch(managed,/limits the CPU count/);
 assert.match(general,/Request that CPU and GPU folding processes/);
 assert.match(general,/limits the CPU count/);
 assert.match(general,/SMT threads count as separate logical CPUs/);
 for(const scope of [managed,general]) {
  assert.match(scope,/entire FahCore process/);
  assert.match(scope,/reserve exclusive CPUs/);
  assert.match(scope,/Helpers may share cores with CPU folding/);
 }
 assert.match(general,/Available only when the client reports usable, distinct performance classes/);
});
