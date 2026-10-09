// Sprite prototype for Wayfarer: tiles are 8x8 pixel patterns drawn at 2x (16px per tile).
// Patterns use one character per pixel; '.' is transparent. Colours come from PAL (or per-sprite overrides).
const GFX=(()=>{
const T=16;
const PAL={k:'#14181a',K:'#2b3330',a:'#5b6660',A:'#8c968e',W:'#d8dcd0',r:'#b5483a',R:'#7d2a24',o:'#d9822b',y:'#e5bd69',Y:'#f3de8f',g:'#2f5d34',G:'#4f8f3c',l:'#8fc46a',b:'#3a6f9c',B:'#7fb2d8',n:'#6b4a2b',N:'#9a6c3f',p:'#8a5fb0',P:'#c4a0dc',s:'#e0b894',m:'#cfd6dc'};
const P={
 tree:['..gGGg..','.gGllGg.','gGlGGlGg','gGGlGGGg','.gGGGGg.','..gGGg..','...nn...','...nK...'],
 rock:['........','...AA...','..AAWA..','.AAAAaA.','.AaAAaaA','AaaAaKaa','aKaaaKKa','.KKKKKK.'],
 berry:['..gGg...','.gGGGg..','gGrGGrg.','gGGGrGg.','.gGrGGg.','..gGGg..','...nn...','........'],
 ore:['..aaaa..','.aAAAAa.','aAXAAXAa','aAAAXAAa','aAXAAAAa','aAAAAXAa','.aAAAAa.','..aaaa..'],
 chest:['........','.nnnnnn.','nNNNNNNn','nyyyyyyn','nNNyyNNn','nNNNNNNn','nnnnnnnn','........'],
 enemy:['.k....k.','kKkkkkKk','kKrKKrKk','kKKKKKKk','kKkRRkKk','.kKKKKk.','.kk..kk.','.k....k.'],
 fox:['o.o.....','ooo....o','oWoooooo','.ooooooo','..oWWWoo','..o.o.o.','..k.k.k.','........'],
 foe:['.pppp...','.pPPp...','.pssp...','pppppp..','pPpppPp.','pppppp..','.pp.pp..','.nn.nn..'],
 player:['..yyyy..','.yyyyyy.','..ssss..','..sksk..','.bbbbbb.','bbbyybbb','.bbbbbb.','.nn..nn.'],
 worker:['........','..nnnn..','..ssss..','..sksk..','.GGGGGG.','sGGGGGGs','.GGGGGG.','.nn..nn.'],
 soldier:['a.AAAA..','a.AkkA..','a.ssss..','arrrrrr.','arRrrRr.','arrrrrr.','a.rr.rr.','a.nn.nn.'],
 house:['..XXXX..','.XXXXXX.','XXXXXXXX','.NNNNNN.','.NEENkN.','.NEENkN.','.nnnnnn.','........'],
 well:['..nnnn..','.n....n.','.n....n.','aaaaaaaa','aAbbbbAa','aAbBBbAa','aaaaaaaa','........'],
 farm:['.y.y.y.y','yyyyyyyy','.n.n.n.n','.y.y.y.y','yyyyyyyy','.n.n.n.n','........','........'],
 camp:['...nn...','..nNNn..','.nNNNNn.','nNNkkNNn','nNNkkNNn','nnnnnnnn','........','........'],
 beacon:['...YY...','..YyyY..','...yy...','..aAAa..','..aAAa..','..aAAa..','.aaAAaa.','aaaaaaaa'],
 town:['.rr..bb.','rrrrbbbb','NNNNNNNN','NkNNNkNN','nnnnnnnn','........','........','........'],
 home:['..rrrr..','.rrrrrr.','rrrrrrrr','.NNNNNN.','.NyyNkN.','.NyyNkN.','.nnnnnn.','........'],
 cave:['.aaaaaa.','aaAAAAaa','aAkkkkAa','aAkkkkAa','aAkkkkAa','aAkkkkAa','aaAkkAaa','........'],
 dungeon:['a.aaaa.a','aaAAAAaa','aAkkkkAa','aAkRRkAa','aAkRRkAa','aAkkkkAa','aaAAAAaa','aaaaaaaa'],
 keep:['y.y..y.y','kkkkkkkk','kKKKKKKk','kKrKKrKk','kKKKKKKk','kKkkkkKk','kKkRRkKk','kkkkkkkk'],
 mine:['..nnnn..','.nkkkkn.','nNkkkkNn','nNkkkkNn','nNkkkkNn','aaaaaaaa','........','........'],
 treeSpent:['........','........','...nn...','..nNNn..','.nNyyNn.','.nNNNNn.','.nnnnnn.','..nKKn..'],
 rockSpent:['........','........','........','........','..AaA...','.AaaKaA.','aKaaaKKa','.KKKKKK.'],
 stairL:['....y...','...yy...','..yyyyyy','.yyyyyyy','..yyyyyy','...yy...','....y...','........'],
 stairR:['...y....','...yy...','yyyyyy..','yyyyyyy.','yyyyyy..','...yy...','...y....','........']
};
for(const r of Object.values(P))if(r.length!==8||r.some(x=>x.length!==8))throw new Error('bad sprite');
const HOUSES={market:['#c9a227','#3a6f9c'],smithy:['#444b50','#ff7a2b'],huntersLodge:['#3b7a3b','#e0b894'],gemHall:['#8a5fb0','#f0a0ff'],lumberMill:['#8a5a2b','#d9a066'],mine:['#6a6f73','#111111'],tannery:['#c0642a','#e8c9a0'],fishingHut:['#3a6f9c','#9ad0f0'],barracks:['#7d2a24','#cfd6dc']};
const ORES={c:'#d9822b',i:'#5a7fa8',s:'#ffffff',a:'#f3d44a','◆':'#c46bf0'};
const ENEMY_ART={
 beast:['X.X.....','XXX....X','XEXXXXXX','.XXXXXXX','..XXXXXx','..X.X.X.','..x.x.x.','........'],
 humanoid:['..xxxx..','.xXXXXx.','.XXEEXX.','XXXXXXXX','.XXXXXX.','.XX..XX.','.xx..xx.','........'],
 undead:['..XXXX..','.XxXXxX.','..XXXX..','.XXxxXX.','..XxxX..','.XX..XX.','.X....X.','........'],
 crawler:['x..xx..x','.x.xx.x.','..xXXx..','xxXEEXxx','..xXXx..','.x.xx.x.','x..xx..x','........'],
 brute:['..xxxx..','.xXXXXx.','.XXEEXX.','XXXXXXXX','XXXXXXXX','.XX..XX.','.XX..XX.','xxx..xxx'],
 crystal:['...XX...','..XXXX..','.XXEEXX.','XXXXXXXX','.XXXXXX.','..XXXX..','...XX...','........'],
 horror:['.xxxxxx.','xXXEEXXx','xXXXXXXx','.XXXXXX.','x.XXXX.x','x..XX..x','.x.XX.x.','........'],
 king:['y.y.y.y.','yyyyyyyy','.XXXXXX.','.XEXXEX.','.XXXXXX.','XXXXXXXX','.XX..XX.','.xx..xx.']
};
// name -> [art, main colour, dark colour, eye colour]
const ENEMY_LOOK={'Town Guard':['humanoid','#3a6f9c','#1c3a52','#ffffff'],'Town Captain':['humanoid','#8a5fb0','#44285c','#ffe08a'],'Raider':['humanoid','#a23a2a','#4a1a12','#f3de8f'],'Raid Chief':['brute','#a23a2a','#4a1a12','#ffe08a'],'Briar Wolf':['beast','#8c968e','#4a524d','#f3de8f'],'Thornback Boar':['beast','#7a4f2b','#4a2f19','#f3de8f'],'Roadside Bandit':['humanoid','#6b4a2b','#3a2a1a','#ffffff'],'Thorn Stalker':['beast','#2f6b3a','#17381e','#f3de8f'],'Dire Wolf':['beast','#4a524d','#1c2220','#ff4a3a'],'Moss Troll':['brute','#4f8f3c','#2f5d34','#f3de8f'],'Tunnel Rat':['beast','#b89870','#6b5638','#ff6a5a'],'Kobold Delver':['humanoid','#b5483a','#7d2a24','#f3de8f'],'Cave Spider':['crawler','#3b3f45','#14181a','#ff4a3a'],'Crystal Guardian':['crystal','#7fb2d8','#3a6f9c','#ffffff'],'Deep Horror':['horror','#5a3a7a','#2b1a3d','#ff6ad0'],'Buried Wyrm':['horror','#8a5a2b','#4a2f19','#ffd23a'],'Restless Skeleton':['undead','#d8dcd0','#5b6660','#ff4a3a'],'Grave Cultist':['humanoid','#5a2a6a','#2b1236','#ff8a3a'],'Barrow Ghoul':['undead','#8fb39a','#3a5a46','#ffe36a'],'Hollow Wraith':['undead','#9fb7d8','#4a5a78','#ffffff'],'Crypt Ogre':['brute','#8a6a4a','#4a3a2a','#f3de8f'],'Forgotten Warden':['brute','#6a6f73','#2b3330','#ff4a3a'],'Hollowfang, the Pale Alpha':['beast','#d8dcd0','#7a8480','#ff4a3a'],'Brannoch, the Iron Warden':['brute','#8c968e','#3b4540','#e5bd69'],'Gorrak, the Delver King':['humanoid','#d9822b','#7a4a14','#ffffff'],'Ilvara, the Crystal Wyrm':['crystal','#e0508a','#7a2a4a','#ffffff'],'Old Mossback':['brute','#4f8f3c','#2f5d34','#e5bd69'],'The Hollow King':['king','#c9c2a8','#4a4538','#ff4a3a']};
const ICONS={
 wood:{p:['........','..nnnn..','.nNNNNn.','nNnyynNn','nNnyynNn','.nNNNNn.','..nnnn..','........']},
 stone:{p:['........','...AA...','..AAWA..','.AAAAaA.','.AaAAaaA','AaaAaKaa','aKaaaKKa','.KKKKKK.']},
 berries:{p:P.berry},
 relic:{p:['..yyyy..','.yYYYYy.','yYyyyyYy','yYyYYyYy','yYyYYyYy','yYyyyyYy','.yYYYYy.','..yyyy..']},
 copper:{p:['........','........','..XXXXX.','.XYYYYXX','XXXXXXX.','XxxxxxX.','........','........'],o:{X:'#d9822b',Y:'#f0a860',x:'#8a4a14'}},
 iron:{p:['........','........','..XXXXX.','.XYYYYXX','XXXXXXX.','XxxxxxX.','........','........'],o:{X:'#8a95a5',Y:'#c0c8d2',x:'#4a5360'}},
 silver:{p:['........','........','..XXXXX.','.XYYYYXX','XXXXXXX.','XxxxxxX.','........','........'],o:{X:'#cfd6dc',Y:'#ffffff',x:'#8c968e'}},
 gold:{p:['........','........','..XXXXX.','.XYYYYXX','XXXXXXX.','XxxxxxX.','........','........'],o:{X:'#e5bd69',Y:'#fff2a8',x:'#9a7a2b'}},
 torch:{p:['...Y....','..YoY...','..oYo...','...n....','...n....','...n....','...n....','...K....'],o:{o:'#ff8a2b',Y:'#fff2a8'}},
 furs:{p:['..oooo..','.oOOOOo.','oOOOOOOo','oOoOOoOo','.oOOOOo.','.oO..Oo.','.o....o.','........'],o:{o:'#8a5a2b',O:'#c0803a'}},
 gems:{p:['........','..PPPP..','.PWPPpP.','PPPPPPpP','.PPPPpP.','..PPpP..','...pp...','........']},
 relic_fang:{p:['.WWWW...','..WWWW..','..WWW...','...WW...','...WW...','....W...','........','........'],o:{W:'#e8e4d0'}},
 relic_aegis:{p:['.aaaaaa.','aAAAAAAa','aArAArAa','aArrrrAa','aAArrAAa','.aAArAa.','..aAAa..','...aa...']},
 relic_lantern:{p:['...nn...','..yyyy..','.yYYYYy.','.yYWWYy.','.yYWWYy.','.yYYYYy.','..yyyy..','..nnnn..']},
 relic_heartstone:{p:['.rr..rr.','rRRrrRRr','rRRRRRRr','.rRRRRr.','..rRRr..','...rr...','........','........'],o:{r:'#e0508a',R:'#ff8ab8'}},
 relic_mossback:{p:['.GGGGGG.','GgGGgGGG','GGGGGGgG','gGGgGGGG','GGGGGGGg','GGgGGgGG','.GGGGGG.','..G..G..'],o:{G:'#4f8f3c',g:'#2f5d34'}},
 sunstone:{p:['..yyyy..','.yYYYYy.','yYYWWYYy','yYWWWWYy','yYWWWWYy','yYYWWYYy','.yYYYYy.','..yyyy..']}
};
const iconCache={};
function icon(key){if(!ICONS[key])return '';if(!iconCache[key]){const s=build(ICONS[key].p,ICONS[key].o),c=document.createElement('canvas');c.width=c.height=24;const x=c.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(s,0,0,24,24);iconCache[key]=c.toDataURL()}return iconCache[key]}
const cache={};
const portraits={};
let skinOn=false;const skinBase={},procedural={};
function build(pat,over){const c=document.createElement('canvas');c.width=c.height=T;const x=c.getContext('2d');pat.forEach((row,j)=>{for(let i=0;i<8;i++){const ch=row[i];if(ch==='.')continue;const col=(over&&over[ch])||PAL[ch];if(!col)continue;x.fillStyle=col;x.fillRect(i*2,j*2,2,2)}});return c}
for(const [k,pat] of Object.entries(P))if(!['house','ore'].includes(k))cache[k]=build(pat);
for(const [k,[roof,em]] of Object.entries(HOUSES))cache['b_'+k]=build(P.house,{X:roof,E:em});
for(const [g,col] of Object.entries(ORES))cache['ore_'+g]=build(P.ore,{X:col});
function enemySprite(name){const look=ENEMY_LOOK[name]||['beast','#8c968e','#4a524d','#ff4a3a'];return build(ENEMY_ART[look[0]],{X:look[1],x:look[2],E:look[3]})}
function portrait(name){if(!portraits[name]){const sp=skinOn&&SKIN_PORTRAITS[name],s=sp?cut(skinSheets[sp[0]],sp[1],sp[2]):enemySprite(name),c=document.createElement('canvas');c.width=c.height=96;const x=c.getContext('2d');x.imageSmoothingEnabled=false;x.fillStyle='#111a14';x.fillRect(0,0,96,96);x.drawImage(s,8,8,80,80);portraits[name]=c.toDataURL()}return portraits[name]}
cache.tree_spent=build(P.treeSpent);cache.rock_spent=build(P.rockSpent);cache.berry_spent=build(P.berry,{r:'#4f8f3c'});cache.ore_spent=build(P.ore,{X:'#3b4540'});
cache.b_garden=cache.farm;cache.b_well=cache.well;cache.b_huntingCamp=cache.camp;cache.b_beacon=cache.beacon;
const SPRITE_OF={'♣':'tree','▲':'rock','%':'berry','?':'chest','g':'enemy','x':'fox','C':'cave','D':'dungeon','K':'keep','M':'mine','S':'town','⌂':'home','<':'stairL','>':'stairR',c:'ore_c',i:'ore_i',s:'ore_s',a:'ore_a','◆':'ore_◆'};
function hash(x,y){return (Math.imul(x,73856093)^Math.imul(y,19349663))>>>0}
function base(ctx,kind,x,y,px,py,frame,edges){
 const h=hash(x,y);
 if(skinOn){const set=skinBase[kind];if(set){ctx.drawImage(kind==='water'?set[frame%2]:set[(h>>>3)%set.length],px,py);if(kind==='floor'||kind==='wall'){ctx.fillStyle=kind==='floor'?'rgba(8,14,12,.58)':'rgba(8,14,12,.35)';ctx.fillRect(px,py,T,T)}if(edges&&kind==='grass'){ctx.fillStyle='#b8a878';if(edges&1)ctx.fillRect(px,py,T,2);if(edges&2)ctx.fillRect(px,py+T-2,T,2);if(edges&4)ctx.fillRect(px,py,2,T);if(edges&8)ctx.fillRect(px+T-2,py,2,T)}return}}
 if(kind==='water'){ctx.fillStyle='#2e5f86';ctx.fillRect(px,py,T,T);ctx.fillStyle='#4f8db8';const o=((h&3)+frame*2)%T;ctx.fillRect(px+(o%12),py+4+(h>>2&3),4,1);ctx.fillRect(px+((o+7)%12),py+11,3,1);return}
 if(kind==='wall'){ctx.fillStyle='#1c2220';ctx.fillRect(px,py,T,T);ctx.fillStyle='#3b4540';ctx.fillRect(px,py+1,T,6);ctx.fillRect(px,py+9,T,6);ctx.fillStyle='#2b3330';const off=(y&1)*4;ctx.fillRect(px+off+3,py+1,1,6);ctx.fillRect(px+off+11,py+1,1,6);ctx.fillRect(px+(4-off)+3,py+9,1,6);ctx.fillRect(px+(4-off)+11,py+9,1,6);return}
 const floor=kind==='floor';ctx.fillStyle=floor?'#262c29':'#3d6b3a';ctx.fillRect(px,py,T,T);
 for(let k=0;k<3;k++){const sx=(h>>(k*5))&15,sy=(h>>(k*5+3))&15;ctx.fillStyle=k===0?(floor?'#2f3733':'#4a7c44'):(floor?'#1f2522':'#34602f');ctx.fillRect(px+sx,py+sy,1+(k===0?1:0),1)}
 if(edges&&!floor){ctx.fillStyle='#b8a878';if(edges&1)ctx.fillRect(px,py,T,2);if(edges&2)ctx.fillRect(px,py+T-2,T,2);if(edges&4)ctx.fillRect(px,py,2,T);if(edges&8)ctx.fillRect(px+T-2,py,2,T)}
}
function sprite(ctx,key,px,py,alpha,flip,pose){const s=cache[key];if(!s)return;ctx.save();if(alpha!=null&&alpha<1)ctx.globalAlpha=alpha;ctx.translate(px+T/2,py+T+(pose&&pose.dy||0));if(pose&&pose.lean)ctx.rotate(pose.lean);if(flip)ctx.scale(-1,1);ctx.drawImage(s,-T/2,-T);ctx.restore()}
function shadow(ctx,px,py){ctx.fillStyle='rgba(0,0,0,.3)';ctx.beginPath();ctx.ellipse(px+T/2,py+T-1.5,5,2,0,0,Math.PI*2);ctx.fill()}
function bar(ctx,px,py,frac){ctx.fillStyle='#14181a';ctx.fillRect(px+1,py,T-2,3);ctx.fillStyle=frac>.5?'#7fbf5a':frac>.25?'#e5bd69':'#df4a3a';ctx.fillRect(px+2,py+1,Math.max(1,Math.round((T-4)*frac)),1)}
function tint(ctx,w,h,a){if(a<=0)return;ctx.fillStyle='rgba(10,20,60,'+a.toFixed(3)+')';ctx.fillRect(0,0,w,h)}
// ---- Optional art skin: Kenney's CC0 Roguelike/RPG Pack + Roguelike Characters (16px tiles, 1px spacing) ----
// Entries are [sheet, column, row]. Anything not listed keeps the handmade art.
const SKIN_TILES={tree:['rpg',13,9],tree_spent:['rpg',22,10],rock:['rpg',54,21],rock_spent:['rpg',56,22],berry:['rpg',24,9],berry_spent:['rpg',19,9],chest:['rpg',37,9],enemy:['chars',0,3],foe:['chars',0,8],player:['chars',0,7],worker:['chars',0,5],soldier:['chars',0,11],
 home:['rpg',32,0],town:['rpg',33,0],cave:['rpg',40,8],dungeon:['rpg',42,9],keep:['rpg',44,9],mine:['rpg',36,1],stairL:['rpg',50,25],stairR:['rpg',51,25],ore_spent:['rpg',54,20],
 b_market:['rpg',10,0],b_garden:['rpg',22,11],b_well:['rpg',24,0],b_smithy:['rpg',15,0],b_huntersLodge:['rpg',48,10],b_gemHall:['rpg',43,11],b_lumberMill:['rpg',53,21],b_mine:['rpg',49,21],b_tannery:['rpg',51,12],b_fishingHut:['rpg',53,18],b_huntingCamp:['rpg',46,10],b_barracks:['rpg',50,0],b_beacon:['rpg',18,8]};
const SKIN_WORKERS=[[0,5],[1,5],[0,6],[1,6],[0,7],[1,7],[0,9],[1,9]];
const SKIN_ORES={c:'#d9822b',i:'#7fb2d8',s:'#ffffff',a:'#f3d44a','◆':'#c46bf0'};
const SKIN_PORTRAITS={'Roadside Bandit':['chars',0,8],'Kobold Delver':['chars',1,3],'Grave Cultist':['chars',1,10],'Moss Troll':['chars',0,3],'Crypt Ogre':['chars',1,8],'Forgotten Warden':['chars',0,11],'The Hollow King':['chars',1,10],'Restless Skeleton':['chars',1,11],'Barrow Ghoul':['chars',1,3]};
let skinSheets=null;
function cut(sheet,col,row){const c=document.createElement('canvas');c.width=c.height=T;c.getContext('2d').drawImage(sheet,col*17,row*17,16,16,0,0,T,T);return c}
function loadImage(src){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('image failed to load'));i.src=src})}
function workerKey(id){if(!skinOn||id==null)return 'worker';let h=0;for(const ch of String(id))h=(h*31+ch.charCodeAt(0))>>>0;return 'worker'+(h%SKIN_WORKERS.length)}
async function setSkin(name){
 if(!name){skinOn=false;for(const k of Object.keys(procedural))cache[k]=procedural[k];for(const k of Object.keys(portraits))delete portraits[k];return true}
 if(!skinSheets){const [rpg,chars]=await Promise.all([loadImage(KENNEY_DATA.rpg),loadImage(KENNEY_DATA.chars)]);skinSheets={rpg,chars}}
 const put=(k,c)=>{if(!(k in procedural))procedural[k]=cache[k];cache[k]=c};
 for(const [k,[sh,c,r]] of Object.entries(SKIN_TILES))put(k,cut(skinSheets[sh],c,r));
 SKIN_WORKERS.forEach(([c,r],i)=>put('worker'+i,cut(skinSheets.chars,c,r)));
 for(const [g,col] of Object.entries(SKIN_ORES)){const c=cut(skinSheets.rpg,55,21),x=c.getContext('2d');x.fillStyle=col;for(const [a,b] of [[4,5],[9,4],[6,9],[10,10]])x.fillRect(a,b,2,2);put('ore_'+g,c)}
 skinBase.grass=[[5,0],[5,1],[5,0],[5,1],[5,0]].map(([c,r])=>cut(skinSheets.rpg,c,r));skinBase.floor=[[7,0],[7,1],[7,0]].map(([c,r])=>cut(skinSheets.rpg,c,r));skinBase.wall=[[6,2],[6,3]].map(([c,r])=>cut(skinSheets.rpg,c,r));skinBase.water=[[0,0],[1,0]].map(([c,r])=>cut(skinSheets.rpg,c,r));
 for(const k of Object.keys(portraits))delete portraits[k];
 skinOn=true;return true}
// ---- Settlement map art (always handmade): ground tiles, plus whole buildings painted once and sliced per tile ----
const shade=(hex,f)=>{const n=parseInt(hex.slice(1),16),m=f<0?0:255,t=Math.abs(f),ch=v=>Math.round(v+(m-v)*t);return '#'+[(n>>16)&255,(n>>8)&255,n&255].map(v=>ch(v).toString(16).padStart(2,'0')).join('')};
function townTile(ctx,g,x,y,px,py,frame,edges){
 const h=hash(x,y);
 if(g==='▒'||g==='▼'){
  ctx.fillStyle='#a38a5c';ctx.fillRect(px,py,T,T);
  for(let k=0;k<5;k++){const sx=(h>>(k*4))&15,sy=(h>>(k*4+2))&15;ctx.fillStyle=k%2?'#8f784c':'#b8a070';ctx.fillRect(px+sx,py+sy,2,1)}
  if(g==='▼'){ctx.fillStyle='#4a3a22';ctx.fillRect(px,py,3,T);ctx.fillRect(px+T-3,py,3,T);ctx.fillStyle='#e5bd69';ctx.fillRect(px+3,py+T-3,T-6,2)}
  return}
 if(g==='▓'){
  ctx.fillStyle='#9a9a90';ctx.fillRect(px,py,T,T);ctx.fillStyle='#85857c';ctx.fillRect(px,py+7,T,1);ctx.fillRect(px,py+15,T,1);const off=(y&1)?4:12;ctx.fillRect(px+off,py,1,8);ctx.fillRect(px+((off+8)%16),py+8,1,8);
  if(h%7===0){ctx.fillStyle='#a9a9a0';ctx.fillRect(px+3,py+2,3,2)}
  return}
 if(g==='≡'){
  ctx.fillStyle='#6b4a2b';ctx.fillRect(px,py,T,T);
  for(let r=0;r<3;r++){const ry=py+2+r*5;ctx.fillStyle='#4a3119';ctx.fillRect(px,ry+2,T,1);for(let i=0;i<4;i++){ctx.fillStyle=((h>>(i+r))&1)?'#e5bd69':'#6aa84a';ctx.fillRect(px+1+i*4,ry-1,2,3)}}
  return}
 if(g==='≈'){base(ctx,'water',x,y,px,py,frame,0);return}
 if(g==='#'){base(ctx,'wall',x,y,px,py,frame,0);return}
 base(ctx,'grass',x,y,px,py,frame,edges||0);
 if(g==='♣')sprite(ctx,'tree',px,py);
 else if(g==='▲')sprite(ctx,'rock',px,py);
}
const plotCache={};
function plotArt(key,built,tier,w,h,doorCol){
 const W=w*T,H=h*T,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d'),R=(col,a,b,cw,ch)=>{x.fillStyle=col;x.fillRect(a,b,cw,ch)};
 if(!built){
  R('#7a6a48',0,0,W,H);for(let k=0;k<W*H/40;k++){const a=(k*37)%W,b=(k*53)%H;R(k%2?'#6b5b3b':'#8a7a56',a,b,2,1)}
  R('#4a3a22',0,0,W,2);R('#4a3a22',0,H-2,W,2);R('#4a3a22',0,0,2,H);R('#4a3a22',W-2,0,2,H);
  for(const [a,b] of [[0,0],[W-4,0],[0,H-4],[W-4,H-4]])R('#9a6c3f',a,b,4,4);
  for(let a=8;a<W-8;a+=8){R('#c9a227',a,1,3,1);R('#c9a227',a,H-2,3,1)}
  R('#6b4a2b',doorCol*T+7,H-T+2,2,12);R('#e0b894',doorCol*T+3,H-T+2,10,5);R('#4a3a22',doorCol*T+5,H-T+4,6,1);
  return c}
 R('#3d6b3a',0,0,W,H);
 if(key==='well'){
  R('#9a9a90',0,0,W,H);R('#85857c',0,H/2,W,1);R('#85857c',W/2,0,1,H);
  x.fillStyle='#6b7075';x.beginPath();x.arc(W/2,H/2,13,0,Math.PI*2);x.fill();x.fillStyle='#3a6f9c';x.beginPath();x.arc(W/2,H/2,9,0,Math.PI*2);x.fill();x.fillStyle='#7fb2d8';x.fillRect(W/2-4,H/2-4,4,1);x.fillRect(W/2+1,H/2+2,4,1);
  R('#6b4a2b',3,H-5,2,5);R('#6b4a2b',W-5,H-5,2,5);R('#9a6c3f',W/2-2,3,4,2);return c}
 if(key==='beacon'){
  R('#9a9a90',0,0,W,H);R('#85857c',0,H-6,W,6);
  R('#6b7075',W/2-14,H-18,28,14);R('#8c968e',W/2-14,H-18,28,3);R('#6b7075',W/2-9,H-34,18,16);R('#8c968e',W/2-9,H-34,18,3);R('#3b4540',W/2-10,H-38,20,4);
  R('#14181a',W/2-3,H-14,6,10);
  R('#e5bd69',W/2-5,H-46,10,10);R('#f3de8f',W/2-3,H-50,6,8);R('#ff9a3a',W/2-2,H-54,4,6);R('#fff2a8',W/2-1,H-48,2,4);
  return c}
 const HALL=['#9a6c3f','#5b6b8c','#c9a227'],look={hut:[HALL[Math.min(2,Math.max(0,tier-1))],'#e5bd69'],garden:['#d9b44a','#6aa84a'],well:['#6b7075','#7fb2d8'],huntingCamp:['#7a5a33','#c9a227'],...Object.fromEntries(Object.entries(HOUSES).map(([k,v])=>[k,v]))},[roof,accent]=look[key]||['#8a5a2b','#e5bd69'];
 const roofH=(h-2)*T,wallY=roofH,wall=key==='mine'?'#6a6f73':key==='barracks'?'#a89a86':'#d8c8a0';
 R(shade(roof,-.1),0,0,W,roofH);
 for(let j=0;j<roofH;j+=4){R(shade(roof,-.28),0,j+3,W,1);for(let i=((j/4)&1)*4;i<W;i+=8)R(shade(roof,-.16),i,j,1,3)}
 R(shade(roof,.28),0,0,W,2);R(shade(roof,-.4),0,roofH-2,W,2);R(shade(roof,-.18),0,0,2,roofH);R(shade(roof,-.18),W-2,0,2,roofH);
 R(wall,0,wallY,W,H-wallY);R(shade(wall,-.2),0,wallY,W,2);R(shade(wall,-.3),0,H-2,W,2);R(shade(wall,-.12),0,0,0,0);
 for(let i=0;i<w;i++){if(i===doorCol)continue;if(Math.abs(i-doorCol)%2===1){R('#3b4540',i*T+3,wallY+5,10,8);R('#7fb2d8',i*T+4,wallY+6,8,6);R('#3b4540',i*T+7,wallY+6,2,6);R('#3b4540',i*T+4,wallY+8,8,1)}}
 const dx=doorCol*T;
 if(key==='mine'){R('#14181a',dx+1,H-T-2,14,T+2);R('#3b4540',dx+1,H-T-2,14,2);R('#6b4a2b',dx+1,H-T,2,T);R('#6b4a2b',dx+13,H-T,2,T)}
 else{R('#3d2a18',dx+2,H-T,12,T-1);R('#8a5a2b',dx+3,H-T+1,10,T-2);R('#6b4a2b',dx+7,H-T+1,2,T-2);R('#e5bd69',dx+10,H-T+8,2,2)}
 R(accent,dx+1,H-T-3,14,3);R('#8c968e',dx+2,H-2,12,2);
 if(key==='market'){for(let i=0;i<W;i+=4)R(i%8?'#ffffff':accent,i,wallY+2,4,3)}
 if(key==='smithy'){R('#444b50',W-12,2,8,roofH-4);R('#2b3330',W-12,2,8,2);R('#ff7a2b',W-10,roofH-8,4,3)}
 if(key==='barracks'){R('#6b4a2b',W/2-1,0,2,roofH-2);R('#df4a3a',W/2+1,1,10,6);R('#ffffff',W/2+3,3,3,2)}
 if(key==='gemHall'){R('#f0a0ff',W/2-5,roofH/2-5,10,10);R('#ffffff',W/2-3,roofH/2-3,3,3);R('#8a5fb0',W/2-1,roofH/2+1,4,4)}
 if(key==='lumberMill'){for(let i=0;i<3;i++)R(i%2?'#d9a066':'#9a6c3f',W-14,H-8-i*4,12,3)}
 if(key==='tannery'){R('#e8c9a0',3,wallY-6,8,10);R('#c0803a',W-12,wallY-6,8,10)}
 if(key==='fishingHut'){R('#9ad0f0',3,wallY-4,12,2);R('#7fb2d8',5,wallY-2,8,2);R('#e0b894',W-10,wallY-6,2,8)}
 if(key==='huntersLodge'){R('#e0b894',W/2-5,roofH-10,10,4);R('#6b4a2b',W/2-6,roofH-12,2,6);R('#6b4a2b',W/2+4,roofH-12,2,6)}
 if(key==='huntingCamp'){R('#8a5a2b',4,H-8,8,3);R('#df4a3a',W-9,wallY-8,5,6)}
 if(key==='garden'){for(let i=2;i<W-2;i+=4)R(i%8?'#6aa84a':'#e5bd69',i,wallY-5,2,3)}
 if(key==='hut'){
  R(shade(roof,.15),W/2-9,2,18,5);
  if(tier>=2){R('#cfd6dc',4,4,3,roofH-8);R('#df4a3a',7,4,7,5)}
  if(tier>=3){R('#e5bd69',0,roofH-4,W,2);R('#cfd6dc',W-8,4,3,roofH-8);R('#3a6f9c',W-5,4,7,5);R('#f3de8f',W/2-2,0,4,4)}
  R('#ffffff',W/2-6,wallY+4,12,2)}
 return c}
function townPlot(ctx,key,built,rx,ry,w,h,isDoor,px,py,tier,doorCol){
 const id=key+'|'+(built?1:0)+'|'+tier+'|'+w+'x'+h;let art=plotCache[id];if(!art)art=plotCache[id]=plotArt(key,built,tier,w,h,doorCol);
 ctx.drawImage(art,rx*T,ry*T,T,T,px,py,T,T)}
const OV={'.':'#34603a','≈':'#2e5f86','♣':'#255a2c','▲':'#8c968e','%':'#b5483a','#':'#2b3330','?':'#c4a0dc','g':'#df4a3a','x':'#d9822b','C':'#8fc4b2','D':'#e58b72','K':'#ff5a4a','M':'#9a6c3f','⌂':'#e5bd69','S':'#e5bd69',c:'#d9822b',i:'#5a7fa8',s:'#ffffff',a:'#f3d44a','◆':'#c46bf0','<':'#e5bd69','>':'#e5bd69'};
return {T,townTile,townPlot,setSkin,workerKey,skinActive:()=>skinOn,base,sprite,shadow,bar,tint,portrait,icon,SPRITE_OF,overview:c=>OV[c]||'#34603a'};
})();
