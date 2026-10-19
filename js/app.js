
'use strict';
const S=112,DIR=[[1,0],[-1,0],[0,1],[0,-1]];
const SHAPES={I:[[0,0],[1,0],[2,0],[3,0]],O:[[0,0],[1,0],[0,1],[1,1]],T:[[0,0],[1,0],[2,0],[1,1]],L:[[0,0],[0,1],[0,2],[1,2]],J:[[1,0],[1,1],[1,2],[0,2]],S:[[1,0],[2,0],[0,1],[1,1]],Z:[[0,0],[1,0],[1,1],[2,1]]};
const $=id=>document.getElementById(id);
const canvas=$('board'),ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
const BOARD_PAD_X=S,BOARD_PAD_Y=28;
let effects=[],eventLock=false,lastExitKeys=new Set(),effectTimer=null;
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function spriteSpec(base){return typeof base==='string'?{active:base,available:base}:base||{};}
function paintBurst(now=performance.now()){effects=effects.filter(e=>now-e.time<1000);for(const e of effects){const t=Math.min(1,(now-e.time)/950),cx=e.x,cy=e.y;ctx.save();ctx.globalAlpha=1-t;for(let k=0;k<12;k++){const angle=k*Math.PI/6,dist=(.16+.65*t)*S,r=(3+4*(1-t));const x=cx+Math.cos(angle)*dist,y=cy+Math.sin(angle)*dist;ctx.fillStyle=k%2?'#ffffff':'#ffe68b';ctx.beginPath();ctx.moveTo(x,y-r);ctx.lineTo(x+r*.35,y-r*.35);ctx.lineTo(x+r,y);ctx.lineTo(x+r*.35,y+r*.35);ctx.lineTo(x,y+r);ctx.lineTo(x-r*.35,y+r*.35);ctx.lineTo(x-r,y);ctx.lineTo(x-r*.35,y-r*.35);ctx.closePath();ctx.fill();}ctx.restore();}}
function burstAt(x,y){effects.push({x,y,time:performance.now()});function frame(){drawBoard();if(effects.length)requestAnimationFrame(frame);}requestAnimationFrame(frame);}


// Story Editor 0.7: story schema 1.1. Story data remain read-only.
function parseStoryV1(raw,id){
 if(raw.schemaVersion!=='1.1'||raw.id!==id)throw Error(`Story ${id}: očekáváno schemaVersion 1.1`);
 const errors=[],files=new Map((raw.assets?.files||[]).map(f=>[f.id,f.path]));
 const resolveAsset=key=>{if(!key)return null;const path=files.get(key);if(!path){errors.push('Neznámý asset '+key);return null;}return `stories/${id}/${path}`;};
 const fromThemes=(collection,build)=>Object.fromEntries((collection||[]).map(t=>[t.id,build(t)]));
 const tileThemes=fromThemes(raw.assets?.tileThemes,t=>({tiles:Object.fromEntries(Object.entries(t.images||{}).map(([k,v])=>[k,resolveAsset(v)]))}));
 const tokenThemes=fromThemes(raw.assets?.tokenThemes,t=>({reward:{available:resolveAsset(t.images?.['reward.available']),active:resolveAsset(t.images?.['reward.active'])},penalty:{available:resolveAsset(t.images?.['penalty.available']),active:resolveAsset(t.images?.['penalty.active'])}}));
 const doorThemes=fromThemes(raw.assets?.doorThemes,t=>({entrance:{active:resolveAsset(t.images?.['entrance.active'])},exit:{available:resolveAsset(t.images?.['exit.available']),active:resolveAsset(t.images?.['exit.active'])}}));
 const poiThemes={default:Object.fromEntries((raw.assets?.poiItems||[]).map(i=>[i.id,{available:resolveAsset(i.images?.available),active:resolveAsset(i.images?.active)}]))};
 const dialogs=new Map((raw.dialogs||[]).map(d=>[d.id,d]));
 const sceneIds=new Set((raw.scenes||[]).map(x=>x.id));
 const checkTarget=(t,where)=>{if(!t){errors.push(where+': chybí cíl');return;}if(t.type==='scene'&&!sceneIds.has(t.id))errors.push(where+': neznámá scéna '+t.id);else if(t.type==='dialog'&&!dialogs.has(t.id))errors.push(where+': neznámý dialog '+t.id);else if(t.type==='ending'&&!['success','fail'].includes(t.result))errors.push(where+': neznámý výsledek zakončení');else if(!['scene','dialog','ending'].includes(t.type))errors.push(where+': neznámý typ cíle');};
 checkTarget(raw.startTarget,'startTarget');for(const d of dialogs.values())checkTarget(d.nextTarget,'dialog '+d.id);
 const scenes=(raw.scenes||[]).map(x=>{
  const oneToZero=n=>Number.isInteger(n)?n-1:n;
  for(const e of x.exits||[])checkTarget(e.target,'dveře '+x.id);
  for(const [key,t] of Object.entries(x.failTargets||{}))if(t)checkTarget(t,'failTargets '+x.id+'.'+key);
  const results=x.results||[];
  for(const r of results){if(r.target)checkTarget(r.target,'výsledek '+x.id);if(!['success','fail'].includes(r.result)||r.min!=null&&!Number.isFinite(r.min)||r.max!=null&&!Number.isFinite(r.max)||r.min!=null&&r.max!=null&&r.min>r.max)errors.push('Neplatný interval ve scéně '+x.id);}
  for(const result of ['success','fail']){const rr=results.filter(r=>r.result===result);for(let i=0;i<rr.length;i++)for(let j=i+1;j<rr.length;j++)if((rr[i].min??-Infinity)<=(rr[j].max??Infinity)&&(rr[j].min??-Infinity)<=(rr[i].max??Infinity))errors.push('Překrývající se intervaly '+result+' ve scéně '+x.id);}
  const pois=(x.pointsOfInterest||[]).map(o=>({...o,icon:o.themeItemId,score:{found:o.score?.found??0,missed:o.score?.missed??0},placement:{...o.placement,type:o.placement?.mode,x:oneToZero(o.placement?.x),y:oneToZero(o.placement?.y)},onFound:o.foundText?{title:o.name,text:o.foundText}:null}));
  const z={...x,start:{side:'left',position:oneToZero(x.entrance?.position)},exits:(x.exits||[]).map(e=>({...e,position:oneToZero(e.position),side:'right',next:e.target,name:e.label})),tileTheme:x.themes?.tile,tokenTheme:x.themes?.token,doorTheme:x.themes?.door,poiTheme:'default',fixedObjects:{rocks:{positions:(x.obstacles?.fixed||[]).map(o=>({x:oneToZero(o.x),y:oneToZero(o.y)})),randomCount:x.obstacles?.randomCount||0},lairs:{positions:[],randomCount:0},pointsOfInterest:pois},success:{...x.success,useCampaignReserve:x.success?.useReserve},intro:x.introText?{title:x.name,text:x.introText}:null,failTarget:x.failTargets?.base||{type:'ending',result:'fail'},failureTargets:{forbiddenPoi:x.failTargets?.forbidden,requiredPoi:x.failTargets?.required}};
  return z;
 });
 if(!scenes.length)errors.push('Nejsou definované žádné scény');
 if(!Array.isArray(raw.endings?.success)||!Array.isArray(raw.endings?.fail))errors.push('Zakončení vyžaduje endings.success a endings.fail');
 if(errors.length)throw Error(`Příběh ${id}: `+errors.join(' | '));
 return {...raw,category:null,tileThemes,tokenThemes,doorThemes,poiThemes,scenes,dialogsMap:dialogs,assetsBase:'',_raw:raw};
}

let themeCatalog=null;
let campaignCatalog=new Map(),activeCampaignId=null,activeAssetsBase='',activeStory=null;
const doorImages={},poiImages={};
const tileImages={},tokenImages={};
function cacheImage(url,onload){const im=new Image();im.onload=onload;im.onerror=()=>console.warn('Chybí obrázek:',url);im.src=url;return im;}
function loadThemeAssets(){
 for(const group of [tileImages,tokenImages,doorImages,poiImages])for(const key of Object.keys(group))delete group[key];
 const redraw=()=>{drawBoard();if(pieces.length)drawSmallTile('currentTile',selected===null?null:pieces[selected],0)};
 for(const theme of Object.values(activeStory.tileThemes||{}))for(const base of Object.values(theme.tiles||{})){
  if(!tileImages[base])tileImages[base]=cacheImage(base,redraw);
 }
 for(const theme of Object.values(activeStory.tokenThemes||{}))for(const role of ['reward','penalty'])for(const state of ['active','available']){
  const base=theme[role]?.[state];if(base&&!tokenImages[base])tokenImages[base]=cacheImage(base,redraw);
 }
 for(const theme of Object.values(activeStory.doorThemes||{}))for(const role of ['entrance','exit']){
  const spec=spriteSpec(theme[role]);for(const state of ['active','available']){const base=spec[state];if(base&&!doorImages[base])doorImages[base]=cacheImage(base,redraw);}
 }
 for(const theme of Object.values(activeStory.poiThemes||{}))for(const [k,value] of Object.entries(theme)){
  if(k==='temporaryGraphics'||k==='replacementNote'||k==='label')continue;
  const spec=spriteSpec(value);for(const state of ['active','available']){const base=spec[state];if(base&&!poiImages[base])poiImages[base]=cacheImage(base,redraw);}
 }
}
function boardW(){return BW*S}
function boardH(){return BH*S}
function pxX(x){return BOARD_PAD_X+x*S}
function pxY(y){return BOARD_PAD_Y+y*S}
function boardRect(){return {x:BOARD_PAD_X,y:BOARD_PAD_Y,w:boardW(),h:boardH()}}
function themeName(){return currentLevel?.tileTheme||activeStory?.defaults?.tileTheme||Object.keys(activeStory?.tileThemes||{})[0]}
function tileTextureName(cell,connected=false){
 const tiles=activeStory?.tileThemes?.[themeName()]?.tiles;
 if(!tiles)return null;
 if(!cell)return tiles.default;
 if(cell.terrain==='barrier'||cell.type==='rock')return tiles.barrier;
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
 const group=activeStory?.tokenThemes?.[currentLevel?.tokenTheme||activeStory?.defaults?.tokenTheme]?.[tokenType];
 const name=group?.[active?'active':'available'],im=tokenImages[name];
  const scale=1; // Stejné měřítko pro všechny žetony; rozdíly řeší grafika.
 const drawSize=size*scale,offset=(size-drawSize)/2;
 if(im?.complete&&im.naturalWidth){c.drawImage(im,x+offset,y+offset,drawSize,drawSize);return;}
 c.fillStyle=type==='enemy'?'#c45560':'#efc65c';c.beginPath();c.arc(x+size/2,y+size/2,size*.31,0,Math.PI*2);c.fill();
}
let animating=false, animationFrame=0, inHand=false, workPos=null, discarded=0, lost=false;
let liveEntry=new Set([1,4,7]),liveExit=new Set([1,4,7]);
let currentLevel=null,poi=[],reserve=0,discardPoints=0,levelFinished=false,noticedPOI=new Set(),endReason="";let BW=16,BH=10,pieces=[],placements=[],obstacles=new Set(),lairs=new Set(),selected=null,turn=0,hover=null,entry=new Set([1,4,7]),exit=new Set([1,4,7]);
const randint=n=>Math.floor(Math.random()*n);
function integerInput(id,min,max){const n=Number($(id).value);const value=Number.isFinite(n)?Math.max(min,Math.min(max,Math.floor(n))):min;$(id).value=value;return value;}
function pct(id){const x=Number($(id).value);return Number.isFinite(x)?Math.min(100,Math.max(0,x))/100:0;}
function generate(){if(animating)return;
 BW=integerInput('width',8,30);BH=integerInput('height',6,16);
 canvas.width=boardW()+BOARD_PAD_X*2;canvas.height=boardH()+BOARD_PAD_Y*2;canvas.style.setProperty('--board-ratio',`${canvas.width}/${canvas.height}`);if(typeof fitBoardToSpace==='function')requestAnimationFrame(fitBoardToSpace);
 // Nejdříve rozmístíme skály, pak teprve sestavíme balíček dílků.
 placements=[];obstacles.clear();lairs.clear();selected=null;turn=0;hover=null;workPos=null;discarded=0;lost=false;levelFinished=false;inHand=false;noticedPOI.clear();endReason="";
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
  const cells=base.map(([x,y])=>{const terrain=mode==='whole'?(common?'way':'barrier'):(Math.random()<p?'way':'barrier');return {x,y,terrain,type:terrain==='barrier'?'rock':'way',token:null};});
  if(cells.some(c=>c.terrain==='barrier'&&c.token))throw Error('Token nelze umístit na překážku');return {id,name,cells};
 });
 const available=pieces.flatMap(piece=>piece.cells.filter(c=>c.terrain==='way'&&c.type==='way'));
 const enemies=integerInput('enemy',0,480),treasures=integerInput('gold',0,480);
 // Fisher-Yates: každý průchozí čtverec může obsahovat nejvýše jeden symbol.
 for(let i=available.length-1;i>0;i--){const j=randint(i+1);[available[i],available[j]]=[available[j],available[i]];}
 const actualEnemy=Math.min(enemies,available.length),actualGold=Math.min(treasures,available.length-actualEnemy);
 for(let i=0;i<actualEnemy;i++)available[i].token='enemy';
 for(let i=actualEnemy;i<actualEnemy+actualGold;i++)available[i].token='gold';
 if(actualEnemy<enemies||actualGold<treasures)$('obstacleInfo').textContent+=` Pozor: z ${enemies} nestvůr a ${treasures} pokladů se vešlo jen ${actualEnemy} a ${actualGold}.`;
 selected=pieces.length?0:null;inHand=false;edges();renderAll();
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
const isWay=c=>!!c&&c.terrain!=='barrier'&&c.type!=='rock';
function analyze(m){const visited=new Set(),q=[];
 for(const y of liveEntry){const k=`0,${y}`;if(isWay(m.get(k))){visited.add(k);q.push([0,y]);}}
 for(let i=0;i<q.length;i++){const [x,y]=q[i];for(const [dx,dy] of DIR){const nx=x+dx,ny=y+dy,key=`${nx},${ny}`;if(nx<0||ny<0||nx>=BW||ny>=BH||visited.has(key)||!isWay(m.get(key)))continue;visited.add(key);q.push([nx,ny]);}}
 let space=0,enemies=0,treasures=0;for(const c of m.values())if(isWay(c))space++;
 for(const [key,c] of m)if(visited.has(key)){if(c.token==='enemy')enemies++;if(c.token==='gold')treasures++;}
 const win=[...liveExit].some(y=>visited.has(`${BW-1},${y}`));const points=poi.reduce((total,o)=>total+(visited.has(`${o.x},${o.y}`)?o.score.found:o.score.missed),0);const mandatory=poi.every(o=>o.mode!=='required'||visited.has(`${o.x},${o.y}`));const forbidden=poi.find(o=>o.mode==='forbidden'&&visited.has(`${o.x},${o.y}`));const val=treasures*(currentLevel?.pieces?.reward?.score??1)+enemies*(currentLevel?.pieces?.penalty?.score??-1)+points+discardPoints;return {visited,space,enemies,treasures,win,mandatory,forbidden,poiScore:points,score:val,finalScore:val+(currentLevel?.success?.useCampaignReserve?reserve:0)};
}
function drawCell(c,x,y,size,ghost=false,connected=false){ctx.save();ctx.globalAlpha=ghost?.7:1;paintTile(ctx,c,x,y,size,connected);
 if(c.type==='poi'){
  const o=c.poi,theme=activeStory?.poiThemes?.default;
  const spec=spriteSpec(theme?.[o?.icon]),name=spec[connected?'active':'available'],im=poiImages[name];
  // Podobu POI dodává výhradně autor: žádný rám ani přebarvení v enginu.
  if(im?.complete&&im.naturalWidth){ctx.drawImage(im,x,y,size,size);}
  else{ctx.save();ctx.fillStyle='rgba(215,185,123,.22)';ctx.fillRect(x+size*.15,y+size*.15,size*.70,size*.70);ctx.restore();}
  if(!connected&&(o.mode==='required'||o.mode==='forbidden')){
   ctx.save();ctx.fillStyle=o.mode==='required'?'#e9bd61':'#e45e5c';ctx.strokeStyle='#1f2525';ctx.lineWidth=Math.max(1,size*.023);
   ctx.beginPath();ctx.arc(x+size*.15,y+size*.16,size*.125,0,Math.PI*2);ctx.fill();ctx.stroke();
   ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${size*.19}px system-ui`;ctx.fillStyle='#172025';ctx.fillText('!',x+size*.15,y+size*.16);ctx.restore();
  }
  const current=Number(connected?o.score?.found:o.score?.missed)||0;
  if((Number(o.score?.found)||0)!==0||(Number(o.score?.missed)||0)!==0){
   ctx.save();ctx.font=`900 ${size*.185}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';
   ctx.lineWidth=Math.max(2,size*.06);ctx.strokeStyle='#162321';ctx.fillStyle=current>0?'#8debb0':current<0?'#ff9292':'#f4e9d1';
   const value=String(current);ctx.strokeText(value,x+size*.83,y+size*.16);ctx.fillText(value,x+size*.83,y+size*.16);ctx.restore();
  }
 }
 if(isWay(c)&&(c.token==='enemy'||c.token==='gold')){paintToken(ctx,c.token,x,y,size,connected);}
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
 const doorTheme=activeStory?.doorThemes?.[currentLevel?.doorTheme||activeStory?.defaults?.doorTheme];
 for(const y of liveEntry){const px=0,py=pxY(y),name=spriteSpec(doorTheme?.entrance).active,im=doorImages[name];if(im?.complete&&im.naturalWidth)ctx.drawImage(im,px,py,S,S);else{ctx.fillStyle='#347965';ctx.fillRect(px+S*.15,py+S*.1,S*.7,S*.8);ctx.fillStyle='#faf1c2';ctx.font=`${S*.48}px system-ui`;ctx.textAlign='center';ctx.fillText('▶',px+S*.5,py+S*.68);}}
 for(const y of liveExit){const px=pxX(BW),py=pxY(y),isActive=a.visited.has(`${BW-1},${y}`),spec=spriteSpec(doorTheme?.exit),name=spec[isActive?'active':'available'],im=doorImages[name];if(im?.complete&&im.naturalWidth)ctx.drawImage(im,px,py,S,S);else{ctx.fillStyle=isActive?'#cba15b':'#49545b';ctx.fillRect(px+S*.15,py+S*.1,S*.7,S*.8);ctx.fillStyle=isActive?'#fff3c9':'#a3aab0';ctx.font=`${S*.48}px system-ui`;ctx.textAlign='center';ctx.fillText('◀',px+S*.5,py+S*.68);}}
 paintBurst();
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
  if(isWay(q)&&(q.token==='enemy'||q.token==='gold')){paintToken(c,q.token,x,y,s,false);}
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
 $('takePiece').classList.toggle('pickedUp',Boolean(inHand));
 $('putBack').disabled=selected===null||!inHand;
 for(const p of pieces){const used=placements.some(x=>x.id===p.id),b=document.createElement('button');b.className='piece'+(used?' placed':'')+(selected===p.id?' selected':'');b.disabled=used||p.id!==selected;b.title=`Dílek ${p.id+1} · ${p.name}`;
 const cv=document.createElement('canvas');cv.width=72;cv.height=60;const c=cv.getContext('2d'),cc=p.cells,s=13,ox=(72-(Math.max(...cc.map(q=>q.x))+1)*s)/2,oy=(60-(Math.max(...cc.map(q=>q.y))+1)*s)/2;
 for(const q of cc){const x=ox+q.x*s,y=oy+q.y*s;paintTile(c,q,x,y,s,false);if(isWay(q)&&(q.token==='enemy'||q.token==='gold')){paintToken(c,q.token,x,y,s,false)}c.strokeStyle='#112233';c.strokeRect(x+.5,y+.5,s-1,s-1)}b.append(cv);const cap=document.createElement('span');cap.textContent=`${String(p.id+1).padStart(2,'0')} · ${p.name}`;b.append(cap);b.onclick=()=>takePiece();palette.append(b)}
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
function renderAll(){renderPalette();drawBoard();metrics();refreshUI();if((selected===null||lost)&&!levelFinished){levelFinished=true;const a=analyze(occupancy());const ok=!lost&&!a.forbidden&&a.win&&a.mandatory&&a.finalScore>=(currentLevel?.success?.minimumScore??0);$('finishTitle').textContent=ok?'✓ Scéna splněna':'✕ Scéna nesplněna';$('finishText').textContent=$('result').textContent+` · Dosažené body ${a.finalScore}.`+(endReason&&endReason.includes('POI')?' '+endReason:'');$('finishPanel').hidden=eventLock;onLevelEnd(ok,a);}}
function rotate(n){if(selected===null||!inHand)return;turn=(turn+n+4)%4;if(workPos){workPos=clampWorkPos(workPos);hover=workPos;}drawBoard();metrics();refreshUI();}
function coord(e){const b=canvas.getBoundingClientRect();const px=(e.clientX-b.left)*canvas.width/b.width-BOARD_PAD_X;const py=(e.clientY-b.top)*canvas.height/b.height-BOARD_PAD_Y;return {x:Math.floor(px/S),y:Math.floor(py/S)};}
function takePiece(){if(selected===null||inHand||eventLock)return;inHand=true;hover=null;workPos=null;renderAll();}
function putBack(){if(!inHand)return;inHand=false;hover=null;workPos=null;renderAll();}
function shakeBad(){canvas.classList.remove('shake');void canvas.offsetWidth;canvas.classList.add('shake');}
// Dílek se bere vědomě z pravého panelu; tap touchpadu otáčí. Na PC Esc vrací dílek.
$('putBack').onclick=putBack;
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&inHand&&$('detailPanel').hidden&&$('settingsPanel').hidden){putBack();}});
canvas.addEventListener('contextmenu',e=>{e.preventDefault();rotate(1)});
$('generate').onclick=()=>{if(placements.length&&!confirm('Vygenerovat nové podzemí? Současná hra se vymaže.'))return;generate()};
$('clear').onclick=()=>{if(animating)return;if(placements.length&&!confirm('Vyčistit plochu?'))return;placements=[];selected=pieces.length?0:null;turn=0;inHand=false;hover=null;workPos=null;discarded=0;lost=false;renderAll()};
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
 if(eventLock||!inHand||selected===null||!workPos)return 'none';
 const c=rotated(pieces[selected],turn),m=occupancy();
 if(!canPlace(c,workPos.x,workPos.y,m))return 'invalid';
 if(!hasSupport(c,workPos.x,workPos.y,m))return 'floating';
 return 'valid';
}
function refreshUI(){
 const status=stateOfWork();$confirm.disabled=eventLock||status!=='valid'||lost;
 $('statusText').textContent=(selected===null||lost)?$('result').textContent:status==='valid'?'Lze položit · klikni na mapu (PC) nebo potvrď ✓ (mobil)':status==='invalid'?'Kolize nebo mimo pole':status==='floating'?'Chybí opora':inHand?'Posouvej dílek po pravém touchpadu':'Vezmi dílek z pravého panelu';
 $('mobileRound').textContent=`${selected===null?pieces.length:selected+1} / ${pieces.length}`;
 const a=analyze(occupancy());$('poiCount').textContent=`${poi.filter(o=>a.visited.has(`${o.x},${o.y}`)).length}/${poi.length}`;
 $('mobileScore').textContent=Math.abs(a.finalScore);$('mobileScore').style.color=a.finalScore<0?'#f16f6f':'#e9ce82';
 $('discard').disabled=selected===null||lost||currentLevel?.discard?.mode==='disabled';$('mobileDiscard').disabled=$('discard').disabled;
 $('confirmMove').style.opacity=$confirm.disabled?'.4':'1';
 $('takePiece').classList.toggle('activeCard',Boolean(inHand));
}
function commit(){if(eventLock||stateOfWork()!=='valid')return;
 remember();placements.push({id:selected,x:workPos.x,y:workPos.y,rot:turn});
 selected=selected+1<pieces.length?selected+1:null;
 inHand=false;hover=null;workPos=null;turn=0;
 const state=analyze(occupancy());const newExits=[...liveExit].filter(y=>state.visited.has(`${BW-1},${y}`)&&!lastExitKeys.has(y));lastExitKeys=new Set([...liveExit].filter(y=>state.visited.has(`${BW-1},${y}`)));const newPOI=poi.filter(o=>state.visited.has(`${o.x},${o.y}`)&&!noticedPOI.has(o.id));
 newPOI.forEach(o=>noticedPOI.add(o.id));
 if(state.forbidden){lost=true;inHand=false;endReason=`PROHRA · zakázaný POI: ${state.forbidden.name}`;}
 renderAll();for(const y of newExits)burstAt(pxX(BW)+S/2,pxY(y)+S/2);if(newPOI.length)showPOIEvents(newPOI);
}
$confirm.addEventListener('click',commit);
$('mobileDiscard').addEventListener('click',()=>discardCard());
/* Vrácení tahu zůstává pouze v interní historii pro ladění. */
function hiddenUndo(){
 const p=history.pop();if(!p)return;
 placements=p.placements;selected=p.selected;turn=p.turn;discarded=p.discarded;lost=p.lost;extraEnemies=p.extraEnemies;
 inHand=false;hover=null;workPos=null;renderAll();
}
// Goblini se přidávají natrvalo na dosud prázdná dosažitelná průchozí políčka.
const oldOccupancy=occupancy;
occupancy=function(){const m=oldOccupancy();for(const key of extraEnemies){const c=m.get(key);if(c&&isWay(c)&&!c.token&&c.type!=='poi')m.set(key,{...c,token:'enemy',spawned:true})}return m;};
function discardCard(){if(selected===null||lost||eventLock)return;
 const mode=currentLevel?.discard?.mode??'penalty';
 if(mode==='disabled'){
  if(confirm('Zahazování je zakázané. Opravdu chceš tímto ukončit scénu neúspěchem?')){lost=true;endReason='Zakázané odhození dílku';inHand=false;renderAll();}return;
 }
 const n=pieces[selected].cells.filter(c=>c.token==='enemy').length;
 const amount=mode==='free'?0:(currentLevel.discard.piecePenalty??-1)+n*(currentLevel.discard.negativeTokenPenalty??-1);
 if(!confirm(mode==='free'?'Odhodit dílek bez postihu?':`Odhodit dílek? Bodový postih ${amount}.`))return;
 remember();discardPoints+=amount;discarded++;selected=selected+1<pieces.length?selected+1:null;
 inHand=false;workPos=null;hover=null;turn=0;renderAll();
}
$discard.addEventListener('click',discardCard);


$('finishRestart').onclick=()=>{if(inCampaign){$('finishPanel').hidden=true;chooseLevel(currentLevel.id)}else{generate();$('finishPanel').hidden=true}};$('finishClose').onclick=()=>{if(inCampaign){handleContinue()}else{$('finishPanel').hidden=true;showWorld()}};
$('surrender').addEventListener('click',()=>{if(!lost&&!levelFinished&&confirm('Vzdát scénu? Tento pokus bude neúspěšný.')){lost=true;inHand=false;workPos=null;$settings.hidden=true;renderAll();}});
$('settingsBtn').addEventListener('click',()=>{$settings.hidden=false});
$('closeSettings').addEventListener('click',()=>{$settings.hidden=true});
$('generate').addEventListener('click',()=>{$settings.hidden=true;history.length=0;extraEnemies=new Set();});
let dragging=false,dragMoved=false,startX=0,startY=0,dragOrigin=null,dragPointer=null,firstPlacement=false;
function pointerCoord(e){const r=canvas.getBoundingClientRect();const px=(e.clientX-r.left)*canvas.width/r.width-BOARD_PAD_X;const py=(e.clientY-r.top)*canvas.height/r.height-BOARD_PAD_Y;return {x:Math.floor(px/S),y:Math.floor(py/S)};}
// Držet celý dílek uvnitř herní mřížky při přesunu myší i touchpadem.
function clampWorkPos(pos){
 if(selected===null)return pos;
 const cells=rotated(pieces[selected],turn);
 const maxX=Math.max(...cells.map(c=>c.x)),maxY=Math.max(...cells.map(c=>c.y));
 return {x:Math.max(0,Math.min(BW-maxX-1,Math.round(pos.x))),y:Math.max(0,Math.min(BH-maxY-1,Math.round(pos.y)))};
}
function positionPiece(e){
 const p=pointerCoord(e);if(selected===null)return;
 workPos=clampWorkPos(p);hover=workPos;drawBoard();refreshUI();
}
function relativeMove(e){
 if(!dragOrigin||!dragPointer)return;
 const r=canvas.getBoundingClientRect();
 // Posun je relativní vůči bodu dotyku, nikoli absolutní poloha prstu.
 // Zaokrouhlení zabraňuje poskakování dílku mezi dvěma sousedními poli.
 const dx=Math.round((e.clientX-dragPointer.x)*BW/r.width);
 const dy=Math.round((e.clientY-dragPointer.y)*BH/r.height);
 workPos=clampWorkPos({x:dragOrigin.x+dx,y:dragOrigin.y+dy});hover=workPos;
 drawBoard();refreshUI();
}
const mouseInput=e=>e.pointerType==='mouse';
canvas.addEventListener('click',e=>{if(!inHand&&!dragging)inspectPoiAtPointer(e);});
canvas.addEventListener('pointermove',e=>{if(mouseInput(e)&&!inHand&&!dragging){const p=pointerCoord(e),o=poi.find(q=>q.x===p.x&&q.y===p.y);canvas.title=o?`${o.name} · ${poiModeLabel(o.mode)}`:'';}});
// Shift + kliknutí umožní kontrolovat POI i při zvednutém dílku.
function inspectPoiAtPointer(e){
 const p=pointerCoord(e);
 const item=poi.find(o=>o.x===p.x&&o.y===p.y);
 if(!item)return false;
 detailOpen(item.name,poiInfo(item));
 return true;
}
canvas.addEventListener('pointerdown',e=>{
 if(e.button===0&&e.shiftKey){e.preventDefault();inspectPoiAtPointer(e);return;}
 if(e.button!==0||selected===null||lost)return;
 if(!inHand)return;
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
 if(e.shiftKey)return;
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
  // Na PC položí dílek levé kliknutí do mapy; tažení neukládá.
  if(!dragMoved&&stateOfWork()==='valid')commit();
 }else if(firstPlacement){
  positionPiece(e);
 }else{
  // Mobilní mapa slouží jen pro prohlížení; pokládá se tlačítkem ✓.
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
let padPointer=null,padStart=null,padOrigin=null,padMoved=false,padFresh=false;
function ensureWorkingPosition(){
 if(workPos||selected===null)return;
 const cells=rotated(pieces[selected],turn);
 const maxX=Math.max(...cells.map(c=>c.x)),maxY=Math.max(...cells.map(c=>c.y));
 // Umístění přibližně do středu mapy, ne nutně platné: lze dál posunovat.
 workPos={x:Math.floor((BW-maxX-1)/2),y:Math.floor((BH-maxY-1)/2)};
 hover=workPos;
}
pad.addEventListener('pointerdown',e=>{
 if(selected===null||lost||e.button!==0||eventLock)return;
 e.preventDefault();
 padFresh=!inHand;
 if(!inHand){inHand=true;renderAll();}
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
 workPos=clampWorkPos({x:padOrigin.x+dx,y:padOrigin.y+dy});hover=workPos;
 drawBoard();refreshUI();
});
function padEnd(e){if(e.pointerId!==padPointer)return;const tap=!padMoved&&e.type==='pointerup';padPointer=null;padStart=null;padOrigin=null;padMoved=false;if(tap&&!padFresh)rotate(1);padFresh=false;}
pad.addEventListener('pointerup',padEnd);pad.addEventListener('pointercancel',padEnd);



const detail=$('detailPanel');let eventQueue=[];
function signed(n){return (n>0?'+':'')+n;}
function signed(n){return (n>0?'+':'')+n;}
function poiPositive(o){if(o?.mode==='required')return true;if(o?.mode==='forbidden')return false;return (Number(o?.score?.found)||0)>=(Number(o?.score?.missed)||0);}
function poiMeaning(o){if(o.mode==='required')return 'Nutné získat';if(o.mode==='forbidden')return 'Nutné minout';return poiPositive(o)?'Výhodné získat':'Výhodné minout';}
function poiLegend(o){return `<span class="mtPoiMeaning ${poiPositive(o)?'mtPositive':'mtNegative'} ${o.mode==='optional'?'mtOptional':'mtMandatory'}" title="${safeText(poiMeaning(o))}" aria-label="${safeText(poiMeaning(o))}"></span>`;}
function poiImage(o){const theme=activeStory?.poiThemes?.default;const spec=spriteSpec(theme?.[o.icon]);const url=spec.available||spec.active;return url?`<img class="mtPoiImage" src="${safeText(url)}" alt="" onerror="this.style.display='none'">`:'<span class="mtPoiPlaceholder">◆</span>';}
function sceneBriefing(during=false){
 const d=currentLevel;if(!d)return '';
 const a=during?analyze(occupancy()):null;
 const t=activeStory?.tokenThemes?.[d.tokenTheme||activeStory?.defaults?.tokenTheme];
 const icon=(role)=>{const url=t?.[role]?.available||t?.[role]?.active;return url?`<img src="${safeText(url)}" alt="">`:'<span>◆</span>';};
 const tokens=[['reward',d.pieces?.reward],['penalty',d.pieces?.penalty]];
 const parts=`<div class="mtBriefMetrics">
  <div title="Mapa" aria-label="Mapa"><span class="mtBriefIcon">▦</span><b>${d.board.width}×${d.board.height}</b></div>
  <div title="Počet dílků" aria-label="Počet dílků"><span class="mtBriefIcon">▧</span><b>${d.pieces.count}</b></div>
  <div title="Minimální skóre" aria-label="Minimální skóre"><span class="mtBriefIcon">🏆</span><b>≥ ${d.success?.minimumScore??0}</b>${d.success?.useCampaignReserve?'<small title="Započítává se zásoba">＋◈</small>':''}</div>
  ${tokens.map(([role,v])=>`<div title="${safeText(v?.name||role)}" aria-label="${safeText(v?.name||role)}"><span class="mtBriefToken">${icon(role)}</span><b>${v?.count??0} × ${signed(v?.score??(role==='reward'?1:-1))}</b></div>`).join('')}
  <div title="Zahazování" aria-label="Zahazování"><span class="mtBriefIcon">♻</span><b>${d.discard?.mode==='disabled'?'⊘':d.discard?.mode==='free'?'0':signed(d.discard?.piecePenalty??-1)}</b></div>
 </div>`;
 const entries=poi.map(o=>{const found=during&&a.visited.has(`${o.x},${o.y}`),missed=Number(o.score?.missed)||0,gained=Number(o.score?.found)||0;
 return `<div class="mtPoiEntry">${poiImage(o)}${poiLegend(o)}<div class="mtPoiLabel"><b>${safeText(o.name)}</b><div class="mtPoiValues"><span class="${missed>0?'good':missed<0?'bad':'muted'}">${signed(missed)}</span><span>→</span><span class="${gained>0?'good':gained<0?'bad':'muted'}">${signed(gained)}</span></div></div>${during?`<span class="mtPoiReached" title="${found?'Dosaženo':'Nedosaženo'}" aria-label="${found?'Dosaženo':'Nedosaženo'}">${found?'☑':'☐'}</span>`:''}</div>`;
 }).join('');
 return `<div class="mtBrief">${parts}${poi.length?`<div class="mtPoiEntries">${entries}</div>`:''}</div>`;
}
function detailOpen(title,html,callback){$('detailTitle').textContent=title;$('detailBody').innerHTML=html;detail.hidden=false;detail.classList.remove('showing');void detail.offsetWidth;detail.classList.add('showing');$('detailClose').onclick=()=>{detail.hidden=true;if(callback)callback();};}
function safeText(t){return String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function poiInfo(o){const a=analyze(occupancy()),found=a.visited.has(`${o.x},${o.y}`);return `<div class="mtPoiDetail">${poiImage(o)}${poiLegend(o)}<b>${safeText(o.name)}</b><span>${found?'☑':'☐'}</span></div><div class="mtPoiValues"><span>${signed(Number(o.score?.missed)||0)}</span><span>→</span><span>${signed(Number(o.score?.found)||0)}</span></div>`;}
async function showPOIEvents(items){
 eventLock=true;refreshUI();eventQueue.push(...items.filter(o=>o.onFound?.text||o.onFound?.title));
 $('finishPanel').hidden=true;for(const o of items){burstAt(pxX(o.x)+S/2,pxY(o.y)+S/2);}await sleep(1250);
 if(!inCampaign||!currentLevel){eventLock=false;return;}
 if(eventQueue.length)nextPOIEvent();else{eventLock=false;refreshUI();if(levelFinished)$('finishPanel').hidden=false;}
}
function nextPOIEvent(){if(!eventQueue.length){eventLock=false;refreshUI();if(levelFinished)$('finishPanel').hidden=false;return;}
 const o=eventQueue.shift(),content=o.onFound||{};
 detailOpen(content.title||o.name,`<p style="white-space:pre-wrap">${safeText(content.text||'')}</p>`+poiInfo(o),nextPOIEvent);
}
$('poiSummary').addEventListener('click',()=>detailOpen(currentLevel?.name||'Scéna',sceneBriefing(true)));
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
 for(const o of [...(d.fixedObjects?.rocks?.positions||[]),...(d.fixedObjects?.lairs?.positions||[])]){
  if(!Number.isInteger(o.x)||!Number.isInteger(o.y)||o.x<0||o.y<0||o.x>=d.board.width||o.y>=d.board.height)errors.push('Pevný objekt mimo mapu');if(o.x===0&&o.y===d.start.position||o.x===d.board.width-1&&d.exits.some(e=>e.position===o.y))errors.push('Pevný objekt překrývá vstup/výstup');
  const key=o.x+','+o.y;if(occupied.has(key))errors.push('Kolize pevných objektů '+key);occupied.add(key);
 }
 for(const o of d.fixedObjects?.pointsOfInterest||[]){if(o.placement?.type==='fixed'){const {x,y}=o.placement;const key=x+','+y;if(x<0||y<0||x>=d.board.width||y>=d.board.height)errors.push('POI mimo mapu');if(occupied.has(key))errors.push('Kolize s POI '+key);occupied.add(key);}}
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
  activeStory=campaign;
  loadThemeAssets();
 }
 currentLevel=d;discardPoints=0;eventQueue=[];eventLock=false;effects=[];lastExitKeys=new Set();$('finishPanel').hidden=true;
 $('width').value=d.board.width;$('height').value=d.board.height;
 $('pieceCount').value=d.pieces.count;$('chance').value=d.pieces.passablePercent;
 $('gold').value=d.pieces.reward.count;$('enemy').value=d.pieces.penalty.count;
 $('obstacleCount').value=d.fixedObjects?.rocks?.randomCount||0;$('lairCount').value=d.fixedObjects?.lairs?.randomCount||0;
 entry=new Set([d.start.position]);exit=new Set(d.exits.map(e=>e.position));renderPortInputs(d.board.height);
 $('levelDescription').textContent=`${d.name} — ${d.description||''} · minimum ${d.success?.minimumScore??0} · koš: ${d.discard.mode}`;
 $('scoreSummary').title='Rozpis skóre';$('poiSummary').title='Informace o scéně';
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
 detailOpen('Chyba načítání',`<p>${safeText(e.message)}</p><p>Zkontroluj stories/*/story.json a spusť RUN.bat.</p>`);
}
async function loadCatalog(){
 try{
  const world=await loadJSON('world.json');
  const issuers=Array.isArray(world.categories)?world.categories:(Array.isArray(world.issuers)?world.issuers:[]);
  if(!issuers.length)throw Error('world.json: chybí categories');
  const index=await loadJSON('stories-index.json');
  const discovered=new Set((Array.isArray(index)?index:index.stories||[]).map(x=>typeof x==='string'?x:x.id));
  const refs=[];const unique=new Set();
  for(const issuer of issuers){
   if(!issuer.id||!issuer.name||!Array.isArray(issuer.stories))throw Error('world.json: neplatný zadavatel');
   for(const id of issuer.stories){
    if(unique.has(id)){console.warn('Příběh je uveden vícekrát:',id);continue;}unique.add(id);
    if(!discovered.has(id)){console.warn('Příběh chybí ve stories/:',id);continue;}
    refs.push({id,issuerId:issuer.id});
   }
  }
  window.worldLocations=issuers.map(x=>({id:x.id,name:x.name,icon:x.images?.off||x.icon||`assets/category/ctg_${x.id}_off.webp`,iconActive:x.images?.on||x.iconActive||`assets/category/ctg_${x.id}_on.webp`}));
  if(!window.worldLocations.some(x=>x.id===selectedLocation))selectedLocation=window.worldLocations[0].id;
  if(!refs.length)throw Error('Nebyly nalezeny žádné příběhy');
  const collected=[];campaignCatalog.clear();
  for(const ref of refs){
   const id=typeof ref==='string'?ref:ref.id;
   if(!/^[a-zA-Z0-9_-]+$/.test(id))throw Error('Chybné ID příběhu: '+id);
   const story=parseStoryV1(await loadJSON(`stories/${id}/story.json`),id);
   if(story.id!==id||!Array.isArray(story.scenes)||!story.scenes.length)throw Error('Neúplný příběh: '+id);
   if(campaignCatalog.has(id))throw Error('Duplicitní příběh: '+id);
   campaignCatalog.set(id,{...story,worldIssuerId:ref.issuerId,assetsBase:`stories/${id}/assets/`});
   const sceneIds=new Set();
   for(const scene of story.scenes){
    if(sceneIds.has(scene.id))throw Error('Duplicitní scéna v '+id+': '+scene.id);
    sceneIds.add(scene.id);
    collected.push({...scene,id:`${id}/${scene.id}`,_sceneId:scene.id,_campaignId:id,_campaignName:story.name});
   }
  }
  levelCatalog=collected;
  const sel=$('levelSelect');sel.replaceChildren();
  for(const scene of collected){const opt=document.createElement('option');opt.value=scene.id;opt.textContent=`${scene._campaignName} / ${scene.name}`;sel.append(opt)}
  initWorld();
 }catch(e){showLoadError(e)}
}
$('loadLevel').onclick=()=>{if(placements.length&&!confirm('Načíst novou úroveň a zahodit současný pokus?'))return;chooseLevel($('levelSelect').value);$settings.hidden=true};

const originalGenerate=generate;
generate=function(){extraEnemies=new Set();discarded=0;discardPoints=0;lost=false;history.length=0;originalGenerate();};
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
function showWorld(){eventLock=false;effects=[];lastExitKeys=new Set();inCampaign=false;activeRun=null;pendingEnd=null;$('finishPanel').hidden=true;$('settingsPanel').hidden=true;$('game').hidden=true;$('worldScreen').hidden=false;$('offerOverlay').hidden=true;renderWorld()}
function initWorld(){showWorld()}
function renderWorld(){const progress=readProgress();$('crownTotal').textContent=progress.crowns||0;
 const locations=window.worldLocations||[];
 const activeLocation=locations.find(l=>l.id===selectedLocation)||locations[0]||null;
 const locationTitle=$('worldLocationTitle');if(locationTitle)locationTitle.textContent=activeLocation?.name||'';
 $('worldLocations').replaceChildren();
 for(const l of locations){
  const active=l.id===selectedLocation;
  const b=document.createElement('button');b.className='locationIcon'+(active?' active':'');b.type='button';b.title=l.name;b.setAttribute('aria-label',l.name);
  const img=document.createElement('img');img.src=active?(l.iconActive||l.icon):(l.icon||l.iconActive||'');img.alt=l.name;img.loading='eager';img.decoding='async';img.onerror=()=>{b.classList.add('textOnly');img.remove()};
  b.append(img);b.onclick=()=>{selectedLocation=l.id;renderWorld()};$('worldLocations').append(b)
 }
 $('worldOffers').replaceChildren();const allEntries=[...campaignCatalog.values()].filter(c=>c.worldIssuerId===selectedLocation);if(allEntries.length>9)console.warn('Kategorie má více než 9 nabídek; rozcestník zobrazuje prvních devět:',selectedLocation);const entries=allEntries.slice(0,9);const grid=$('worldOffers');grid.dataset.rows=String(Math.max(1,Math.ceil(entries.length/3)));
 if(!entries.length){$('worldOffers').innerHTML='<p class="worldEmpty">Prozatím zde nejsou dostupné zakázky.</p>';return;}
 for(const c of entries){
  const done=progress.completed?.[c.id]||0;
  const reward=c.reward?.completion??0;
  const teaser=safeText(done?c.completedText:c.offerText);
  const b=document.createElement('button');b.className='offerCard';b.type='button';
  b.innerHTML=`<div class="offerCardInner"><h3>${safeText(c.name)}${done?'<span class="offerDone" aria-hidden="true">✓</span>':''}</h3><p>${teaser}</p><div class="offerFoot"><span class="offerCrown">👑 ${reward}</span><span class="offerDifficulty">${'★'.repeat(Math.max(0,Math.min(5,c.difficulty||0)))}</span></div></div>`;
  b.onclick=()=>openOffer(c);$('worldOffers').append(b)
 }
}
function openOffer(c){selectedOffer=c;const done=(readProgress().completed||{})[c.id]||0;
 $('offerTitle').textContent=c.name;$('offerDescription').textContent=done?c.completedText:c.offerText;
 $('offerInfo').textContent=`Scény: ${c.scenes.length} · Obtížnost: ${'★'.repeat(c.difficulty)}${'☆'.repeat(5-c.difficulty)} · Odměna: ${done?0:(c.reward?.completion||0)} 👑`;$('offerOverlay').hidden=false;
}
$('offerCancel').onclick=()=>{$('offerOverlay').hidden=true};
$('offerAccept').onclick=()=>{if(!selectedOffer)return;const c=selectedOffer;$('offerOverlay').hidden=true;inCampaign=true;
 activeRun={campaignId:c.id,levelId:null,visited:0,finished:false};activeCampaignId=null;reserve=0;$('worldScreen').hidden=true;$('game').hidden=false;
 if(c.startText)detailOpen(c.name,`<p style="white-space:pre-wrap">${safeText(c.startText)}</p>`,()=>goTarget(c.startTarget,0));else goTarget(c.startTarget,0);
};
function showDialog(id){const c=campaignCatalog.get(activeRun?.campaignId),d=c?.dialogsMap?.get(id);
 if(!d){detailOpen('Chyba dialogu',`<p>Dialog ${safeText(id)} neexistuje.</p>`,showWorld);return;}
 detailOpen(d.title||d.name||c.name,`<p style="white-space:pre-wrap">${safeText(d.text||'')}</p>`,()=>goTarget(d.nextTarget,0));
}
function showLevelIntro(d){const showBrief=()=>detailOpen(d.name||'Scéna',sceneBriefing(false));if(d.intro?.text)detailOpen(d.name||'Scéna',`<p style="white-space:pre-wrap">${safeText(d.intro.text)}</p>`,showBrief);else showBrief();}
function chooseResultScreen(level,ok,score){const candidates=(level.results||[]).filter(r=>r.result===(ok?'success':'fail')&&score>=(r.min??-Infinity)&&score<=(r.max??Infinity));
 if(candidates.length!==1){console.error('Chybí jediný vhodný výsledkový interval',level.id,ok,score);return null;}return candidates[0];
}
function resolveTarget(target){if(!target)return {type:'ending',result:'fail'};return target;}
function onLevelEnd(ok,a){if(!inCampaign||!activeRun)return;const level=currentLevel;
 if(ok&&level.success?.useCampaignReserve)reserve=a.finalScore;
 const reached=level.exits.filter(e=>a.visited.has(`${BW-1},${e.position}`));
 let target=null,exits=[];
 if(ok){
  const seen=new Set();for(const e of reached){const key=JSON.stringify(e.next);if(!seen.has(key)){seen.add(key);exits.push(e);}}
  if(exits.length===1)target=exits[0].next;else if(!exits.length)target=chooseResultScreen(level,true,a.finalScore)?.target;
 }else{
  if(a.forbidden&&level.failureTargets?.forbiddenPoi)target=level.failureTargets.forbiddenPoi;
  else if(!a.win)target=level.failTarget;
  else if(!a.mandatory&&level.failureTargets?.requiredPoi)target=level.failureTargets.requiredPoi;
  else target=level.failTarget;
 }
 pendingEnd={kind:ok&&exits.length>1?'select':'target',target,exits,score:a.finalScore,resultScreen:chooseResultScreen(level,ok,a.finalScore)};
}
function handleContinue(){if(!inCampaign||!pendingEnd){$('finishPanel').hidden=true;showWorld();return;}
 $('finishPanel').hidden=true;const p=pendingEnd;pendingEnd=null;
 const onward=()=>{
  if(p.kind==='select'){
   const list=p.exits.map((e,i)=>`<button data-exit="${i}">${safeText(e.name||e.id||'Východ '+(i+1))}</button>`).join(' ');
   detailOpen('Vyber cestu',`<p>Kterým dosaženým východem chceš pokračovat?</p><div class="storyActions">${list}</div>`);
   $('detailBody').querySelectorAll('[data-exit]').forEach(b=>b.onclick=()=>{const e=p.exits[Number(b.dataset.exit)];$('detailPanel').hidden=true;goTarget(e.next,p.score)});
  }else goTarget(p.target,p.score);
 };
 if(p.resultScreen?.text)detailOpen(currentLevel?.name||'Výsledek',`<p style="white-space:pre-wrap">${safeText(p.resultScreen.text)}</p>`,onward);else onward();
}
function goTarget(target,score){if(!inCampaign||!activeRun)return;
 const c=campaignCatalog.get(activeRun.campaignId);
 if(!target){detailOpen('Chyba návaznosti','<p>Chybí cíl pokračování.</p>',showWorld);return;}
 if(target.type==='dialog'){showDialog(target.id);return;}
 if(target.type==='scene'){
  const id=`${activeRun.campaignId}/${target.id}`,found=levelCatalog.find(x=>x.id===id);
  if(!found){detailOpen('Chyba návaznosti',`<p>Scéna ${safeText(target.id)} neexistuje.</p>`,showWorld);return;}
  activeRun.levelId=id;activeRun.visited++;
  if(activeRun.visited>150){detailOpen('Příliš mnoho přechodů','<p>Výprava se opakuje příliš dlouho.</p>',showWorld);return;}
  chooseLevel(id);return;
 }
 if(target.type==='return'){eventLock=false;refreshUI();return;}
 if(target.type!=='ending'){detailOpen('Chyba návaznosti','<p>Neznámý typ cíle.</p>',showWorld);return;}
 const result=target.result,variants=c.endings?.[result]||[];
 // Editor 0.7: select the highest eligible score threshold, fall back to unbounded variant.
 const matches=variants.filter(e=>score>=(e.minTotalScore??e.minScore??-Infinity)&&score<=(e.maxTotalScore??e.maxScore??Infinity));
 matches.sort((a,b)=>(b.minTotalScore??b.minScore??-Infinity)-(a.minTotalScore??a.minScore??-Infinity));
 const f=matches[0];if(!f){detailOpen('Chyba zakončení','<p>Chybí odpovídající zakončení.</p>',showWorld);return;}
 let award=0;
 if(result==='success'&&!activeRun.finished){const progress=readProgress(),seen=progress.completed[c.id]||0;
  if(!seen){award=Number(c.reward?.completion)||0;progress.crowns=(progress.crowns||0)+award;}
  progress.completed[c.id]=seen+1;saveProgress(progress);
 }
 activeRun.finished=true;
 detailOpen(f.title||c.name,`<p style="white-space:pre-wrap">${safeText(f.text||'')}</p><p>${result==='success'?`Získáváš ${award} 👑.`:'Tentokrát bez odměny.'}</p>`,showWorld);
}
