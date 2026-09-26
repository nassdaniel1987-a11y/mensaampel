import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createEngine} from '../server/engine.mjs';import {createApp} from '../server/main.mjs';
// Monday 12:30, groups of three children, automatic release with a start value of 20 s per child.
async function setup({auto=true,start=20}={}){
 const e=await createEngine();let now=100000;const cmd=c=>e.command(c,now),tap=uid=>{const r=cmd({type:'scan',uid});cmd({type:'remove'});return r;};
 cmd({type:'confirm'});cmd({type:'measurementContext',weekday:1,minute:750,queue:0});cmd({type:'flowSettings',yellow:0,batch:3});cmd({type:'pause',paused:false});
 if(auto)assert.equal(cmd({type:'autoSettings',on:true,start}).ok,true);
 let card=1;const group=()=>{for(let i=0;i<3;i++)assert.equal(tap(`sim:K${String(card++).padStart(2,'0')}`).ok,true);};
 return {e,cmd,tap,group,wait:ms=>now+=ms,tick:()=>cmd({type:'tick'}),state:()=>e.status(now),dial:(x={})=>e.call({op:'dial',now,...x}),get now(){return now;}};
}
const texts=list=>list.filter(i=>i[0]==='t').map(i=>i[5]);
test('Automatik: volle Gruppe wird nach gelernter Zeit von selbst freigegeben',async()=>{
 const x=await setup();x.group();assert.equal(x.state().signal.reason,'batch');
 assert.equal(x.state().flow.auto.releaseIn,60);assert.ok(texts(x.dial()).includes('Naechste Gruppe in 1:00'));
 x.wait(59000);assert.equal(x.tick().changed,false);assert.equal(x.state().signal.reason,'batch');
 x.wait(1000);const r=x.tick();assert.equal(r.ok,true);assert.equal(r.changed,true);assert.equal(x.state().signal.reason,'free');
 assert.match(x.state().events.at(-1).message,/automatisch freigegeben/);
});
test('Automatik aus: Gruppe bleibt rot, bis jemand freigibt',async()=>{
 const x=await setup({auto:false});x.group();x.wait(3600000);assert.equal(x.tick().changed,false);assert.equal(x.state().signal.reason,'batch');
 assert.equal(x.state().flow.auto.releaseIn,-1);assert.ok(texts(x.dial()).includes('Gruppe voll'));
 assert.equal(x.cmd({type:'pause',paused:false}).ok,true);assert.equal(x.state().signal.reason,'free');
});
test('Taste im Countdown gibt sofort frei und lernt kürzere Zeit',async()=>{
 const x=await setup();x.group();x.wait(30000);assert.equal(x.cmd({type:'pause',paused:false}).ok,true);assert.equal(x.state().signal.reason,'free');
 const a=x.state().flow.auto;assert.equal(a.faster,1);assert.equal(a.perChild,170);assert.equal(a.level,'global');
});
test('Entlasten nach automatischer Freigabe verlängert, ruhige Gruppen verkürzen leicht',async()=>{
 const x=await setup();x.group();x.wait(60000);x.tick();assert.equal(x.state().flow.autoReleased,true);
 assert.equal(x.cmd({type:'relief'}).ok,true);let a=x.state().flow.auto;assert.equal(a.slower,1);assert.equal(a.perChild,240);assert.equal(x.state().signal.reason,'relief');
 x.wait(1000);assert.equal(x.tick().changed,false);
 x.cmd({type:'pause',paused:false});assert.equal(x.state().flow.autoReleased,false);
 x.wait(10000);x.group();x.wait(72000);x.tick();x.wait(10000);x.group();x.wait(72000);x.tick();a=x.state().flow.auto;assert.equal(a.perChild,233);
});
test('Keine automatische Freigabe bei Pause, Entlastung, unbestätigtem Bestand oder laufender Gruppenmessung',async()=>{
 const x=await setup();x.group();x.cmd({type:'pause',paused:true});x.wait(120000);x.tick();assert.equal(x.state().signal.reason,'paused');
 const y=await setup();y.group();y.cmd({type:'relief'});y.wait(120000);y.tick();assert.equal(y.state().signal.reason,'relief');
 const z=await setup();z.group();z.cmd({type:'restart'});z.wait(120000);z.tick();assert.equal(z.state().ready,false);assert.equal(z.state().flow.waiting,true);
 z.cmd({type:'confirm'});assert.equal(z.tick().changed,true);assert.equal(z.state().flow.auto.releaseIn,60);
 const m=await setup();m.cmd({type:'measurementArm',kind:1});m.group();m.wait(120000);m.tick();assert.equal(m.state().signal.reason,'batch');assert.ok(texts(m.dial()).includes('Tablet: Alle haben Essen'));
 assert.equal(m.cmd({type:'measurementFinish'}).ok,true);assert.equal(m.tick().changed,true);assert.equal(m.state().signal.reason,'free');
});
test('Gruppenmessungen lernen je Halbstunde und Einstellungen werden geprüft',async()=>{
 const x=await setup({auto:false});
 for(let i=0;i<3;i++){x.cmd({type:'measurementArm',kind:1});x.group();x.wait(45000);assert.equal(x.cmd({type:'measurementFinish'}).ok,true);x.cmd({type:'pause',paused:false});x.wait(10000);}
 const f=x.state().flow;assert.deepEqual(f.autoSlots,[[1,25,150,3]]);assert.equal(f.auto.level,'slot');assert.equal(f.auto.perChild,150);
 assert.equal(x.cmd({type:'autoSettings',on:true,start:500}).ok,false);assert.equal(x.cmd({type:'flowSettings',yellow:0,batch:0}).ok,true);
 assert.equal(x.cmd({type:'autoSettings',on:true,start:20}).ok,false);
 x.cmd({type:'flowSettings',yellow:0,batch:3});x.cmd({type:'autoSettings',on:true,start:20});x.cmd({type:'flowSettings',yellow:0,batch:0});assert.equal(x.state().flow.autoOn,false);
 x.cmd({type:'flowSettings',yellow:0,batch:3});assert.equal(x.cmd({type:'autoSettings',on:false,start:20,reset:true}).ok,true);assert.equal(x.state().flow.autoGlobalN,0);assert.deepEqual(x.state().flow.autoSlots,[]);
});
test('Alte Speicherstände übernehmen Gruppenmessungen, Neustart verwirft Countdown',async()=>{
 const x=await setup({auto:false});x.cmd({type:'measurementArm',kind:1});x.group();x.wait(30000);x.cmd({type:'measurementFinish'});
 const snap=x.e.snapshot();for(const k of Object.keys(snap.flow))if(k.startsWith('auto')||k==='releaseAt')delete snap.flow[k];
 const e=await createEngine();assert.equal(e.restore(snap).ok,true);assert.equal(e.status(0).flow.autoGlobalN,1);assert.equal(e.status(0).flow.autoGlobal,100);assert.equal(e.status(0).flow.autoOn,false);
 const y=await setup();y.group();assert.ok(y.state().flow.releaseAt>0);y.cmd({type:'restart'});assert.equal(y.state().flow.releaseAt,-1);
 const bad=y.e.snapshot();bad.flow.autoSlots=[[9,0,100,1]];assert.equal((await createEngine()).restore(bad).ok,false);
});
test('Dial-Anzeige: nur ASCII, passt in die runde Anzeige, Rückmeldung umbrochen',async()=>{
 const x=await setup();const fits=(y,size,t)=>{const h=8*size,top=y-h/2,bottom=top+h-1,dy=Math.max(Math.abs(top-120),Math.abs(bottom-119)),half=Math.floor(Math.sqrt(14400-dy*dy));return t.length*6*size<=2*half;};
 const list=x.dial({feedback:'Einlass pausiert. Nur Rückgaben möglich, bitte später erneut versuchen.',feedbackOk:false});
 for(const i of list.filter(i=>i[0]==='t')){assert.match(i[5],/^[\x20-\x7e]*$/);assert.ok(fits(i[2],i[3],i[5]),i[5]);}
 assert.ok(texts(list).includes('Einlass pausiert. Nur Rueckgaben'));assert.ok(list.some(i=>i[0]==='t'&&i[2]===204&&i[4]===0xFDA0));
 assert.deepEqual(list[0],['c',120,38,13,0x07E0]);assert.ok(texts(list).includes('Kueche: 48  Mensa: 0'));
 assert.equal(x.dial({blocked:true})[0][4],0xF800);assert.ok(texts(x.dial({hint:'Leser pruefen!'})).includes('Leser pruefen!'));
});
test('PC-Dienst: Zeitgeber gibt Gruppe frei, speichert und meldet am Dial',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'mensa-auto-'));try{
  const app=await createApp({dataDir:dir});const t=c=>app.transact(c);
  t({type:'confirm'});t({type:'flowSettings',yellow:0,batch:1});t({type:'pause',paused:false});t({type:'autoSettings',on:true,start:3});
  assert.equal(app.state().flow.clockValid,true);
  t({type:'tap',uid:'sim:K01'});assert.equal(app.state().signal.reason,'batch');assert.ok(app.state().dial.some(i=>i[5]==='K01 ausgegeben. Ein Platz'));
  t({type:'advance',seconds:10});assert.equal(app.state().signal.reason,'free');assert.ok(app.state().dial.some(i=>i[5]==='Naechste Gruppe automatisch'));
  const again=await createApp({dataDir:dir});assert.equal(again.state().flow.autoOn,true);assert.equal(again.state().flow.autoReleased,false);again.stop();app.stop();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
