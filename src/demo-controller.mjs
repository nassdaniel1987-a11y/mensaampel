// Session-only presentation adapter. All booking rules stay in the shared C++ core.
export function createDemoController(engine,clock=()=>Date.now()){
 let offset=0,offlineUntil=0,forceWriteFailure=false,storageError='';
 const now=()=>clock()+offset;
 const state=()=>({...engine.status(now()),storageError,recoveryRequired:false,token:'demo',sim:{offset,offline:clock()<offlineUntil,forceWriteFailure}});
 function send(c){
  const reply=(ok,message)=>({ok,message,state:state()});
  if(c.type==='demoReset'){engine.reset();offset=0;offlineUntil=0;forceWriteFailure=false;storageError='';return reply(true,'Vorführung zurückgesetzt. Bestand bitte bestätigen.');}
  if(clock()<offlineUntil)return reply(false,'Simulierte Verbindung ist unterbrochen.');
  if(c.type==='disconnect'){offlineUntil=clock()+8000;return reply(true,'Verbindung für acht Sekunden unterbrochen.');}
  if(c.type==='storageFailure'){forceWriteFailure=!!c.enabled;return reply(true,forceWriteFailure?'Speicherfehler eingeschaltet.':'Speicherfehler beendet. Bitte erneut buchen.');}
  const previous=engine.snapshot(),oldOffset=offset;let r;
  if(c.type==='advance'){
   if(!Number.isInteger(c.seconds)||c.seconds<1||c.seconds>3600)return reply(false,'Zeitspanne ungültig.');
   offset+=c.seconds*1000;r={ok:true,message:`${c.seconds} Sekunden vorgespult.`};
  }else if(c.type==='tap'){r=engine.command({type:'scan',uid:c.uid},now());engine.command({type:'remove'},now());}
  else r=engine.command(c,now());
  if(forceWriteFailure){engine.restore(previous,true);offset=oldOffset;storageError='Simulierter Speicherfehler. Aktion nicht übernommen.';return reply(false,storageError);}
  storageError='';return {...r,state:state()};
 }
 return {state,send,online:()=>clock()>=offlineUntil};
}
