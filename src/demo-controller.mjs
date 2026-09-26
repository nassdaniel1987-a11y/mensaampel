// Session-only presentation adapter. All booking rules stay in the shared C++ core.
export function createDemoController(engine,clock=()=>Date.now()){
 let offset=0,offlineUntil=0,forceWriteFailure=false,storageError='',feedback={text:'',ok:true,at:-1e9};
 const now=()=>clock()+offset;
 const note=(text,ok)=>{if(text)feedback={text,ok:!!ok,at:clock()};};
 const dial=()=>engine.call({op:'dial',now:now(),blocked:!!storageError,hint:storageError?'Speicher pruefen!':'',...(clock()-feedback.at<3500?{feedback:feedback.text,feedbackOk:feedback.ok}:{})});
 const state=()=>({...engine.status(now()),dial:dial(),feedback,storageError,recoveryRequired:false,token:'demo',sim:{offset,offline:clock()<offlineUntil,forceWriteFailure}});
 function syncClock(){const f=engine.status(now()).flow;if(f.clockValid||f.armed||f.started>=0||f.issued>0)return;const t=new Date(now());engine.command({type:'measurementContext',weekday:t.getDay(),minute:t.getHours()*60+t.getMinutes(),queue:f.queue},now());}
 function tick(){if(forceWriteFailure)return false;const r=engine.command({type:'tick'},now());if(r.changed)note(r.message,r.ok);return !!r.changed;}
 function send(c){
  const reply=(ok,message)=>({ok,message,state:state()});
  if(c.type==='demoReset'){engine.reset();offset=0;offlineUntil=0;forceWriteFailure=false;storageError='';feedback={text:'',ok:true,at:-1e9};syncClock();return reply(true,'Vorführung zurückgesetzt. Bestand bitte bestätigen.');}
  if(clock()<offlineUntil)return reply(false,'Simulierte Verbindung ist unterbrochen.');
  if(c.type==='disconnect'){offlineUntil=clock()+8000;return reply(true,'Verbindung für acht Sekunden unterbrochen.');}
  if(c.type==='storageFailure'){forceWriteFailure=!!c.enabled;return reply(true,forceWriteFailure?'Speicherfehler eingeschaltet.':'Speicherfehler beendet. Bitte erneut buchen.');}
  const previous=engine.snapshot(),oldOffset=offset;let r;
  if(c.type==='advance'){
   if(!Number.isInteger(c.seconds)||c.seconds<1||c.seconds>3600)return reply(false,'Zeitspanne ungültig.');
   offset+=c.seconds*1000;r={ok:true,message:`${c.seconds} Sekunden vorgespult.`};
  }else if(c.type==='tap'){r=engine.command({type:'scan',uid:c.uid},now());engine.command({type:'remove'},now());}
  else r=engine.command(c,now());
  if(forceWriteFailure){engine.restore(previous,true);offset=oldOffset;storageError='Simulierter Speicherfehler. Aktion nicht übernommen.';note(storageError,false);return reply(false,storageError);}
  if(c.type!=='advance')note(r.message,r.ok);syncClock();if(c.type==='advance')tick();
  storageError='';return {...r,state:state()};
 }
 syncClock();
 return {state,send,tick,online:()=>clock()>=offlineUntil};
}
