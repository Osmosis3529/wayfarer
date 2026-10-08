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
const ENEMY_LOOK={'Briar Wolf':['beast','#8c968e','#4a524d','#f3de8f'],'Thornback Boar':['beast','#7a4f2b','#4a2f19','#f3de8f'],'Roadside Bandit':['humanoid','#6b4a2b','#3a2a1a','#ffffff'],'Thorn Stalker':['beast','#2f6b3a','#17381e','#f3de8f'],'Dire Wolf':['beast','#4a524d','#1c2220','#ff4a3a'],'Moss Troll':['brute','#4f8f3c','#2f5d34','#f3de8f'],'Tunnel Rat':['beast','#b89870','#6b5638','#ff6a5a'],'Kobold Delver':['humanoid','#b5483a','#7d2a24','#f3de8f'],'Cave Spider':['crawler','#3b3f45','#14181a','#ff4a3a'],'Crystal Guardian':['crystal','#7fb2d8','#3a6f9c','#ffffff'],'Deep Horror':['horror','#5a3a7a','#2b1a3d','#ff6ad0'],'Buried Wyrm':['horror','#8a5a2b','#4a2f19','#ffd23a'],'Restless Skeleton':['undead','#d8dcd0','#5b6660','#ff4a3a'],'Grave Cultist':['humanoid','#5a2a6a','#2b1236','#ff8a3a'],'Barrow Ghoul':['undead','#8fb39a','#3a5a46','#ffe36a'],'Hollow Wraith':['undead','#9fb7d8','#4a5a78','#ffffff'],'Crypt Ogre':['brute','#8a6a4a','#4a3a2a','#f3de8f'],'Forgotten Warden':['brute','#6a6f73','#2b3330','#ff4a3a'],'Hollowfang, the Pale Alpha':['beast','#d8dcd0','#7a8480','#ff4a3a'],'Brannoch, the Iron Warden':['brute','#8c968e','#3b4540','#e5bd69'],'Gorrak, the Delver King':['humanoid','#d9822b','#7a4a14','#ffffff'],'Ilvara, the Crystal Wyrm':['crystal','#e0508a','#7a2a4a','#ffffff'],'Old Mossback':['brute','#4f8f3c','#2f5d34','#e5bd69'],'The Hollow King':['king','#c9c2a8','#4a4538','#ff4a3a']};
const ICONS={
 wood:{p:['........','..nnnn..','.nNNNNn.','nNnyynNn','nNnyynNn','.nNNNNn.','..nnnn..','........']},
 stone:{p:['........','...AA...','..AAWA..','.AAAAaA.','.AaAAaaA','AaaAaKaa','aKaaaKKa','.KKKKKK.']},
 berries:{p:P.berry},
 relic:{p:['..yyyy..','.yYYYYy.','yYyyyyYy','yYyYYyYy','yYyYYyYy','yYyyyyYy','.yYYYYy.','..yyyy..']},
 copper:{p:['........','........','..XXXXX.','.XYYYYXX','XXXXXXX.','XxxxxxX.','........','........'],o:{X:'#d9822b',Y:'#f0a860',x:'#8a4a14'}},
 iron:{p:['........','........','..XXXXX.','.XYYYYXX','XXXXXXX.','XxxxxxX.','........','........'],o:{X:'#8a95a5',Y:'#c0c8d2',x:'#4a5360'}},
 silver:{p:['........','........','..XXXXX.','.XYYYYXX','XXXXXXX.','XxxxxxX.','........','........'],o:{X:'#cfd6dc',Y:'#ffffff',x:'#8c968e'}},
 gold:{p:['........','........','..XXXXX.','.XYYYYXX','XXXXXXX.','XxxxxxX.','........','........'],o:{X:'#e5bd69',Y:'#fff2a8',x:'#9a7a2b'}},
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
const SKIN_TILES={tree:['rpg',13,9],tree_spent:['rpg',22,10],rock:['rpg',54,21],rock_spent:['rpg',56,22],berry:['rpg',24,9],berry_spent:['rpg',19,9],chest:['rpg',37,9],enemy:['chars',0,3],player:['chars',0,7],worker:['chars',0,5],soldier:['chars',0,11],
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
const OV={'.':'#34603a','≈':'#2e5f86','♣':'#255a2c','▲':'#8c968e','%':'#b5483a','#':'#2b3330','?':'#c4a0dc','g':'#df4a3a','x':'#d9822b','C':'#8fc4b2','D':'#e58b72','K':'#ff5a4a','M':'#9a6c3f','⌂':'#e5bd69','S':'#e5bd69',c:'#d9822b',i:'#5a7fa8',s:'#ffffff',a:'#f3d44a','◆':'#c46bf0','<':'#e5bd69','>':'#e5bd69'};
return {T,setSkin,workerKey,skinActive:()=>skinOn,base,sprite,shadow,bar,tint,portrait,icon,SPRITE_OF,overview:c=>OV[c]||'#34603a'};
})();
