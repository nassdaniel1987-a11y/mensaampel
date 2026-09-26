import {Check,Hand,WifiOff,Maximize} from 'lucide-react';
import type {State} from './types';
export function Signal({state,connected,full=false}:{state:State|null;connected:boolean;full?:boolean}){
 const reason=!connected?'offline':state?.storageError?'storage':state?.signal.reason;
 const green=reason==='free',yellow=reason==='low',admitting=green||yellow;
 const title=green?'Komm herein':yellow?'Wenige Plätze':reason==='full'?'Einlass zu':reason==='paused'||reason==='batch'||reason==='relief'?'Einlass zu':reason==='confirm'?'Noch geschlossen':'Bitte zur Betreuung';
 const text=admitting?'Bitte einzeln bei der Kartenausgabe melden.':reason==='full'||reason==='paused'||reason==='batch'||reason==='relief'?'Bitte später wiederkommen.':reason==='confirm'?'Wir bereiten alles vor.':'Die Anzeige hat gerade keine Verbindung oder ist nicht bereit.';
 return <section className={`signal ${full?'fullscreen-signal':''} ${yellow?'yellow':green?'green':'red'}`} aria-label="Ampelanzeige">
  <div className="signal-circle" aria-hidden="true">{admitting?<Check/>:reason==='offline'?<WifiOff/>:<Hand/>}</div>
  <h2>{title}</h2><p>{text}</p>
  {full&&<><p className="signal-note">{admitting?'Deinen Platz bekommst du mit einer Platzkarte.':'Bitte den Eingang freihalten.'}</p><button className="fullscreen-button" onClick={()=>{if(document.fullscreenElement)void document.exitFullscreen();else void document.documentElement.requestFullscreen?.().catch(()=>{});}}><Maximize size={18}/> Vollbild</button><span className="signal-brand">Mensaampel</span></>}
 </section>;
}
