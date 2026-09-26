import http from 'node:http';
import {readFileSync,writeFileSync,renameSync,mkdirSync,existsSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
import {createEngine} from './engine.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function createApp({dataDir=resolve(root,'data')}={}){
 const engine=await createEngine();mkdirSync(dataDir,{recursive:true});
 const file=resolve(dataDir,'bestand.json');let offset=0,offlineUntil=0,storageError='',loadError='',forceWriteFailure=false;
 const now=()=>Date.now()+offset;
 const hash=s=>createHash('sha256').update(s).digest('hex');
 function save(){
  if(forceWriteFailure)throw Error('Simulierter Speicherfehler');
  const payload=JSON.stringify({state:engine.snapshot(),offset});
  const data=JSON.stringify({version:1,checksum:hash(payload),payload},null,2);
  const tmp=file+'.tmp';const fd=openSync(tmp,'w');try{writeFileSync(fd,data,'utf8');fsyncSync(fd);}finally{closeSync(fd);}renameSync(tmp,file);
 }
 if(existsSync(file)){
  try{
   const envelope=JSON.parse(readFileSync(file,'utf8'));
   if(envelope.version!==1||typeof envelope.payload!=='string'||hash(envelope.payload)!==envelope.checksum)throw Error('Prüfsumme oder Speicherformat ungültig');
   const data=JSON.parse(envelope.payload);
   if(!Number.isSafeInteger(data.offset)||data.offset<0)throw Error('Ungültige Simulationszeit');
   const r=engine.restore(data.state);if(!r.ok)throw Error(r.message);offset=data.offset;
   engine.command({type:'restart'},now());save();
  }catch(e){loadError='Gespeicherter Bestand konnte nicht geladen werden. Die Datei bleibt unverändert. '+e.message;}
 }else {try{save();}catch(e){storageError='Bestand kann nicht gespeichert werden: '+e.message;}}
 const token=randomBytes(24).toString('hex');
 function state(){
  const s=engine.status(now());return {...s,storageError:storageError||loadError,recoveryRequired:!!loadError,sim:{offset,offline:Date.now()<offlineUntil,forceWriteFailure}};
 }
 // Commands are processed synchronously after body collection; memory and disk form one transaction.
 function transact(command){
  if(loadError&&command.type!=='recover')return {ok:false,message:loadError,state:state()};
  if(command.type==='recover'){
   if(command.confirmed!==true)return {ok:false,message:'Wiederherstellung bestätigen.',state:state()};
   try{if(existsSync(file))renameSync(file,file+'.beschädigt-'+Date.now());engine.reset();offset=0;save();loadError='';storageError='';return {ok:true,message:'Leerer Grundbestand angelegt. Bestand vor Freigabe prüfen.',state:state()};}
   catch(e){return {ok:false,message:'Wiederherstellung fehlgeschlagen: '+e.message,state:state()};}
  }
  if(command.type==='disconnect'){offlineUntil=Date.now()+8000;return {ok:true,message:'Verbindung für acht Sekunden unterbrochen.',state:state()};}
  if(command.type==='storageFailure'){forceWriteFailure=!!command.enabled;return {ok:true,message:forceWriteFailure?'Speicherfehler eingeschaltet. Buchungen werden nicht bestätigt.':'Speicherfehler beendet. Bitte erneut speichern oder buchen.',state:state()};}
  const previous=engine.snapshot(),oldOffset=offset;
  let result;
  if(command.type==='advance'){
   if(!Number.isInteger(command.seconds)||command.seconds<1||command.seconds>3600)return {ok:false,message:'Zeitspanne ungültig.',state:state()};
   offset+=command.seconds*1000;result={ok:true,message:`${command.seconds} Sekunden vorgespult.`};
  }else if(command.type==='tap'){
   result=engine.command({type:'scan',uid:command.uid},now());
   engine.command({type:'remove'},now());
  }else result=engine.command(command,now());
  try{save();storageError='';}
  catch(e){
   engine.restore(previous,true);offset=oldOffset;storageError='Speicherfehler. Aktion nicht übernommen. Bitte Speicher prüfen.';
   return {ok:false,message:storageError,state:state()};
  }
  return {...result,state:state()};
 }
 const server=http.createServer(async(req,res)=>{
  const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  // Local-only service, no permissive CORS; reject foreign Host and Origin (DNS-rebinding / drive-by writes).
  if(!/^127\.0\.0\.1:\d+$/.test(req.headers.host||''))return reply(403,{message:'Nur lokaler Zugriff erlaubt.'});
  if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return reply(403,{message:'Fremder Ursprung abgelehnt.'});
  let url,decodedPath;
  try{url=new URL(req.url,`http://${req.headers.host}`);decodedPath=decodeURIComponent(url.pathname);}catch{return reply(400,{message:'Ungültige Adresse.'});}
  if(url.pathname==='/api/health')return reply(200,{app:'mensaampel',version:1});
  if(url.pathname==='/api/info')return reply(200,{mode:'pc',version:'0.2.0'});
  if(url.pathname==='/api/signal'){
   if(Date.now()<offlineUntil)return reply(503,{message:'Simulierte Verbindungsunterbrechung.'});
   const s=state();return reply(200,{signal:s.signal,storageError:s.storageError,now:s.now});
  }
  if(url.pathname==='/api/state'){
   if(Date.now()<offlineUntil)return reply(503,{message:'Simulierte Verbindungsunterbrechung.'});
   return reply(200,{...state(),token});
  }
  if(url.pathname==='/api/command'&&req.method==='POST'){
   if(req.headers['x-mensa-token']!==token)return reply(403,{message:'Sitzung ungültig. Seite neu laden.'});
   if(Date.now()<offlineUntil)return reply(503,{message:'Verbindung unterbrochen.'});
   let body='';try{
    for await(const chunk of req){body+=chunk;if(body.length>16000)return reply(413,{message:'Anfrage zu groß.'});}
    return reply(200,transact(JSON.parse(body)));
   }catch(e){return reply(400,{ok:false,message:'Ungültige Anfrage: '+e.message});}
  }
  if(url.pathname.startsWith('/api/'))return reply(404,{message:'Nicht gefunden.'});
  if(req.method!=='GET'&&req.method!=='HEAD')return reply(405,{message:'Methode nicht erlaubt.'});
  const publicDir=resolve(root,'dist');let path=resolve(publicDir,'.'+decodedPath);
  if(!path.startsWith(publicDir+'/')&&!path.startsWith(publicDir+'\\')&&path!==publicDir)return reply(403,{});
  if(!extname(path))path=resolve(publicDir,'index.html');
  try{
   const content=readFileSync(path);const type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon'}[extname(path)]||'application/octet-stream';
   res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"});res.end(content);
  }catch{res.writeHead(404);res.end('Nicht gefunden. Anwendung zuerst bauen.');}
 });
 return {server,engine,state,transact};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const app=await createApp({dataDir:process.env.MENSA_DATA_DIR||undefined});
 const port=Number(process.env.PORT||4317);
 app.server.on('error',e=>{console.error('Start fehlgeschlagen:',e.message);process.exitCode=1;});
 app.server.listen(port,'127.0.0.1',()=>console.log(`Mensaampel bereit: http://127.0.0.1:${port}`));
}
