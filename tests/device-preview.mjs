// UI contract fixture only. This does NOT emulate radio, flash or ESP32 timing.
import http from 'node:http';import {readFileSync} from 'node:fs';import {resolve,extname} from 'node:path';import {createEngine} from '../server/engine.mjs';
const engine=await createEngine();engine.call({op:'hardware'});let configured=false,reader='internal',target='',captured='',ssid='Mensaampel-Vorschau',password='Vorschau123!',feedback='Oberflächen-Vorschau: keine echte Hardware.',token='';
function state(){const s=engine.status(Date.now());return {...s,storageError:'',recoveryRequired:false,sim:{offset:0,offline:false,forceWriteFailure:false},device:{version:'UI-Vorschau – keine Hardware',configured,reader,readerHealthy:true,readerError:'',ssid,captureTarget:target,capturedUid:captured,captureUntil:Date.now()+60000,feedback,feedbackOk:true,needsReview:false,freeHeap:180000,minimumHeap:130000,clients:1,uptime:Date.now()}};}
http.createServer(async(req,res)=>{
 const json=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};const path=new URL(req.url,'http://127.0.0.1').pathname;
 if(path==='/api/info')return json(200,{mode:'device',configured,nonce:'preview',version:'UI-preview'});
 if(path==='/api/signal'){const s=state();return json(200,{signal:configured?s.signal:{green:false,reason:'device',free:0},storageError:''});}
 let body='';for await(const chunk of req)body+=chunk;const j=body?JSON.parse(body):{};
 if(path==='/api/login'){if(j.password!==password)return json(401,{message:'Kennwort stimmt nicht.'});token='preview-session';return json(200,{token});}
 if(path.startsWith('/api/')){
  if(!token||req.headers['x-mensa-token']!==token)return json(401,{message:'Bitte anmelden.'});
  if(path==='/api/state')return json(200,state());if(path==='/api/logout'){token='';return json(200,{ok:true});}
  if(path==='/api/backup')return json(200,{format:'mensa-device-backup-1',state:engine.snapshot()});
  if(path==='/api/command'){
   let result={ok:true,message:'Gespeichert.'};
   if(j.type==='deviceSetup'||j.type==='deviceSettings'){configured=true;ssid=j.ssid||ssid;password=j.adminPassword||password;}
   else if(j.type==='reader'){reader=j.reader;engine.command({type:'restart'},Date.now());}
   else if(j.type==='captureStart'){target=j.uid;captured='';engine.command({type:'pause',paused:true},Date.now());}
   else if(j.type==='testTag'){captured=j.uid;}
   else if(j.type==='captureCancel'){target='';captured='';}
   else if(j.type==='captureBind'){result=engine.command({type:'bind',uid:target,newUid:captured},Date.now());if(result.ok){target='';captured='';}}
   else if(j.type!=='storageRetry')result=engine.command(j,Date.now());feedback=result.message;return json(200,{...result,state:state()});
  }return json(404,{});
 }
 let file=resolve('dist','.'+path);if(!extname(file))file=resolve('dist/index.html');if(!file.startsWith(resolve('dist')))return json(403,{});try{const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html'}[extname(file)]||'application/octet-stream';const bytes=readFileSync(file);res.writeHead(200,{'Content-Type':mime});res.end(bytes);}catch{json(404,{})}
}).listen(4318,'127.0.0.1',()=>console.log('UI fixture http://127.0.0.1:4318 – password Vorschau123!'));
