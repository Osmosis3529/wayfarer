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
const ENEMY_LOOK={'Briar Wolf':['beast','#8c968e','#4a524d','#f3de8f'],'Thornback Boar':['beast','#7a4f2b','#4a2f19','#f3de8f'],'Roadside Bandit':['humanoid','#6b4a2b','#3a2a1a','#ffffff'],'Thorn Stalker':['beast','#2f6b3a','#17381e','#f3de8f'],'Dire Wolf':['beast','#4a524d','#1c2220','#ff4a3a'],'Moss Troll':['brute','#4f8f3c','#2f5d34','#f3de8f'],'Tunnel Rat':['beast','#b89870','#6b5638','#ff6a5a'],'Kobold Delver':['humanoid','#b5483a','#7d2a24','#f3de8f'],'Cave Spider':['crawler','#3b3f45','#14181a','#ff4a3a'],'Crystal Guardian':['crystal','#7fb2d8','#3a6f9c','#ffffff'],'Deep Horror':['horror','#5a3a7a','#2b1a3d','#ff6ad0'],'Buried Wyrm':['horror','#8a5a2b','#4a2f19','#ffd23a'],'Restless Skeleton':['undead','#d8dcd0','#5b6660','#ff4a3a'],'Grave Cultist':['humanoid','#5a2a6a','#2b1236','#ff8a3a'],'Barrow Ghoul':['undead','#8fb39a','#3a5a46','#ffe36a'],'Hollow Wraith':['undead','#9fb7d8','#4a5a78','#ffffff'],'Crypt Ogre':['brute','#8a6a4a','#4a3a2a','#f3de8f'],'Forgotten Warden':['brute','#6a6f73','#2b3330','#ff4a3a'],'The Hollow King':['king','#c9c2a8','#4a4538','#ff4a3a']};
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
 sunstone:{p:['..yyyy..','.yYYYYy.','yYYWWYYy','yYWWWWYy','yYWWWWYy','yYYWWYYy','.yYYYYy.','..yyyy..']}
};
const iconCache={};
function icon(key){if(!ICONS[key])return '';if(!iconCache[key]){const s=build(ICONS[key].p,ICONS[key].o),c=document.createElement('canvas');c.width=c.height=24;const x=c.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(s,0,0,24,24);iconCache[key]=c.toDataURL()}return iconCache[key]}
const cache={};
const portraits={};
function build(pat,over){const c=document.createElement('canvas');c.width=c.height=T;const x=c.getContext('2d');pat.forEach((row,j)=>{for(let i=0;i<8;i++){const ch=row[i];if(ch==='.')continue;const col=(over&&over[ch])||PAL[ch];if(!col)continue;x.fillStyle=col;x.fillRect(i*2,j*2,2,2)}});return c}
for(const [k,pat] of Object.entries(P))if(!['house','ore'].includes(k))cache[k]=build(pat);
for(const [k,[roof,em]] of Object.entries(HOUSES))cache['b_'+k]=build(P.house,{X:roof,E:em});
for(const [g,col] of Object.entries(ORES))cache['ore_'+g]=build(P.ore,{X:col});
function enemySprite(name){const look=ENEMY_LOOK[name]||['beast','#8c968e','#4a524d','#ff4a3a'];return build(ENEMY_ART[look[0]],{X:look[1],x:look[2],E:look[3]})}
function portrait(name){if(!portraits[name]){const s=enemySprite(name),c=document.createElement('canvas');c.width=c.height=96;const x=c.getContext('2d');x.imageSmoothingEnabled=false;x.fillStyle='#111a14';x.fillRect(0,0,96,96);x.drawImage(s,8,8,80,80);portraits[name]=c.toDataURL()}return portraits[name]}
cache.tree_spent=build(P.treeSpent);cache.rock_spent=build(P.rockSpent);cache.berry_spent=build(P.berry,{r:'#4f8f3c'});cache.ore_spent=build(P.ore,{X:'#3b4540'});
cache.b_garden=cache.farm;cache.b_well=cache.well;cache.b_huntingCamp=cache.camp;cache.b_beacon=cache.beacon;
const SPRITE_OF={'♣':'tree','▲':'rock','%':'berry','?':'chest','g':'enemy','x':'fox','C':'cave','D':'dungeon','K':'keep','M':'mine','S':'town','⌂':'home','<':'stairL','>':'stairR',c:'ore_c',i:'ore_i',s:'ore_s',a:'ore_a','◆':'ore_◆'};
function hash(x,y){return (Math.imul(x,73856093)^Math.imul(y,19349663))>>>0}
function base(ctx,kind,x,y,px,py,frame,edges){
 const h=hash(x,y);
 if(kind==='water'){ctx.fillStyle='#2e5f86';ctx.fillRect(px,py,T,T);ctx.fillStyle='#4f8db8';const o=((h&3)+frame*2)%T;ctx.fillRect(px+(o%12),py+4+(h>>2&3),4,1);ctx.fillRect(px+((o+7)%12),py+11,3,1);return}
 if(kind==='wall'){ctx.fillStyle='#1c2220';ctx.fillRect(px,py,T,T);ctx.fillStyle='#3b4540';ctx.fillRect(px,py+1,T,6);ctx.fillRect(px,py+9,T,6);ctx.fillStyle='#2b3330';const off=(y&1)*4;ctx.fillRect(px+off+3,py+1,1,6);ctx.fillRect(px+off+11,py+1,1,6);ctx.fillRect(px+(4-off)+3,py+9,1,6);ctx.fillRect(px+(4-off)+11,py+9,1,6);return}
 const floor=kind==='floor';ctx.fillStyle=floor?'#262c29':'#3d6b3a';ctx.fillRect(px,py,T,T);
 for(let k=0;k<3;k++){const sx=(h>>(k*5))&15,sy=(h>>(k*5+3))&15;ctx.fillStyle=k===0?(floor?'#2f3733':'#4a7c44'):(floor?'#1f2522':'#34602f');ctx.fillRect(px+sx,py+sy,1+(k===0?1:0),1)}
 if(edges&&!floor){ctx.fillStyle='#b8a878';if(edges&1)ctx.fillRect(px,py,T,2);if(edges&2)ctx.fillRect(px,py+T-2,T,2);if(edges&4)ctx.fillRect(px,py,2,T);if(edges&8)ctx.fillRect(px+T-2,py,2,T)}
}
function sprite(ctx,key,px,py,alpha,flip){const s=cache[key];if(!s)return;ctx.save();if(alpha!=null&&alpha<1)ctx.globalAlpha=alpha;if(flip){ctx.translate(px+T,py);ctx.scale(-1,1);ctx.drawImage(s,0,0)}else ctx.drawImage(s,px,py);ctx.restore()}
function bar(ctx,px,py,frac){ctx.fillStyle='#14181a';ctx.fillRect(px+1,py,T-2,3);ctx.fillStyle=frac>.5?'#7fbf5a':frac>.25?'#e5bd69':'#df4a3a';ctx.fillRect(px+2,py+1,Math.max(1,Math.round((T-4)*frac)),1)}
function tint(ctx,w,h,a){if(a<=0)return;ctx.fillStyle='rgba(10,20,60,'+a.toFixed(3)+')';ctx.fillRect(0,0,w,h)}
const OV={'.':'#34603a','≈':'#2e5f86','♣':'#255a2c','▲':'#8c968e','%':'#b5483a','#':'#2b3330','?':'#c4a0dc','g':'#df4a3a','x':'#d9822b','C':'#8fc4b2','D':'#e58b72','K':'#ff5a4a','M':'#9a6c3f','⌂':'#e5bd69','S':'#e5bd69',c:'#d9822b',i:'#5a7fa8',s:'#ffffff',a:'#f3d44a','◆':'#c46bf0','<':'#e5bd69','>':'#e5bd69'};
return {T,base,sprite,bar,tint,portrait,icon,SPRITE_OF,overview:c=>OV[c]||'#34603a'};
})();
