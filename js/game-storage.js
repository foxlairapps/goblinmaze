/* MT.057 – platform-independent persistence interface; IndexedDB web adapter. */
'use strict';
window.GameStorage=(()=>{
 const dbName='mercenary-tales-player',store='records',legacy='mercenary-tales-progress-v1';
 let database=null;
 function db(){if(database)return Promise.resolve(database);return new Promise((resolve,reject)=>{const req=indexedDB.open(dbName,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(store))req.result.createObjectStore(store)};req.onsuccess=()=>{database=req.result;resolve(database)};req.onerror=()=>reject(req.error)});}
 async function op(key,action,value){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction(store,action==='get'?'readonly':'readwrite');const os=tx.objectStore(store),req=action==='get'?os.get(key):action==='put'?os.put(value,key):os.delete(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);tx.onerror=()=>reject(tx.error);});}
 const defaults=()=>({crowns:0,completed:{}});
 function oldProfile(){try{return JSON.parse(localStorage.getItem(legacy))||defaults()}catch{return defaults()}}
 return {
  async loadProfile(){const found=await op('profile','get');if(found)return found;const migrated=oldProfile();await op('profile','put',migrated);return migrated;},
  async saveProfile(profile){await op('profile','put',profile);},
  async loadRun(){return op('run','get');},
  async saveRun(snapshot){await op('run','put',snapshot);},
  async clearRun(){await op('run','delete');},
  async resetProfile(){await op('profile','put',defaults());},
  async exportData(){return {format:'mercenary-tales-save',version:1,profile:await this.loadProfile(),run:await this.loadRun()};},
  async importData(value){if(value?.format!=='mercenary-tales-save'||value.version!==1||!value.profile||typeof value.profile.completed!=='object')throw Error('Neznámý formát uložení');await this.saveProfile(value.profile);if(value.run)await this.saveRun(value.run);else await this.clearRun();}
 };
})();
