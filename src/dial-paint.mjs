// Pixel rendering of the Dial draw list (240x240 round panel, M5GFX default GLCD font), shared by the simulation and the printed guide.
import {glcdAscii} from './glcdfont.mjs';
export const dialSize=240;
const rgb=c=>[Math.round(((c>>11)&31)*255/31),Math.round(((c>>5)&63)*255/63),Math.round((c&31)*255/31)];
/** Returns RGBA pixels; outside the round panel stays transparent when round is set. */
export function paintDial(items,{round=false}={}){
 const size=dialSize,px=new Uint8ClampedArray(size*size*4);for(let i=3;i<px.length;i+=4)px[i]=255;
 const dot=(x,y,c)=>{if(x<0||y<0||x>=size||y>=size)return;const i=(y*size+x)*4;px[i]=c[0];px[i+1]=c[1];px[i+2]=c[2];};
 const span=(x0,x1,y,c)=>{for(let x=x0;x<=x1;x++)dot(x,y,c);};
 for(const item of items){
  if(item[0]==='f'){const c=rgb(item[1]);for(let y=0;y<size;y++)span(0,size-1,y,c);}
  else if(item[0]==='c'){const [,cx,cy,r,col]=item,c=rgb(col);for(let dy=-r;dy<=r;dy++){const dx=Math.floor(Math.sqrt(r*r+r-dy*dy));span(cx-dx,cx+dx,cy+dy,c);}}
  else if(item[0]==='r'){const [,x,y,w,h,r,col]=item,c=rgb(col);for(let yy=0;yy<h;yy++){const d=yy<r?r-yy:yy>=h-r?yy-(h-r-1):0,inset=d?r-Math.floor(Math.sqrt(r*r+r-d*d)):0;span(x+inset,x+w-1-inset,y+yy,c);}}
  else if(item[0]==='a'){const [,cx,cy,r0,r1,a0,a1,col]=item,c=rgb(col);for(let y=cy-r1;y<=cy+r1;y++)for(let x=cx-r1;x<=cx+r1;x++){const dx=x-cx,dy=y-cy,d2=dx*dx+dy*dy;if(d2<r0*r0||d2>r1*r1+r1)continue;let a=Math.atan2(dy,dx)*180/Math.PI;if(a<0)a+=360;if(a>=a0&&a<=a1)dot(x,y,c);}}
  else if(item[0]==='t'){const [,x,y,s,col,text]=item,c=rgb(col),left=x-((text.length*6*s)>>1),top=y-((8*s)>>1);
   [...text].forEach((ch,n)=>{let code=ch.charCodeAt(0);if(code<0x20||code>0x7e)code=0x3f;for(let k=0;k<5;k++){const bits=parseInt(glcdAscii.substr(((code-0x20)*5+k)*2,2),16);for(let row=0;row<8;row++)if(bits>>row&1)for(let a=0;a<s;a++)for(let b=0;b<s;b++)dot(left+(n*6+k)*s+a,top+row*s+b,c);}});}
 }
 if(round)for(let y=0;y<size;y++)for(let x=0;x<size;x++){const dx=x-119.5,dy=y-119.5;if(dx*dx+dy*dy>120*120)px[(y*size+x)*4+3]=0;}
 return px;
}
