const fs = require('node:fs');
const path = require('node:path');
const size = 256, pixels = Buffer.alloc(size * size * 4);
function blend(x,y,c){const i=(y*size+x)*4;pixels[i]=c[2];pixels[i+1]=c[1];pixels[i+2]=c[0];pixels[i+3]=c[3]??255}
function circle(cx,cy,r,c){for(let y=Math.max(0,cy-r);y<=Math.min(size-1,cy+r);y++)for(let x=Math.max(0,cx-r);x<=Math.min(size-1,cx+r);x++)if((x-cx)**2+(y-cy)**2<=r*r)blend(x,y,c)}
function rect(x0,y0,x1,y1,c){for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)blend(x,y,c)}
// Fill a warm parchment field, then paint an evergreen compass and gold trail.
rect(0,0,size-1,size-1,[22,32,23]);circle(128,128,108,[218,183,112]);circle(128,128,91,[25,43,32]);
// compass points
for(let y=46;y<210;y++){let half=Math.max(0,Math.floor((y<128?y-46:210-y)*.33));for(let x=128-half;x<=128+half;x++)blend(x,y,[218,183,112]);}
// dark vertical/horizontal axis for a map-like glyph
rect(120,63,135,193,[25,43,32]);rect(63,120,193,135,[25,43,32]);
// a winding trail and waypoint
for(let y=83;y<180;y++){let x=Math.round(123+27*Math.sin((y-83)/96*Math.PI));circle(x,y,8,[227,202,145]);}
circle(128,128,16,[198,116,73]);circle(128,128,7,[246,228,177]);
const xor=Buffer.alloc(size*size*4);for(let y=0;y<size;y++)pixels.copy(xor,(size-1-y)*size*4,y*size*4,(y+1)*size*4)
const mask=Buffer.alloc(Math.ceil(size/32)*4*size),dib=Buffer.alloc(40);dib.writeUInt32LE(40,0);dib.writeInt32LE(size,4);dib.writeInt32LE(size*2,8);dib.writeUInt16LE(1,12);dib.writeUInt16LE(32,14);dib.writeUInt32LE(0,16);dib.writeUInt32LE(xor.length+mask.length,20);
const image=Buffer.concat([dib,xor,mask]);const header=Buffer.alloc(22);header.writeUInt16LE(0,0);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header.writeUInt8(0,6);header.writeUInt8(0,7);header.writeUInt8(0,8);header.writeUInt8(0,9);header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(image.length,14);header.writeUInt32LE(22,18);
fs.writeFileSync(path.join(__dirname,'icon.ico'),Buffer.concat([header,image]));
