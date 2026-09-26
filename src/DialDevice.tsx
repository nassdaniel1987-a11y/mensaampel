import {useEffect,useRef,useState} from 'react';import {Volume2,VolumeX} from 'lucide-react';
import {glcdAscii} from './glcdfont';import type {DialItem,State} from './types';
// Pixel-exact rendering of the Dial main screen (240x240 round panel, M5GFX default font) from the core's draw list.
const size=240,touch={x:30,y:142,w:180,h:35};
const rgb=(c:number)=>[Math.round(((c>>11)&31)*255/31),Math.round(((c>>5)&63)*255/63),Math.round((c&31)*255/31)];
function paint(items:DialItem[]){
 const px=new Uint8ClampedArray(size*size*4);for(let i=3;i<px.length;i+=4)px[i]=255;
 const dot=(x:number,y:number,c:number[])=>{if(x<0||y<0||x>=size||y>=size)return;const i=(y*size+x)*4;px[i]=c[0];px[i+1]=c[1];px[i+2]=c[2];};
 const span=(x0:number,x1:number,y:number,c:number[])=>{for(let x=x0;x<=x1;x++)dot(x,y,c);};
 for(const item of items){
  if(item[0]==='c'){const [,cx,cy,r,col]=item,c=rgb(col);for(let dy=-r;dy<=r;dy++){const dx=Math.floor(Math.sqrt(r*r+r-dy*dy));span(cx-dx,cx+dx,cy+dy,c);}}
  else if(item[0]==='r'){const [,x,y,w,h,r,col]=item,c=rgb(col);for(let yy=0;yy<h;yy++){const d=yy<r?r-yy:yy>=h-r?yy-(h-r-1):0,inset=d?r-Math.floor(Math.sqrt(r*r+r-d*d)):0;span(x+inset,x+w-1-inset,y+yy,c);}}
  else{const [,x,y,s,col,text]=item,c=rgb(col),left=x-((text.length*6*s)>>1),top=y-((8*s)>>1);
   [...text].forEach((ch,n)=>{let code=ch.charCodeAt(0);if(code<0x20||code>0x7e)code=0x3f;for(let col=0;col<5;col++){const bits=parseInt(glcdAscii.substr(((code-0x20)*5+col)*2,2),16);for(let row=0;row<8;row++)if(bits>>row&1)for(let a=0;a<s;a++)for(let b=0;b<s;b++)dot(left+(n*6+col)*s+a,top+row*s+b,c);}});}
 }
 return new ImageData(px,size,size);
}
let audio:AudioContext|null=null;
function beep(ok:boolean){try{audio??=new AudioContext();const o=audio.createOscillator(),g=audio.createGain();o.type='square';o.frequency.value=ok?1800:400;g.gain.value=0.04;o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+(ok?0.09:0.22));}catch{/* no sound available */}}
const readMute=()=>{try{return localStorage.getItem('mensa-dial-mute')==='1';}catch{return false;}};
export function DialDevice({state:s,onTouch,onPress,onCard,disabled}:{state:State;onTouch:()=>void;onPress:()=>void;onCard:(uid:string)=>void;disabled:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null),lastFeedback=useRef(s.feedback?.at??0),[muted,setMuted]=useState(readMute),[over,setOver]=useState(false);
 useEffect(()=>{const ctx=canvas.current?.getContext('2d');if(ctx&&s.dial)ctx.putImageData(paint(s.dial),0,0);},[s.dial]);
 useEffect(()=>{const at=s.feedback?.at??0;if(at>lastFeedback.current&&!muted)beep(!!s.feedback?.ok);lastFeedback.current=Math.max(lastFeedback.current,at);},[s.feedback,muted]);
 function click(e:React.MouseEvent<HTMLCanvasElement>){
  e.stopPropagation();const r=e.currentTarget.getBoundingClientRect(),x=(e.clientX-r.left)*size/r.width,y=(e.clientY-r.top)*size/r.height;
  if(!disabled&&!s.flow?.relief&&x>=touch.x&&x<=touch.x+touch.w&&y>=touch.y&&y<=touch.y+touch.h)onTouch();
 }
 const toggleMute=()=>{const next=!muted;setMuted(next);try{localStorage.setItem('mensa-dial-mute',next?'1':'0');}catch{/* per-viewer convenience only */}};
 return <div className="dial-device">
  <div className={`dial-ring ${over?'card-over':''}`} role="button" tabIndex={0} aria-label="Dial-Taste drücken" title="Ring anklicken = Taste drücken"
   onClick={()=>{if(!disabled)onPress();}} onKeyDown={e=>{if((e.key==='Enter'||e.key===' ')&&!disabled){e.preventDefault();onPress();}}}
   onDragOver={e=>{e.preventDefault();setOver(true);}} onDragLeave={()=>setOver(false)} onDrop={e=>{e.preventDefault();setOver(false);const uid=e.dataTransfer.getData('text/plain');if(uid&&!disabled)onCard(uid);}}>
   <canvas ref={canvas} width={size} height={size} onClick={click} aria-label={(s.dial||[]).filter(i=>i[0]==='t').map(i=>i[5]).join(' · ')}/>
  </div>
  <div className="dial-controls"><button className="outline" disabled={disabled} onClick={onPress}>Taste drücken</button><button className="quiet" onClick={toggleMute} aria-pressed={muted}>{muted?<VolumeX size={18}/>:<Volume2 size={18}/>}{muted?'Ton aus':'Ton an'}</button></div>
  <p className="hint">Wie am Gerät: orange Fläche antippen = Ausgabe entlasten · Taste = Pause, weiter oder nächste Gruppe freigeben · Karte auf das Dial ziehen = vorhalten.</p>
 </div>;
}
