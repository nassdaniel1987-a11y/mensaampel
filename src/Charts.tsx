import {useState} from 'react';import type {DayReport} from './types';
// Daily report charts: plain SVG, thin marks, recessive grid, hover tooltip; the table below is the accessible view.
const W=460,H=190,pad={l:34,r:10,t:12,b:26};
const series={faster:'#2a78d6',full:'#eb6834',relief:'#1baf7a'};
const days=['So','Mo','Di','Mi','Do','Fr','Sa'];
const dayName=(d:DayReport)=>`Tag ${d[0]}${d[1]>=0?` · ${days[d[1]]}`:''}`;
function ticks(max:number){const step=max<=5?1:max<=10?2:max<=25?5:max<=50?10:max<=100?20:Math.ceil(max/5/50)*50;const top=Math.max(step,Math.ceil(max/step)*step);return {top,values:Array.from({length:top/step+1},(_,i)=>i*step)};}
// Column with 4px rounded data end, square at the baseline.
const column=(x:number,y:number,w:number,h:number,round:boolean)=>h<=0?'':round&&h>4?`M${x},${y+h}V${y+4}Q${x},${y} ${x+4},${y}H${x+w-4}Q${x+w},${y} ${x+w},${y+4}V${y+h}Z`:`M${x},${y+h}V${y}H${x+w}V${y+h}Z`;
function Frame({title,max,count,children,hover,setHover,label}:{title:string;max:number;count:number;children:(x:(i:number)=>number,y:(v:number)=>number,band:number)=>React.ReactNode;hover:number|null;setHover:(i:number|null)=>void;label:(i:number)=>string}){
 const t=ticks(max),band=(W-pad.l-pad.r)/Math.max(count,1),x=(i:number)=>pad.l+band*i+band/2,y=(v:number)=>pad.t+(H-pad.t-pad.b)*(1-v/t.top);
 return <figure className="chart"><figcaption>{title}</figcaption><div className="chart-box"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} onMouseLeave={()=>setHover(null)}>
  {t.values.map(v=><g key={v}><line x1={pad.l} x2={W-pad.r} y1={y(v)} y2={y(v)} className="chart-grid"/><text x={pad.l-6} y={y(v)+4} textAnchor="end" className="chart-tick">{v}</text></g>)}
  {children(x,y,band)}
  {Array.from({length:count},(_,i)=>(count<=14||i%Math.ceil(count/14)===0)&&<text key={i} x={x(i)} y={H-8} textAnchor="middle" className="chart-tick">{label(i)}</text>)}
  {Array.from({length:count},(_,i)=><rect key={`hit${i}`} x={pad.l+band*i} y={pad.t} width={band} height={H-pad.t-pad.b} fill="transparent" onMouseEnter={()=>setHover(i)} onFocus={()=>setHover(i)} tabIndex={0}/>)}
  {hover!==null&&<line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H-pad.b} className="chart-cross"/>}
 </svg></div></figure>;
}
export function DayCharts({reports}:{reports:DayReport[]}){
 const [hover,setHover]=useState<number|null>(null);const n=reports.length;
 if(n<2)return <p className="hint">Diagramme erscheinen, sobald mindestens zwei Essenstage erfasst sind.</p>;
 const short=(i:number)=>String(reports[i][0]),barW=(band:number)=>Math.min(24,band-2);
 const maxKids=Math.max(1,...reports.map(d=>d[2])),maxInt=Math.max(1,...reports.map(d=>d[6]+d[7]+d[8])),learned=reports.map(d=>d[12]>0?d[12]/10:null),maxLearned=Math.max(5,...learned.map(v=>v??0));
 const h=hover!==null?reports[hover]:null;
 return <div className="charts">
  {!h&&<div className="chart-tip muted">Auf einen Tag zeigen oder tippen, um die Werte zu sehen. Alle Zahlen stehen auch in der Tabelle darunter.</div>}
  {h&&<div className="chart-tip" role="status"><strong>{dayName(h)}</strong><span>{h[2]} Kinder · {h[4]} Gruppen</span><span><i style={{background:series.faster}}/>früher frei {h[6]} · <i style={{background:series.full}}/>zu voll {h[7]} · <i style={{background:series.relief}}/>Entlastungen {h[8]}</span><span>{h[12]>0?`${(h[12]/10).toLocaleString('de-DE')} s pro Kind gelernt`:'noch kein Lernwert'}</span></div>}
  <Frame title="Kinder pro Essenstag" max={maxKids} count={n} hover={hover} setHover={setHover} label={short}>{(x,y,band)=>reports.map((d,i)=><path key={i} d={column(x(i)-barW(band)/2,y(d[2]),barW(band),y(0)-y(d[2]),true)} fill={series.faster} opacity={hover===null||hover===i?1:0.55}/>)}</Frame>
  <Frame title="Eingriffe pro Tag" max={maxInt} count={n} hover={hover} setHover={setHover} label={short}>{(x,y,band)=>reports.map((d,i)=>{let base=0;const parts:[number,string][]=[[d[6],series.faster],[d[7],series.full],[d[8],series.relief]];const shown=parts.filter(p=>p[0]>0);return <g key={i} opacity={hover===null||hover===i?1:0.55}>{shown.map(([v,c],k)=>{const top=y(base+v),bottom=y(base);base+=v;return <path key={k} d={column(x(i)-barW(band)/2,top,barW(band),Math.max(0,bottom-top-(k>0?2:0)),k===shown.length-1)} fill={c}/>;})}</g>;})}</Frame>
  <div className="chart-legend"><span><i style={{background:series.faster}}/>früher frei (Taste im Countdown)</span><span><i style={{background:series.full}}/>zu voll (nach Auto-Freigabe)</span><span><i style={{background:series.relief}}/>Entlastungen gesamt</span></div>
  <Frame title="Gelernte Sekunden pro Kind" max={maxLearned} count={n} hover={hover} setHover={setHover} label={short}>{(x,y)=>{const pts=learned.map((v,i)=>v===null?null:[x(i),y(v)] as const);const path=pts.reduce((a,p,i)=>p?a+(a&&pts[i-1]?'L':'M')+p[0]+','+p[1]:a,'');return <><path d={path} fill="none" stroke={series.faster} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"/>{pts.map((p,i)=>p&&<circle key={i} cx={p[0]} cy={p[1]} r={hover===i?5.5:4} fill={series.faster} stroke="#fff" strokeWidth={2}/>)}</>;}}</Frame>
 </div>;
}
