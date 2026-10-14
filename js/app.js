
'use strict';
const S=112,DIR=[[1,0],[-1,0],[0,1],[0,-1]];
const SHAPES={I:[[0,0],[1,0],[2,0],[3,0]],O:[[0,0],[1,0],[0,1],[1,1]],T:[[0,0],[1,0],[2,0],[1,1]],L:[[0,0],[0,1],[0,2],[1,2]],J:[[1,0],[1,1],[1,2],[0,2]],S:[[1,0],[2,0],[0,1],[1,1]],Z:[[0,0],[1,0],[1,1],[2,1]]};
const $=id=>document.getElementById(id);
const canvas=$('board'),ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
const BOARD_PAD_X=42,BOARD_PAD_Y=28;
let themeCatalog=null;
let campaignCatalog=new Map(),activeCampaignId=null,activeAssetsBase='';
const tileImages={},tokenImages={};
function cacheImage(url,onload){const im=new Image();im.onload=onload;im.onerror=()=>console.warn('Chybí obrázek:',url);im.src=url;return im;}
function loadThemeAssets(){
 for(const key of Object.keys(tileImages))delete tileImages[key];
 for(const key of Object.keys(tokenImages))delete tokenImages[key];
 const redraw=()=>{drawBoard();if(pieces.length)drawSmallTile('currentTile',selected===null?null:pieces[selected],0);};
 for(const theme of Object.values(themeCatalog.themes))for(const base of Object.values(theme.tiles)){
  if(!tileImages[base])tileImages[base]=cacheImage(`${activeAssetsBase}tiles/${base}.webp`,redraw);
 }
 for(const group of Object.values(themeCatalog.tokens))for(const base of Object.values(group)){
  if(!tokenImages[base])tokenImages[base]=cacheImage(`${activeAssetsBase}tokens/${base}.webp`,redraw);
 }
}
function boardW(){return BW*S}
function boardH(){return BH*S}
function pxX(x){return BOARD_PAD_X+x*S}
function pxY(y){return BOARD_PAD_Y+y*S}
function boardRect(){return {x:BOARD_PAD_X,y:BOARD_PAD_Y,w:boardW(),h:boardH()}}
function themeName(){return themeCatalog?.themes[currentLevel?.theme]?currentLevel.theme:'dungeon'}
function tileTextureName(cell,connected=false){
 const tiles=themeCatalog?.themes[themeName()]?.tiles;
 if(!tiles)return null;
 if(!cell)return tiles.default;
 if(cell.type==='rock')return tiles.barrier;
 return connected?tiles.path:tiles.corridor;
}
function paintTile(c,cell,x,y,size,connected=false){
 const name=tileTextureName(cell,connected),im=tileImages[name];
 if(im?.complete&&im.naturalWidth){c.drawImage(im,x,y,size,size);return;}
 c.fillStyle=!cell?'#203041':cell.type==='rock'?'#526071':connected?'#b9c792':'#e6cf94';c.fillRect(x,y,size,size);
}
function paintToken(c,type,x,y,size,active=true){
 const tokenType=type==='enemy'?'penalty':'reward';
 const icon=currentLevel?.pieces?.[tokenType]?.icon;
 const group=themeCatalog?.tokens[icon]||themeCatalog?.tokens[type==='enemy'?'goblin':'treasure'];
 const name=group?.[active?'active':'available'],im=tokenImages[name];
 const pad=size*.04;
 if(im?.complete&&im.naturalWidth){c.drawImage(im,x+pad,y+pad,size-2*pad,size-2*pad);return;}
 c.fillStyle=type==='enemy'?'#c45560':'#efc65c';c.beginPath();c.arc(x+size/2,y+size/2,size*.31,0,Math.PI*2);c.fill();
}
let animating=false, animationFrame=0, inHand=true, workPos=null, discarded=0, lost=false;
let liveEntry=new Set([1,4,7]),liveExit=new Set([1,4,7]);
let currentLevel=null,poi=[],reserve=0,levelFinished=false,noticedPOI=new Set(),endReason="";let BW=16,BH=10,pieces=[],placements=[],obstacles=new Set(),lairs=new Set(),selected=null,turn=0,hover=null,entry=new Set([1,4,7]),exit=new Set([1,4,7]);
const randint=n=>Math.floor(Math.random()*n);
function integerInput(id,min,max){const n=Number($(id).value);const value=Number.isFinite(n)?Math.max(min,Math.min(max,Math.floor(n))):min;$(id).value=value;return value;}
function pct(id){const x=Number($(id).value);return Number.isFinite(x)?Math.min(100,Math.max(0,x))/100:0;}
function generate(){if(animating)return;
 BW=integerInput('width',8,30);BH=integerInput('height',6,16);
 canvas.width=boardW()+BOARD_PAD_X*2;canvas.height=boardH()+BOARD_PAD_Y*2;canvas.style.setProperty('--board-ratio',`${canvas.width}/${canvas.height}`);if(typeof fitBoardToSpace==='function')requestAnimationFrame(fitBoardToSpace);
 // Nejdříve rozmístíme skály, pak teprve sestavíme balíček dílků.
 placements=[];obstacles.clear();lairs.clear();selected=null;turn=0;hover=null;workPos=null;discarded=0;lost=false;levelFinished=false;inHand=true;noticedPOI.clear();endReason="";
 entry=new Set([...entry].filter(y=>y<BH));exit=new Set([...exit].filter(y=>y<BH));
 if(!entry.size)entry.add(Math.floor((BH-1)/2));
 if(!exit.size)exit.add(Math.floor((BH-1)/2));
 liveEntry=new Set(entry);liveExit=new Set(exit);
 setupPOI();
 applyObstacles(false);
 const keys=Object.keys(SHAPES),p=pct('chance'),mode=$('mode').value;
 const pieceCount=integerInput('pieceCount',1,120);
 pieces=Array.from({length:pieceCount},(_,id)=>{
  const name=keys[randint(keys.length)],base=SHAPES[name],common=Math.random()<p;
  const cells=base.map(([x,y])=>({x,y,type:mode==='whole'?(common?'way':'rock'):(Math.random()<p?'way':'rock')}));
  return {id,name,cells};
 });
 const available=pieces.flatMap(piece=>piece.cells.filter(c=>c.type==='way'));
 const enemies=integerInput('enemy',0,480),treasures=integerInput('gold',0,480);
 // Fisher-Yates: každý průchozí čtverec může obsahovat nejvýše jeden symbol.
 for(let i=available.length-1;i>0;i--){const j=randint(i+1);[available[i],available[j]]=[available[j],available[i]];}
 const actualEnemy=Math.min(enemies,available.length),actualGold=Math.min(treasures,available.length-actualEnemy);
 for(let i=0;i<actualEnemy;i++)available[i].type='enemy';
 for(let i=actualEnemy;i<actualEnemy+actualGold;i++)available[i].type='gold';
 if(actualEnemy<enemies||actualGold<treasures)$('obstacleInfo').textContent+=` Pozor: z ${enemies} nestvůr a ${treasures} pokladů se vešlo jen ${actualEnemy} a ${actualGold}.`;
 selected=pieces.length?0:null;inHand=true;edges();renderAll();
}
function rotated(piece,n){let cells=piece.cells.map(c=>({...c}));for(let k=0;k<n;k++){const h=Math.max(...cells.map(c=>c.y))+1;cells=cells.map(c=>({...c,x:h-1-c.y,y:c.x}));}const mx=Math.min(...cells.map(c=>c.x)),my=Math.min(...cells.map(c=>c.y));return cells.map(c=>({...c,x:c.x-mx,y:c.y-my}));}
function occupancy(){
 const m=new Map();for(const key of obstacles)m.set(key,{type:'rock',fixed:true});for(const key of lairs)m.set(key,{type:'enemy',fixed:true,lair:true});
 for(const o of poi)m.set(`${o.x},${o.y}`,{type:'poi',poi:o,fixed:true});
 for(const pos of placements)for(const c of rotated(pieces[pos.id],pos.rot))m.set(`${pos.x+c.x},${pos.y+c.y}`,c);
 return m;
}
function hasSupport(cells,x,y,m){return cells.some(c=>y+c.y===BH-1||m.has(`${x+c.x},${y+c.y+1}`));}
function landingY(cells,x,y,m){
 if(!canPlace(cells,x,y,m))return null;
 let at=y;
 while(canPlace(cells,x,at+1,m))at++;
 return at;
}
function canPlace(cells,x,y,m){return cells.every(c=>{const xx=x+c.x,yy=y+c.y;return xx>=0&&xx<BW&&yy>=0&&yy<BH&&!m.has(`${xx},${yy}`)&&!(c.type==='rock'&&((xx===0&&liveEntry.has(yy))||(xx===BW-1&&liveExit.has(yy))));});}
const isWay=c=>!!c&&c.type!=='rock';
function analyze(m){const visited=new Set(),q=[];
 for(const y of liveEntry){const k=`0,${y}`;if(isWay(m.get(k))){visited.add(k);q.push([0,y]);}}
 for(let i=0;i<q.length;i++){const [x,y]=q[i];for(const [dx,dy] of DIR){const nx=x+dx,ny=y+dy,key=`${nx},${ny}`;if(nx<0||ny<0||nx>=BW||ny>=BH||visited.has(key)||!isWay(m.get(key)))continue;visited.add(key);q.push([nx,ny]);}}
 let space=0,enemies=0,treasures=0;for(const c of m.values())if(isWay(c))space++;
 for(const [key,c] of m)if(visited.has(key)){if(c.type==='enemy')enemies++;if(c.type==='gold')treasures++;}
 const win=[...liveExit].some(y=>visited.has(`${BW-1},${y}`));const points=poi.reduce((total,o)=>total+(visited.has(`${o.x},${o.y}`)?o.score.found:o.score.missed),0);const mandatory=poi.every(o=>o.mode!=='required'||visited.has(`${o.x},${o.y}`));const forbidden=poi.find(o=>o.mode==='forbidden'&&visited.has(`${o.x},${o.y}`));const val=treasures*(currentLevel?.pieces?.reward?.score??1)+enemies*(currentLevel?.pieces?.penalty?.score??-1)+points;return {visited,space,enemies,treasures,win,mandatory,forbidden,poiScore:points,score:val,finalScore:val+(currentLevel?.success?.useCampaignReserve?reserve:0)};
}
function drawCell(c,x,y,size,ghost=false,connected=false){ctx.save();ctx.globalAlpha=ghost?.7:1;paintTile(ctx,c,x,y,size,connected);
 if(c.type==='poi'){const modeColor=c.poi?.mode==='forbidden'?'#d85b62':c.poi?.mode==='required'?'#f0c96b':'#66d7a7';ctx.lineWidth=3;ctx.strokeStyle=modeColor;ctx.fillStyle='rgba(10,18,28,.35)';ctx.beginPath();ctx.arc(x+size/2,y+size/2,size*.30,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#eef7f7';ctx.font=`bold ${size*.36}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(c.poi?.mode==='forbidden'?'✕':c.poi?.mode==='required'?'!':'◆',x+size/2,y+size/2+1);}
 if(c.type==='enemy'||c.type==='gold'){paintToken(ctx,c.type,x,y,size,connected);}
 ctx.strokeStyle='rgba(11,22,32,.55)';ctx.lineWidth=1.1;ctx.strokeRect(x+.7,y+.7,size-1.4,size-1.4);ctx.restore();}
function drawBoard(falling=null){
 const m=occupancy(),a=analyze(m),r=boardRect();
 ctx.clearRect(0,0,canvas.width,canvas.height);
 ctx.fillStyle='#21303b';ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.fillStyle='#1a2730';ctx.fillRect(r.x-6,r.y-6,r.w+12,r.h+12);
 for(let y=0;y<BH;y++)for(let x=0;x<BW;x++)paintTile(ctx,null,pxX(x),pxY(y),S,false);
 for(const [key,c] of m){const [x,y]=key.split(',').map(Number);const connected=a.visited.has(key);drawCell(c,pxX(x),pxY(y),S,false,connected);}
 if(inHand&&(workPos||hover||falling)&&selected!==null){
  const cells=rotated(pieces[selected],turn),p=falling||workPos||hover;
  const valid=canPlace(cells,p.x,p.y,m),supported=valid&&hasSupport(cells,p.x,p.y,m);
  for(const c of cells){const x=pxX(p.x+c.x),y=pxY(p.y+c.y);
   if(x<r.x||y<r.y||x>=r.x+r.w||y>=r.y+r.h)continue;
   drawCell(c,x,y,S,true,false);
   ctx.strokeStyle=!valid?'#f25762':supported?'#6bb59b':'#647682';
   ctx.lineWidth=!valid?3.3:1.6;
   ctx.strokeRect(x+1.5,y+1.5,S-3,S-3);
  }
 }
 for(const y of liveEntry){const cy=pxY(y)+S/2;ctx.fillStyle='#21343c';ctx.fillRect(2,cy-14,16,28);ctx.strokeStyle='#62dec0';ctx.lineWidth=2;ctx.strokeRect(2.5,cy-13.5,15,27);ctx.fillStyle='#48f0c1';ctx.font='bold 17px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('▶',10,cy+1)}
 for(const y of liveExit){const cy=pxY(y)+S/2;ctx.fillStyle='#21343c';ctx.fillRect(canvas.width-18,cy-14,16,28);ctx.strokeStyle='#f0cc79';ctx.lineWidth=2;ctx.strokeRect(canvas.width-17.5,cy-13.5,15,27);ctx.fillStyle='#f0cc79';ctx.font='bold 17px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('◀',canvas.width-10,cy+1)}
 ctx.strokeStyle='rgba(6,18,29,.35)';ctx.lineWidth=.65;for(let yy=0;yy<BH;yy++)for(let xx=0;xx<BW;xx++)ctx.strokeRect(pxX(xx)+.5,pxY(yy)+.5,S-1,S-1);
 if(a.win){ctx.textAlign='center';ctx.font='bold 17px system-ui';ctx.fillStyle='#91f6d6';ctx.fillText('PROPOJENO ✓',canvas.width/2,18)}
}
function drawSmallTile(id,piece,orientation=0){
 const cv=$(id),c=cv.getContext('2d');
 if(id==='currentTile' && cv.clientWidth && cv.clientHeight){
  const w=Math.round(cv.clientWidth*2),h=Math.round(cv.clientHeight*2);
  if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h;}
 }c.clearRect(0,0,cv.width,cv.height);
 if(!piece)return;
 let cells=rotated(piece,orientation);
 if(id==='currentTile'){
   // Na odkládacím stole dílek vždy leží naležato; v mapě to rotaci nemění.
   let best=null;
   for(let r=0;r<4;r++){
     const cs=rotated(piece,r),w=Math.max(...cs.map(a=>a.x))+1,h=Math.max(...cs.map(a=>a.y))+1;
     const value=h*100-w;
     if(best===null||value<best.value)best={cs,value};
   }
   cells=best.cs;
 }
 const cols=Math.max(...cells.map(a=>a.x))+1,rows=Math.max(...cells.map(a=>a.y))+1;
 const s=Math.floor(id==='currentTile'?Math.min((cv.width-6)/5,(cv.height-6)/Math.max(2,rows)):Math.min((cv.width-8)/cols,(cv.height-8)/rows));
 const w=cols*s,h=rows*s;
 const ox=(cv.width-w)/2,oy=(cv.height-h)/2;
 for(const q of cells){let x=ox+q.x*s,y=oy+q.y*s;
  paintTile(c,q,x,y,s,false);
  if(q.type==='enemy'||q.type==='gold'){paintToken(c,q.type,x,y,s,true);}
  c.strokeStyle='#152332';c.lineWidth=1;c.strokeRect(x+.5,y+.5,s-1,s-1);
 }
}
function renderPalette(){
 const palette=$('palette');palette.replaceChildren();
 $('pieceNow').textContent=selected===null?'Všechny dílky vyřešeny':`Aktuální ${selected+1}/${pieces.length} · ${inHand?'v ruce':'na stole'}`;
 drawSmallTile('currentTile',selected===null?null:pieces[selected],0);
 drawSmallTile('nextTile',selected===null||selected+1>=pieces.length?null:pieces[selected+1]);
 $('takeLabel').textContent='';
 $('nextLabel').textContent=selected===null||selected+1>=pieces.length?'Žádný další':`Dílek ${selected+2}`;
 $('takePiece').disabled=selected===null;
 $('putBack').disabled=selected===null||!inHand;
 for(const p of pieces){const used=placements.some(x=>x.id===p.id),b=document.createElement('button');b.className='piece'+(used?' placed':'')+(selected===p.id?' selected':'');b.disabled=used||p.id!==selected;b.title=`Dílek ${p.id+1} · ${p.name}`;
 const cv=document.createElement('canvas');cv.width=72;cv.height=60;const c=cv.getContext('2d'),cc=p.cells,s=13,ox=(72-(Math.max(...cc.map(q=>q.x))+1)*s)/2,oy=(60-(Math.max(...cc.map(q=>q.y))+1)*s)/2;
 for(const q of cc){const x=ox+q.x*s,y=oy+q.y*s;paintTile(c,q,x,y,s,false);if(q.type==='enemy'||q.type==='gold'){paintToken(c,q.type,x,y,s,true)}c.strokeStyle='#112233';c.strokeRect(x+.5,y+.5,s-1,s-1)}b.append(cv);const cap=document.createElement('span');cap.textContent=`${String(p.id+1).padStart(2,'0')} · ${p.name}`;b.append(cap);b.onclick=()=>takePiece();palette.append(b)}
}
function metrics(){updateCapacity();const a=analyze(occupancy());const done=selected===null||lost;
 $('count').textContent=`${placements.length} položeno · ${discarded} odhozeno / ${pieces.length}`;$('taken').textContent=`${placements.length*4+obstacles.size+lairs.size}/${BW*BH} (z toho ${obstacles.size} skal, ${lairs.size} líhní)`;
 $('passable').textContent=a.space;$('access').textContent=`${a.visited.size} (${a.space?Math.round(100*a.visited.size/a.space):0} %)`;
 $('enemies').textContent=a.enemies;$('treasures').textContent=a.treasures;$('won').textContent=a.win?'ANO ✓':'ne';
 $('score').textContent=`${a.finalScore>0?'+':''}${a.finalScore}`;
 const success=!a.forbidden&&a.win&&a.mandatory&&a.finalScore>=(currentLevel?.success?.minimumScore??0);const result=lost?(endReason||'PROHRA · úroveň vzdána nebo nelze odhodit'):done?(success?`ÚSPĚCH · skóre ${a.finalScore}`:!a.win?'PROHRA · chybí cesta':!a.mandatory?'PROHRA · chybí povinné místo':`PROHRA · minimum ${currentLevel?.success?.minimumScore??0}`):'probíhá';
 $('result').textContent=result;$('result').style.color=done?(success?'#7ad6bf':'#e98481'):'#d1dfe6';
 $('undo').disabled=true;$('rotL').disabled=selected===null||!inHand;$('rotR').disabled=selected===null||!inHand;
 $('note').textContent=done?'Všechny dílky jsou položeny. '+result:selected===null?'Vygeneruj podzemí.':`Dílek ${selected+1} (${pieces[selected].name}) ${inHand?'je v ruce – umísti ho na podepřené místo.':'čeká na stole – klikni na něj.'}`;
}
function renderAll(){renderPalette();drawBoard();metrics();refreshUI();if((selected===null||lost)&&!levelFinished){levelFinished=true;const a=analyze(occupancy());const ok=!lost&&!a.forbidden&&a.win&&a.mandatory&&a.finalScore>=(currentLevel?.success?.minimumScore??0);$('finishTitle').textContent=ok?'✓ Úroveň splněna':'✕ Úroveň nesplněna';$('finishText').textContent=$('result').textContent+` · Dosažené body ${a.finalScore}.`+(endReason&&endReason.includes('POI')?' '+endReason:'');$('finishPanel').hidden=false;onLevelEnd(ok,a);}}
function rotate(n){if(selected===null||!inHand)return;turn=(turn+n+4)%4;drawBoard();metrics();refreshUI();}
function coord(e){const b=canvas.getBoundingClientRect();const px=(e.clientX-b.left)*canvas.width/b.width-BOARD_PAD_X;const py=(e.clientY-b.top)*canvas.height/b.height-BOARD_PAD_Y;return {x:Math.floor(px/S),y:Math.floor(py/S)};}
function takePiece(){if(selected===null||inHand)return;inHand=true;hover=null;workPos=null;renderAll();}
function putBack(){if(!inHand)return;inHand=false;hover=null;workPos=null;renderAll();}
function shakeBad(){canvas.classList.remove('shake');void canvas.offsetWidth;canvas.classList.add('shake');}
// Aktuální dílek je aktivní vždy; tap touchpadu používáme pouze k otočení.
$('putBack').onclick=putBack;
canvas.addEventListener('contextmenu',e=>{e.preventDefault();rotate(1)});
$('generate').onclick=()=>{if(placements.length&&!confirm('Vygenerovat nové podzemí? Současná hra se vymaže.'))return;generate()};
$('clear').onclick=()=>{if(animating)return;if(placements.length&&!confirm('Vyčistit plochu?'))return;placements=[];selected=pieces.length?0:null;turn=0;inHand=true;hover=null;workPos=null;discarded=0;lost=false;renderAll()};
$('undo').onclick=()=>{if(animating||!placements.length)return;const p=placements.pop();selected=p.id;turn=p.rot;inHand=true;hover=null;renderAll()};
$('rotL').onclick=()=>rotate(-1);$('rotR').onclick=()=>rotate(1);
function edges(){renderPortInputs(BH)}
function renderPortInputs(rowCount){for(const [id,set] of [['entries',entry],['exits',exit]]){const box=$(id);box.replaceChildren();for(let y=0;y<rowCount;y++){const label=document.createElement('label');label.style.cssText='display:inline-flex;flex-direction:column;align-items:center;font-size:10px;gap:0';label.textContent=y+1;const check=document.createElement('input');check.type='checkbox';check.checked=set.has(y);check.setAttribute('aria-label',`${id==='entries'?'Vstup':'Výstup'} řádek ${y+1}`);check.addEventListener('change',()=>{if(check.checked)set.add(y);else if(set.size>1)set.delete(y);else check.checked=true});label.append(check);box.append(label)}}}
function setPorts(kind){const h=Math.max(6,Math.min(16,Number($('height').value)||BH)),mid=Math.floor((h-1)/2),rows=kind===1?[mid]:kind===3?[Math.max(0,mid-1),mid,Math.min(h-1,mid+1)]:[1,4,7].filter(y=>y<h);entry=new Set(rows);exit=new Set(rows);renderPortInputs(h);}
$('single').onclick=()=>setPorts(1);$('triple').onclick=()=>setPorts(3);$('spread').onclick=()=>setPorts(4);
function setBoardSize(w,h){$('width').value=w;$('height').value=h;const newH=integerInput('height',6,16);integerInput('width',8,30);entry=new Set([1,4,7].filter(y=>y<newH));exit=new Set([1,4,7].filter(y=>y<newH));renderPortInputs(newH);updateCapacity();}
$('preset12').onclick=()=>setBoardSize(12,10);$('preset16').onclick=()=>setBoardSize(16,10);$('preset20').onclick=()=>setBoardSize(20,10);
$('width').addEventListener('change',()=>setBoardSize($('width').value,$('height').value));
$('height').addEventListener('change',()=>setBoardSize($('width').value,$('height').value));
function clearPathExists(blocked){
 const q=[],seen=new Set();
 for(const y of liveEntry){const k=`0,${y}`;if(!blocked.has(k)){seen.add(k);q.push([0,y]);}}
 for(let i=0;i<q.length;i++){
  const [x,y]=q[i];if(x===BW-1&&liveExit.has(y))return true;
  for(const [dx,dy] of DIR){const nx=x+dx,ny=y+dy,k=`${nx},${ny}`;
   if(nx<0||ny<0||nx>=BW||ny>=BH||seen.has(k)||blocked.has(k))continue;
   seen.add(k);q.push([nx,ny]);
  }
 }
 return false;
}
function validRock(x,y,fixed,occupied){
 const key=`${x},${y}`;if(occupied.has(key)||x===0||y===0||x===BW-1||y===BH-1||poi.some(p=>p.x===x&&p.y===y))return false;
 for(const row of liveEntry)if(x===0&&Math.abs(row-y)<=1||x===1&&row===y)return false;
 for(const row of liveExit)if(x===BW-1&&Math.abs(row-y)<=1||x===BW-2&&row===y)return false;
 for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(fixed.has(`${x+dx},${y+dy}`))return false;
 return true;
}
function applyObstacles(redraw=true){
 if(animating)return;
 const requestedRocks=integerInput('obstacleCount',0,BW*BH),requestedLairs=integerInput('lairCount',0,BW*BH);
 const occupied=new Set(poi.map(o=>`${o.x},${o.y}`));for(const pos of placements)for(const c of rotated(pieces[pos.id],pos.rot))occupied.add(`${pos.x+c.x},${pos.y+c.y}`);
 const candidates=[];for(let y=1;y<BH-1;y++)for(let x=1;x<BW-1;x++)if(!occupied.has(`${x},${y}`))candidates.push([x,y]);
 const manualRocks=new Set((currentLevel?.fixedObjects?.rocks?.positions||[]).map(p=>`${p.x},${p.y}`));
 const manualLairs=new Set((currentLevel?.fixedObjects?.lairs?.positions||[]).map(p=>`${p.x},${p.y}`));
 for(const k of manualRocks)occupied.add(k);for(const k of manualLairs)occupied.add(k);
 let bestRocks=new Set(),bestLairs=new Set(),bestTotal=-1;
 // Oba druhy mají společná pravidla rozestupů. Střídáme jejich pořadí,
 // aby jedna kategorie trvale nezabírala všechny dobré pozice.
 for(let round=0;round<40;round++){
  const order=candidates.slice();for(let i=order.length-1;i>0;i--){const j=randint(i+1);[order[i],order[j]]=[order[j],order[i]];}
  const fixed=new Set([...manualRocks,...manualLairs]),rocks=new Set(manualRocks),rooms=new Set(manualLairs);
  const categories=Array.from({length:requestedRocks},()=> 'rock').concat(Array.from({length:requestedLairs},()=> 'lair'));
  for(let i=categories.length-1;i>0;i--){const j=randint(i+1);[categories[i],categories[j]]=[categories[j],categories[i]];}
  let idx=0;
  for(const kind of categories){
   let placed=false;
   for(let check=0;check<order.length;check++){
    const [x,y]=order[(idx+check)%order.length];if(!validRock(x,y,fixed,occupied))continue;
    const key=`${x},${y}`;fixed.add(key);
    // Pevné líhně jsou průchozí; skály nesmějí odříznout všechny možné cesty.
    if(kind==='rock'&&!clearPathExists(rocksWith(rocks,key))){fixed.delete(key);continue;}
    if(kind==='rock')rocks.add(key);else rooms.add(key);
    idx=(idx+check+1)%order.length;placed=true;break;
   }
   if(!placed)continue;
  }
  const total=rocks.size+rooms.size;
  if(total>bestTotal||(total===bestTotal&&Math.min(rocks.size,requestedRocks)+Math.min(rooms.size,requestedLairs)>Math.min(bestRocks.size,requestedRocks)+Math.min(bestLairs.size,requestedLairs))){bestTotal=total;bestRocks=rocks;bestLairs=rooms;}
  if(rocks.size===requestedRocks&&rooms.size===requestedLairs)break;
 }
 obstacles=bestRocks;lairs=bestLairs;hover=null;
 const info=$('obstacleInfo');
 info.textContent=`Rozmístěno ${obstacles.size}/${requestedRocks} skal a ${lairs.size}/${requestedLairs} líhní. Pevné prvky nepřerušují všechny možné cesty.`;
 if(redraw)renderAll();
}
function rocksWith(rocks,key){const next=new Set(rocks);next.add(key);return next;}

function updateCapacity(){
 const width=Math.max(8,Math.min(30,Number($('width').value)||16)),height=Math.max(6,Math.min(16,Number($('height').value)||10));
 const total=width*height,fixed=Math.max(0,Math.min(total,(Number($('obstacleCount').value)||0)+(Number($('lairCount').value)||0)));
 const target=Math.max(10,Math.min(95,Number($('fillPercent').value)||75));
 const recommended=Math.max(1,Math.floor((total*target/100-fixed)/4));
 $('capacityInfo').textContent=`Odhad: ${recommended} dílků pro ${target}% obsazení při ${fixed} pevných objektech. Skutečný počet může být nižší.`;
 return recommended;
}
for(const id of ['width','height','fillPercent','obstacleCount','lairCount'])$(id).addEventListener('input',updateCapacity);
$('useRecommended').onclick=()=>{$('pieceCount').value=updateCapacity();};
document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;const k=e.key.toLowerCase();if(k==='q')rotate(-1);if(k==='r')rotate(1);if(e.key==='Escape')putBack()});

const $confirm=$('confirmMove'),$discard=$('discard'),$settings=$('settingsPanel');
const history=[];
function remember(){history.push({placements:placements.slice(),selected,turn,discarded,lost,extraEnemies:new Set(extraEnemies)});if(history.length>120)history.shift();}
let extraEnemies=new Set();
function stateOfWork(){
 if(!inHand||selected===null||!workPos)return 'none';
 const c=rotated(pieces[selected],turn),m=occupancy();
 if(!canPlace(c,workPos.x,workPos.y,m))return 'invalid';
 if(!hasSupport(c,workPos.x,workPos.y,m))return 'floating';
 return 'valid';
}
function refreshUI(){
 const status=stateOfWork();$confirm.disabled=status!=='valid'||lost;
 $('statusText').textContent=(selected===null||lost)?$('result').textContent:status==='valid'?'Lze položit · potvrď ✓':status==='invalid'?'Kolize nebo mimo pole':status==='floating'?'Chybí opora':inHand?'Posouvej dílek po pravém touchpadu':'Klepni na aktuální dílek';
 $('mobileRound').textContent=`${selected===null?pieces.length:selected+1} / ${pieces.length}`;
 const a=analyze(occupancy());$('poiCount').textContent=`${poi.filter(o=>a.visited.has(`${o.x},${o.y}`)).length}/${poi.length}`;
 $('mobileScore').textContent=Math.abs(a.finalScore);$('mobileScore').style.color=a.finalScore<0?'#f16f6f':'#e9ce82';
 $('discard').disabled=selected===null||lost||currentLevel?.discard?.mode==='disabled';$('mobileDiscard').disabled=$('discard').disabled;
 $('confirmMove').style.opacity=$confirm.disabled?'.4':'1';
 $('takePiece').classList.toggle('activeCard',false);
}
function commit(){if(stateOfWork()!=='valid')return;
 remember();placements.push({id:selected,x:workPos.x,y:workPos.y,rot:turn});
 selected=selected+1<pieces.length?selected+1:null;
 inHand=selected!==null;hover=null;workPos=null;turn=0;
 const state=analyze(occupancy());const newPOI=poi.filter(o=>state.visited.has(`${o.x},${o.y}`)&&!noticedPOI.has(o.id));
 newPOI.forEach(o=>noticedPOI.add(o.id));
 if(state.forbidden){lost=true;inHand=false;endReason=`PROHRA · zakázaný POI: ${state.forbidden.name}`;}
 renderAll();if(newPOI.length)showPOIEvents(newPOI);
}
$confirm.addEventListener('click',commit);
$('mobileDiscard').addEventListener('click',()=>discardCard());
/* Vrácení tahu zůstává pouze v interní historii pro ladění. */
function hiddenUndo(){
 const p=history.pop();if(!p)return;
 placements=p.placements;selected=p.selected;turn=p.turn;discarded=p.discarded;lost=p.lost;extraEnemies=p.extraEnemies;
 inHand=selected!==null;hover=null;workPos=null;renderAll();
}
// Goblini se přidávají natrvalo na dosud prázdná dosažitelná průchozí políčka.
const oldOccupancy=occupancy;
occupancy=function(){const m=oldOccupancy();for(const key of extraEnemies){const c=m.get(key);if(c&&c.type==='way')m.set(key,{...c,type:'enemy',spawned:true})}return m;};
function discardCard(){if(selected===null||lost)return;
 const mode=currentLevel?.discard?.mode??'penalty';if(mode==='disabled')return;const amount=mode==='free'?0:1+pieces[selected].cells.filter(c=>c.type==='enemy').length;
 const m=occupancy(),a=analyze(m),candidates=[...a.visited].filter(k=>m.get(k)?.type==='way');
 if(!confirm(amount?`Odhodit dílek? Do propojených prostorů přibude ${amount} postihových objektů.`:'Odhodit dílek bez dalšího postihu?'))return;
 remember();
 if(candidates.length<amount){lost=true;inHand=false;workPos=null;renderAll();$('statusText').textContent=`Nedostatek volných prostorů: ${amount} goblinů, ${candidates.length} míst. Prohra.`;return;}
 for(let i=candidates.length-1;i>0;i--){const j=randint(i+1);[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
 for(let i=0;i<amount;i++)extraEnemies.add(candidates[i]);
 discarded++;$settings.hidden=true;selected=selected+1<pieces.length?selected+1:null;
 inHand=selected!==null;workPos=null;hover=null;turn=0;renderAll();
}
$discard.addEventListener('click',discardCard);


$('finishRestart').onclick=()=>{if(inCampaign){$('finishPanel').hidden=true;chooseLevel(currentLevel.id)}else{generate();$('finishPanel').hidden=true}};$('finishClose').onclick=()=>{if(inCampaign){handleContinue()}else{$('finishPanel').hidden=true;showWorld()}};
$('surrender').addEventListener('click',()=>{if(!lost&&!levelFinished&&confirm('Vzdát úroveň? Tento pokus bude neúspěšný.')){lost=true;inHand=false;workPos=null;$settings.hidden=true;renderAll();}});
$('settingsBtn').addEventListener('click',()=>{$settings.hidden=false});
$('closeSettings').addEventListener('click',()=>{$settings.hidden=true});
$('generate').addEventListener('click',()=>{$settings.hidden=true;history.length=0;extraEnemies=new Set();});
let dragging=false,dragMoved=false,startX=0,startY=0,dragOrigin=null,dragPointer=null,firstPlacement=false;
function pointerCoord(e){const r=canvas.getBoundingClientRect();const px=(e.clientX-r.left)*canvas.width/r.width-BOARD_PAD_X;const py=(e.clientY-r.top)*canvas.height/r.height-BOARD_PAD_Y;return {x:Math.floor(px/S),y:Math.floor(py/S)};}
function positionPiece(e){
 const p=pointerCoord(e);if(selected===null)return;
 workPos=p;hover=p;drawBoard();refreshUI();
}
function relativeMove(e){
 if(!dragOrigin||!dragPointer)return;
 const r=canvas.getBoundingClientRect();
 // Posun je relativní vůči bodu dotyku, nikoli absolutní poloha prstu.
 // Zaokrouhlení zabraňuje poskakování dílku mezi dvěma sousedními poli.
 const dx=Math.round((e.clientX-dragPointer.x)*BW/r.width);
 const dy=Math.round((e.clientY-dragPointer.y)*BH/r.height);
 workPos={x:dragOrigin.x+dx,y:dragOrigin.y+dy};hover=workPos;
 drawBoard();refreshUI();
}
const mouseInput=e=>e.pointerType==='mouse';
canvas.addEventListener('pointerdown',e=>{
 if(e.button!==0||selected===null||lost)return;
 if(!inHand)inHand=true;
 dragging=true;dragMoved=false;startX=e.clientX;startY=e.clientY;
 firstPlacement=!workPos||mouseInput(e);
 dragOrigin=workPos?{...workPos}:null;
 dragPointer={x:e.clientX,y:e.clientY};
 canvas.setPointerCapture(e.pointerId);
 // Myš zůstává jako v původním desktopovém prototypu.
 // Dotyk při již existujícím náhledu dílek nepřemístí.
 if(firstPlacement)positionPiece(e);
});
canvas.addEventListener('pointermove',e=>{
 if(selected===null||lost)return;
 if(dragging){
  if(Math.hypot(e.clientX-startX,e.clientY-startY)>5)dragMoved=true;
  if(mouseInput(e)||firstPlacement)positionPiece(e);else relativeMove(e);
 }else if(mouseInput(e)&&inHand){positionPiece(e)}
});
canvas.addEventListener('pointerup',e=>{
 if(!dragging)return;
 dragging=false;
 if(mouseInput(e)){
  positionPiece(e);
  if(stateOfWork()==='valid')commit();
 }else if(firstPlacement){
  positionPiece(e);
 }else{
  // Krátké klepnutí na mapu při existujícím dílku nic neposouvá.
  relativeMove(e);
 }
 dragOrigin=null;dragPointer=null;refreshUI();
});
canvas.addEventListener('pointercancel',()=>{dragging=false;dragOrigin=null;dragPointer=null;refreshUI()});
canvas.addEventListener('pointerleave',e=>{if(!dragging&&mouseInput(e)){workPos=null;hover=null;drawBoard();refreshUI()}});
let prevTapPos=null;
// Pravá oblast se zásobou současně slouží jako dotykový touchpad.
// Pohyb je relativní; prst nikdy nezakrývá umisťovaný dílek v mapě.
const pad=$('takePiece');
let padPointer=null,padStart=null,padOrigin=null,padMoved=false;
function ensureWorkingPosition(){
 if(workPos||selected===null)return;
 const cells=rotated(pieces[selected],turn);
 const maxX=Math.max(...cells.map(c=>c.x)),maxY=Math.max(...cells.map(c=>c.y));
 // Umístění přibližně do středu mapy, ne nutně platné: lze dál posunovat.
 workPos={x:Math.floor((BW-maxX-1)/2),y:Math.floor((BH-maxY-1)/2)};
 hover=workPos;
}
pad.addEventListener('pointerdown',e=>{
 if(selected===null||lost||e.button!==0)return;
 e.preventDefault();
 ensureWorkingPosition();
 padPointer=e.pointerId;padStart={x:e.clientX,y:e.clientY};padOrigin={...workPos};padMoved=false;
 pad.setPointerCapture(e.pointerId);drawBoard();refreshUI();
});
pad.addEventListener('pointermove',e=>{
 if(e.pointerId!==padPointer||!padStart||!padOrigin)return;
 e.preventDefault();
 if(Math.hypot(e.clientX-padStart.x,e.clientY-padStart.y)>9)padMoved=true;
 if(!padMoved)return;
 const r=canvas.getBoundingClientRect();
 const cellX=(r.width*boardW()/canvas.width)/BW,cellY=(r.height*boardH()/canvas.height)/BH;
 const dx=Math.round((e.clientX-padStart.x)/cellX);
 const dy=Math.round((e.clientY-padStart.y)/cellY);
 workPos={x:padOrigin.x+dx,y:padOrigin.y+dy};hover=workPos;
 drawBoard();refreshUI();
});
function padEnd(e){if(e.pointerId!==padPointer)return;const tap=!padMoved&&e.type==='pointerup';padPointer=null;padStart=null;padOrigin=null;padMoved=false;if(tap)rotate(1);}
pad.addEventListener('pointerup',padEnd);pad.addEventListener('pointercancel',padEnd);



const detail=$('detailPanel');let eventQueue=[];
function signed(n){return (n>0?'+':'')+n;}
function detailOpen(title,html,callback){$('detailTitle').textContent=title;$('detailBody').innerHTML=html;detail.hidden=false;$('detailClose').onclick=()=>{detail.hidden=true;if(callback)callback();};}
function safeText(t){return String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function poiInfo(o){const a=analyze(occupancy()),found=a.visited.has(`${o.x},${o.y}`);const modes={required:'Povinný — musíš propojit',optional:'Nepovinný',forbidden:'Zakázaný — propojení znamená okamžitou prohru'};
 return `<p><b>${safeText(o.name)}</b> · ${modes[o.mode]}</p><p>Aktuální stav: <b>${found?'Dosažený':'Nedosažený'}</b></p><div class="poiLine"><span>Za dosažení</span><b class="${found?'good':'muted'}">${signed(o.score.found)} ${found?'●':''}</b></div><div class="poiLine"><span>Za nedosažení</span><b class="${!found?'bad':'muted'}">${signed(o.score.missed)} ${!found?'●':''}</b></div>`;}
function showPOIEvents(items){eventQueue.push(...items);nextPOIEvent();}
function nextPOIEvent(){if(!eventQueue.length)return;const o=eventQueue.shift();const content=o.onFound||{};detailOpen(content.title||`Objeveno: ${o.name}`,`<p>${safeText(content.text||'Propojil jsi bod zájmu.')}</p>`+poiInfo(o),nextPOIEvent);}
$('poiSummary').addEventListener('click',()=>{const a=analyze(occupancy());const modeLabel={required:'musí',optional:'může',forbidden:'nesmí'};const stateIcon=(o)=>a.visited.has(`${o.x},${o.y}`)?'●':'○';const rows=poi.length?`<table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr><th style="text-align:left;padding:6px 4px">Název</th><th style="padding:6px 4px">Stav</th><th style="padding:6px 4px">Bonus</th><th style="padding:6px 4px">Postih</th></tr></thead><tbody>${poi.map(o=>{const found=a.visited.has(`${o.x},${o.y}`);return `<tr><td style="padding:7px 4px;border-top:1px solid #465c69">${safeText(o.name)}<br><span class="muted">${modeLabel[o.mode]}</span></td><td style="text-align:center;padding:7px 4px;border-top:1px solid #465c69">${stateIcon(o)}</td><td style="text-align:center;padding:7px 4px;border-top:1px solid #465c69"><span class="${found?'good':'muted'}">${signed(o.score.found)}</span></td><td style="text-align:center;padding:7px 4px;border-top:1px solid #465c69"><span class="${!found?'bad':'muted'}">${signed(o.score.missed)}</span></td></tr>`;}).join('')}</tbody></table>`:'<p>V této úrovni nejsou žádné body zájmu.</p>';detailOpen('Body zájmu',rows);});
$('scoreSummary').addEventListener('click',()=>{const a=analyze(occupancy()),r=a.treasures*(currentLevel?.pieces?.reward?.score??1),p=a.enemies*(currentLevel?.pieces?.penalty?.score??-1);const poiRows=poi.map(o=>{const found=a.visited.has(`${o.x},${o.y}`);return `<div class="poiLine"><span>${safeText(o.name)} (${found?'dosažen':'nedosažen'})</span><b>${signed(found?o.score.found:o.score.missed)}</b></div>`;}).join('');detailOpen('Rozpis skóre',`<div class="poiLine"><span>${safeText(currentLevel?.pieces?.reward?.name||'Odměny')} (${a.treasures}×)</span><b>${signed(r)}</b></div><div class="poiLine"><span>${safeText(currentLevel?.pieces?.penalty?.name||'Postihy')} (${a.enemies}×)</span><b>${signed(p)}</b></div>${poiRows}<div class="poiLine"><b>Skóre úrovně</b><b>${signed(a.score)}</b></div>${currentLevel?.success?.useCampaignReserve?`<div class="poiLine"><span>Zásoba kampaně</span><b>${signed(reserve)}</b></div>`:''}<div class="poiLine"><b>Aktuální výsledek</b><b>${signed(a.finalScore)}</b></div><p class="muted">Požadované minimum: ${currentLevel?.success?.minimumScore??0}</p>`);});

// Datově definované úrovně – lze upravit soubor levels.json bez úprav herního jádra.
let levelCatalog=[];
function validateLevel(d){
 const errors=[];
 if(!d||!d.id||!d.name)errors.push('Chybí ID nebo název');
 if(!Number.isInteger(d.board?.width)||d.board.width<8||d.board.width>30||!Number.isInteger(d.board?.height)||d.board.height<6||d.board.height>16)errors.push('Rozměry mapy mimo rozsah 8–30 × 6–16');
 if(!['penalty','free','disabled'].includes(d.discard?.mode))errors.push('Neznámý režim odhazování');
 if(!Array.isArray(d.exits)||!d.exits.length||d.exits.some(e=>e.position<0||e.position>=d.board.height||e.side!=='right'))errors.push('Neplatné výstupy');
 if(d.start?.side!=='left'||d.start?.position<0||d.start?.position>=d.board.height)errors.push('Neplatný start');
 for(const obj of [d.pieces?.reward,d.pieces?.penalty])if(!obj||!Number.isFinite(obj.score)||!Number.isInteger(obj.count)||obj.count<0)errors.push('Chybný bodový objekt');
 const occupied=new Set();
 for(const o of [...(d.fixedObjects?.rocks?.positions||[]),...(d.fixedObjects?.lairs?.positions||[]),...(d.fixedObjects?.pointsOfInterest||[]).filter(p=>p.placement?.type==='fixed').map(p=>p.placement)]){
  if(!Number.isInteger(o.x)||!Number.isInteger(o.y)||o.x<0||o.y<0||o.x>=d.board.width||o.y>=d.board.height)errors.push('Pevný objekt mimo mapu');if(o.x===0&&o.y===d.start.position||o.x===d.board.width-1&&d.exits.some(e=>e.position===o.y))errors.push('Pevný objekt překrývá vstup/výstup');
  const key=o.x+','+o.y;if(occupied.has(key))errors.push('Kolize pevných objektů '+key);occupied.add(key);
 }
 for(const o of d.fixedObjects?.pointsOfInterest||[])if(!Number.isFinite(o.score?.found)||!Number.isFinite(o.score?.missed)||!['required','optional','forbidden'].includes(o.mode))errors.push('POI: chybný mode nebo found/missed');
 return [...new Set(errors)];
}
function chooseLevel(id){
 const d=levelCatalog.find(x=>x.id===id);if(!d)return;
 const errors=validateLevel(d);if(errors.length){alert('Chyby definice '+id+':\n'+errors.join('\n'));return;}
 if(activeCampaignId!==d._campaignId){
  const campaign=campaignCatalog.get(d._campaignId);
  if(!campaign)throw new Error('Nenalezena kampaň: '+d._campaignId);
  activeCampaignId=d._campaignId;
  activeAssetsBase=campaign.assetsBase;
  themeCatalog={themes:campaign.themes,tokens:campaign.tokens};
  loadThemeAssets();
 }
 currentLevel=d;$('finishPanel').hidden=true;
 $('width').value=d.board.width;$('height').value=d.board.height;
 $('pieceCount').value=d.pieces.count;$('chance').value=d.pieces.passablePercent;
 $('gold').value=d.pieces.reward.count;$('enemy').value=d.pieces.penalty.count;
 $('obstacleCount').value=d.fixedObjects?.rocks?.randomCount||0;$('lairCount').value=d.fixedObjects?.lairs?.randomCount||0;
 entry=new Set([d.start.position]);exit=new Set(d.exits.map(e=>e.position));renderPortInputs(d.board.height);
 $('levelDescription').textContent=`${d.name} — ${d.description||''} · minimum ${d.success?.minimumScore??0} · koš: ${d.discard.mode}`;
 $('scoreSummary').title='Rozpis skóre';$('poiSummary').title='Body zájmu';
 $('levelSelect').value=id;generate();if(inCampaign)showLevelIntro(d);
}
function setupPOI(){
 poi=[];const defs=currentLevel?.fixedObjects?.pointsOfInterest||[];
 const blocked=new Set([...(currentLevel?.fixedObjects?.rocks?.positions||[]).map(p=>`${p.x},${p.y}`),...(currentLevel?.fixedObjects?.lairs?.positions||[]).map(p=>`${p.x},${p.y}`)]);const futureFixed=new Set(defs.filter(o=>o.placement?.type==='fixed').map(o=>`${o.placement.x},${o.placement.y}`));
 for(const spec of defs){
  let x,y;
  if(spec.placement?.type==='fixed'){({x,y}=spec.placement)}else{
   const cells=[];for(let yy=1;yy<BH-1;yy++)for(let xx=1;xx<BW-1;xx++)if(!blocked.has(`${xx},${yy}`)&&!futureFixed.has(`${xx},${yy}`))cells.push({x:xx,y:yy});
   if(!cells.length)continue;({x,y}=cells[randint(cells.length)]);
  }
  if(blocked.has(`${x},${y}`))continue;
  poi.push({...spec,x,y});blocked.add(`${x},${y}`);
 }
}
async function loadJSON(url){
 const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`${url}: HTTP ${r.status}`);return r.json();
}
function showLoadError(e){console.error('Nepodařilo se načíst data hry:',e);$('statusText').textContent='Chyba dat hry';
 detailOpen('Chyba načítání',`<p>${safeText(e.message)}</p><p>Zkontroluj world.json, příslušný campaign.json a odkazy na jednotlivé úrovně. Spouštěj přes RUN nebo webový server.</p>`);
}
async function loadCatalog(){
 try{
  const world=await loadJSON('world.json');window.worldLocations=world.locations;
  if(!Array.isArray(world.campaigns)||!world.campaigns.length)throw Error('world.json neobsahuje kampaně');
  const collected=[];campaignCatalog.clear();
  for(const ref of world.campaigns){
   if(!ref.file||!/^campaigns\/[a-zA-Z0-9_-]+\/campaign\.json$/.test(ref.file))throw Error('Chybné umístění kampaně: '+ref.file);
   const campaign=await loadJSON(ref.file);
   if(!campaign.id||!campaign.themes||!campaign.tokens||!Array.isArray(campaign.levels)||!campaign.levels.length)throw Error('Neúplná definice kampaně '+ref.file);
   if(campaign.id!==ref.id)throw Error('Neshodné ID kampaně: '+ref.file);
   if(campaignCatalog.has(campaign.id))throw Error('Duplicitní ID kampaně: '+campaign.id);
   const base=ref.file.slice(0,ref.file.lastIndexOf('/')+1);
   campaignCatalog.set(campaign.id,{...campaign,assetsBase:base+'assets/'});
   for(const levelRef of campaign.levels){
    if(!/^levels\/[a-zA-Z0-9_-]+\.json$/.test(levelRef.file))throw Error('Neplatný odkaz na úroveň: '+levelRef.file);
    const level=await loadJSON(base+levelRef.file);
    if(level.id!==levelRef.id)throw Error('ID úrovně se neshoduje se záznamem v kampani: '+levelRef.file);
    if(collected.some(existing=>existing.id===level.id))throw Error('Duplicitní ID úrovně: '+level.id);
    collected.push({...level,_campaignId:campaign.id,_campaignName:campaign.name});
   }
  }
  levelCatalog=collected;
  const sel=$('levelSelect');sel.replaceChildren();
  for(const lvl of levelCatalog){const opt=document.createElement('option');opt.value=lvl.id;opt.textContent=`${lvl._campaignName} / ${lvl.name}`;sel.append(opt)}
  initWorld();
 }catch(e){showLoadError(e)}
}
$('loadLevel').onclick=()=>{if(placements.length&&!confirm('Načíst novou úroveň a zahodit současný pokus?'))return;chooseLevel($('levelSelect').value);$settings.hidden=true};

const originalGenerate=generate;
generate=function(){extraEnemies=new Set();discarded=0;lost=false;history.length=0;originalGenerate();};
window.addEventListener('resize',()=>{fitBoardToSpace();drawSmallTile('currentTile',selected===null?null:pieces[selected],0);drawBoard();});
setPorts(4);entry=new Set([Math.floor((Number($('height').value)-1)/2)]);renderPortInputs(Number($('height').value));updateCapacity();loadCatalog();

// Responsive canvas: scale the entire grid to the available playfield area,
// rather than keeping its internal bitmap dimensions as CSS pixels.
function fitBoardToSpace(){
 const box=document.getElementById('boardBox');
 const availableW=box.clientWidth,availableH=box.clientHeight;
 if(availableW<1||availableH<1)return;
 const scale=Math.min(availableW/canvas.width,availableH/canvas.height);
 canvas.style.width=Math.floor(scale*canvas.width)+'px';
 canvas.style.height=Math.floor(scale*canvas.height)+'px';
}
const boardSizer=new ResizeObserver(()=>fitBoardToSpace());
boardSizer.observe(document.getElementById('boardBox'));
fitBoardToSpace();


// ---- Svět a průběh kampaně ----
let inCampaign=false,activeRun=null,pendingEnd=null,selectedOffer=null,selectedLocation='village';
const progressKey='mercenary-tales-progress-v1';
function readProgress(){try{return JSON.parse(localStorage.getItem(progressKey))||{crowns:0,completed:{}}}catch{return {crowns:0,completed:{}}}}
function saveProgress(data){localStorage.setItem(progressKey,JSON.stringify(data))}
function showWorld(){inCampaign=false;activeRun=null;pendingEnd=null;$('finishPanel').hidden=true;$('settingsPanel').hidden=true;$('game').hidden=true;$('worldScreen').hidden=false;$('offerOverlay').hidden=true;renderWorld()}
function initWorld(){showWorld()}
function renderWorld(){const progress=readProgress();$('crownTotal').textContent=progress.crowns||0;const locations=window.worldLocations||[{id:'village',name:'Vesnice'},{id:'town',name:'Město'},{id:'castle',name:'Hrad'}];
 $('worldLocations').innerHTML='';for(const l of locations){const b=document.createElement('button');b.textContent=l.name;b.className=l.id===selectedLocation?'active':'';b.onclick=()=>{selectedLocation=l.id;renderWorld()};$('worldLocations').append(b)}
 $('worldOffers').innerHTML='';const entries=[...campaignCatalog.values()].filter(c=>(c.category||'village')===selectedLocation);
 if(!entries.length){$('worldOffers').innerHTML='<p>Prozatím zde nejsou dostupné zakázky.</p>';return}
 for(const c of entries){const count=c.levels.length,done=progress.completed?.[c.id]||0;const b=document.createElement('button');b.className='offerCard';b.innerHTML=`<h3>${safeText(c.name)} ${done?'✓':''}</h3><small>${'★'.repeat(Math.max(1,Math.min(5,c.difficulty||1)))}${'☆'.repeat(5-Math.max(1,Math.min(5,c.difficulty||1)))} · ${count} úrovně · ${c.reward?.crowns||0} 👑</small><p>${safeText(c.description||'')}</p>`;b.onclick=()=>openOffer(c);$('worldOffers').append(b)}
}
function openOffer(c){selectedOffer=c;$('offerTitle').textContent=c.name;$('offerDescription').textContent=c.description||'';const done=(readProgress().completed||{})[c.id]||0;$('offerInfo').textContent=`Úrovně: ${c.levels.length} · Obtížnost: ${'★'.repeat(c.difficulty||1)}${'☆'.repeat(5-(c.difficulty||1))} · Odměna: ${done?Math.floor((c.reward?.crowns||0)/2):(c.reward?.crowns||0)} 👑${done?' (opakování, poloviční odměna)':''}`;$('offerOverlay').hidden=false}
$('offerCancel').onclick=()=>{$('offerOverlay').hidden=true};$('offerAccept').onclick=()=>{if(!selectedOffer)return;const c=selectedOffer;$('offerOverlay').hidden=true;inCampaign=true;activeRun={campaignId:c.id,levelId:c.startLevel||c.levels[0].id,visited:0};reserve=0;$('worldScreen').hidden=true;$('game').hidden=false;detailOpen(c.intro?.title||c.name,`<p>${safeText(c.intro?.text||c.description||'')}</p>`,()=>{chooseLevel(activeRun.levelId)})};
function showLevelIntro(d){if(!d.intro)return;detailOpen(d.intro.title||d.name,`<p>${safeText(d.intro.text||d.description||'')}</p><p class="muted">Minimum: ${d.success?.minimumScore??0} · ${d.fixedObjects?.pointsOfInterest?.filter(o=>o.mode==='required').length||0} povinných míst</p>`)}
function findFinal(c,id,score){return (c.finals||[]).find(f=>f.id===id&&(f.minScore===undefined||score>=f.minScore))||{title:'Konec zakázky',text:'Dobrodružství je u konce.'}}
function resolveTarget(target){if(!target)return {final:'fail'};if(target.level)return target;if(target.final)return target;return {final:'fail'}}
function onLevelEnd(ok,a){if(!inCampaign||!activeRun)return;const level=currentLevel;if(ok&&level.success?.useCampaignReserve)reserve=a.finalScore;
 const reached=level.exits.filter(e=>a.visited.has(`${BW-1},${e.position}`));
 let target;
 if(ok){if(reached.length>1){pendingEnd={kind:'select',exits:reached,score:a.finalScore};$('finishText').textContent+=' · Vyber další cestu.';return}target=resolveTarget(reached[0]?.next)}
 else target=resolveTarget(a.forbidden?.failTarget||level.failTarget);
 pendingEnd={kind:'target',target,score:a.finalScore};
}
function handleContinue(){if(!inCampaign||!pendingEnd){$('finishPanel').hidden=true;showWorld();return}
 $('finishPanel').hidden=true;const p=pendingEnd;pendingEnd=null;
 if(p.kind==='select'){const list=p.exits.map((e,i)=>`<button data-exit="${i}">${safeText(e.name||e.id||'Východ '+(i+1))}</button>`).join(' ');detailOpen('Vyber cestu',`<p>Kterým dosaženým východem chceš pokračovat?</p><div class="storyActions">${list}</div>`);$('detailBody').querySelectorAll('[data-exit]').forEach(b=>b.onclick=()=>{const e=p.exits[Number(b.dataset.exit)];$('detailPanel').hidden=true;goTarget(resolveTarget(e.next),p.score)});return}
 goTarget(p.target,p.score);
}
function goTarget(target,score){if(target.level){const found=levelCatalog.find(x=>x.id===target.level&&x._campaignId===activeRun.campaignId);if(!found){detailOpen('Chyba návaznosti','<p>Navazující úroveň neexistuje.</p>',showWorld);return}activeRun.levelId=target.level;activeRun.visited++;if(activeRun.visited>30){detailOpen('Příliš mnoho přechodů','<p>Výprava se opakovaně vrací mezi úrovněmi.</p>',showWorld);return}chooseLevel(target.level);return}
 const c=campaignCatalog.get(activeRun.campaignId);const id=target.final||'fail';const f=findFinal(c,id,score);const success=!!f.success||(!/^fail/i.test(id)&&id!=='failFlee');let award=0;
 if(success){const progress=readProgress();const seen=progress.completed[c.id]||0;award=seen?Math.floor((c.reward?.crowns||0)/2):(c.reward?.crowns||0);progress.crowns=(progress.crowns||0)+award;progress.completed[c.id]=seen+1;saveProgress(progress)}
 detailOpen(f.title||'Konec kampaně',`<p>${safeText(f.text||'')}</p><p>${success?`Získáváš ${award} 👑.`:'Tentokrát bez odměny.'}</p>`,showWorld);
}
