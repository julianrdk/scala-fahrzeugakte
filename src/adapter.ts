import {emptyState,clone,meta,commitImport,editEntity,completeReminder,hashBytes,assertFile,verifySignature,validateState,fail} from '../shared/logic';
import type {State,UploadFile} from '../shared/types';
import {addVehicle} from '../shared/vehicle';
import {FuelSearchError,type FuelQuery,type FuelResult,type FuelStatus} from '../shared/fuel';
export type Config={clientId:string;deploymentId:string;origin:string;authOrigin?:string};
export interface Adapter{kind:'google'|'test';accountEmail?:string;accountId?:string;call<T=any>(action:string,arg?:any):Promise<T>;}
import {scopes} from '../shared/google-scopes';
export {scopes};
export class SignInRequired extends Error {}
declare global{interface Window{google:any;}}
export class GoogleAdapter implements Adapter{
 kind='google' as const;private token='';private expires=0;
 constructor(public config:Config){}
 ready(){return this.config.clientId.endsWith('.apps.googleusercontent.com')&&!this.config.deploymentId.includes('EINTRAGEN')&&this.config.origin===location.origin&&location.protocol==='https:';}
 async loadLibrary(){if(window.google?.accounts?.oauth2)return;await new Promise<void>((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.onload=()=>resolve();script.onerror=()=>reject(Error('Google-Anmeldung konnte nicht geladen werden. Internetverbindung prüfen.'));document.head.append(script);});}
 authorize(){if(!this.ready())return Promise.reject(Error('Einrichtung fehlt: eigene HTTPS-Domain, Google-Client-ID und API-Deployment-ID in config.json einsetzen.'));return new Promise<void>((resolve,reject)=>{if(!window.google?.accounts?.oauth2)return reject(Error('Anmeldebibliothek wird noch geladen. Bitte gleich erneut klicken.'));window.google.accounts.oauth2.initTokenClient({client_id:this.config.clientId,scope:scopes.join(' '),include_granted_scopes:false,error_callback:()=>reject(Error('Google-Anmeldung wurde geschlossen oder blockiert. Deine Eingaben bleiben erhalten.')),callback:(response:any)=>{if(response.error||!window.google.accounts.oauth2.hasGrantedAllScopes(response,...scopes))return reject(Error('Nicht alle benötigten Berechtigungen wurden erteilt.'));this.token=response.access_token;this.expires=Date.now()+Number(response.expires_in)*1000;resolve();}}).requestAccessToken({prompt:'select_account'});});}
 disconnect(){this.token='';this.expires=0;}
 async call<T=any>(action:string,arg:any={}):Promise<T>{if(!this.token||Date.now()>this.expires-360000){this.disconnect();throw new SignInRequired('Bitte mit Google erneut verbinden. Die Anmeldung ist abgelaufen oder läuft bald ab. Deine Eingaben bleiben erhalten.');}
  let response:Response;try{response=await fetch(`https://script.googleapis.com/v1/scripts/${encodeURIComponent(this.config.deploymentId)}:run`,{method:'POST',headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json'},body:JSON.stringify({function:'scalaApi',parameters:[action,arg],devMode:false}),cache:'no-store',referrerPolicy:'no-referrer'});}catch{throw Error('Keine Serverbestätigung erhalten. Verbindung prüfen und denselben Speichervorgang wiederholen.');}
  return scriptResult(response,()=>this.disconnect());
 }
}
async function scriptResult<T=any>(response:Response,onExpired:()=>void=()=>{}):Promise<T>{
 const result=await response.json();if(response.status===401){onExpired();throw new SignInRequired('Anmeldung abgelaufen. Bitte erneut anmelden; danach denselben Vorgang wiederholen.');}
 if(!response.ok||result.error)throw Error(typeof result.error==='string'?result.error:result.error?.details?.[0]?.errorMessage??result.error?.message??'Google-Anfrage fehlgeschlagen.');
 if(result.done!==true||!result.response||!('result' in result.response))throw Error('Keine vollständige Serverbestätigung. Denselben Vorgang erneut versuchen.');return result.response.result;
}
export class SessionAdapter implements Adapter{
 kind='google' as const;private csrf='';accountEmail='';accountId='';
 constructor(public config:Config){}
 ready(){try{return !!this.config.authOrigin&&new URL(this.config.authOrigin).origin===this.config.authOrigin&&this.config.authOrigin.startsWith('https://')&&this.config.origin===location.origin&&location.protocol==='https:';}catch{return false;}}
 async loadLibrary(){}
 private async request(path:string,init:RequestInit={}){if(!this.ready())throw Error('Die dauerhafte Anmeldung ist noch nicht eingerichtet.');try{return await fetch(this.config.authOrigin+path,{...init,credentials:'include',cache:'no-store',referrerPolicy:'no-referrer'});}catch{throw Error('Anmeldedienst nicht erreichbar. Keine Serverbestätigung erhalten. Verbindung prüfen und denselben Vorgang wiederholen.');}}
 async restore(){const response=await this.request('/session');if(response.status===401){this.csrf='';this.accountEmail='';this.accountId='';return false;}const result=await response.json();if(!response.ok||result.signedIn!==true||typeof result.csrf!=='string')throw Error('Dauerhafte Anmeldung konnte nicht geprüft werden. Bitte später erneut versuchen.');this.csrf=result.csrf;this.accountEmail=typeof result.email==='string'?result.email:'';this.accountId=typeof result.accountId==='string'?result.accountId:'';return true;}
 async authorize(remember=true){
  if(!this.ready())throw Error('Die dauerhafte Anmeldung ist noch nicht eingerichtet.');
  const popup=window.open(this.config.authOrigin+'/login?remember='+(remember?'1':'0'),'scala-google-login','popup,width=520,height=700');
  if(!popup)throw Error('Bitte das Anmeldefenster für diese Website zulassen und erneut anmelden.');
  await new Promise<void>((resolve,reject)=>{
   let finished=false;
   const finish=(error?:Error)=>{if(finished)return;finished=true;removeEventListener('message',message);clearInterval(poll);clearTimeout(timeout);if(error)reject(error);else resolve();};
   const message=(event:MessageEvent)=>{if(event.origin===this.config.authOrigin&&event.source===popup&&event.data?.type==='scala-session-ready')finish();};
   addEventListener('message',message);
   // A close can race postMessage delivery. Check the server instead of assuming success.
   const poll=setInterval(()=>{if(popup.closed)finish();},500);
   const timeout=setTimeout(()=>finish(Error('Anmeldung dauert zu lange. Bitte das Anmeldefenster schließen und erneut versuchen.')),600000);
  });
  if(!await this.restore())throw Error('Google-Anmeldung wurde nicht bestätigt. Bitte erneut anmelden. Deine Eingaben bleiben erhalten.');
 }
 async disconnect(){if(!this.csrf&&!await this.restore())return;const response=await this.request('/logout',{method:'POST',headers:{'X-Scala-CSRF':this.csrf}});if(!response.ok&&response.status!==401)throw Error('Abmeldung wurde nicht bestätigt. Bitte erneut versuchen.');this.csrf='';}
 private async fuelRequest<T>(path:string,init:RequestInit={}):Promise<T>{
  if(!this.csrf)throw new SignInRequired('Bitte erneut mit Google anmelden.');
  const response=await this.request(path,init);
  if(response.status===401){this.csrf='';throw new SignInRequired('Bitte erneut mit Google anmelden, um Tankpreise zu suchen.');}
  const result=await response.json();if(!response.ok)throw new FuelSearchError(typeof result.error==='string'?result.error:'Die Tankstellensuche ist gerade nicht verfügbar.',Number(result.retryAfter)||0);return result as T;
 }
 fuelStatus(){return this.fuelRequest<FuelStatus>('/fuel/status');}
 searchFuel(query:FuelQuery,signal?:AbortSignal){return this.fuelRequest<FuelResult>('/fuel/search',{method:'POST',headers:{'Content-Type':'application/json','X-Scala-CSRF':this.csrf},body:JSON.stringify(query),signal});}
 async call<T=any>(action:string,arg:any={}):Promise<T>{
  if(!this.csrf)throw new SignInRequired('Bitte erneut mit Google anmelden. Deine Eingaben bleiben erhalten.');
  const response=await this.request('/api/'+encodeURIComponent(action),{method:'POST',headers:{'Content-Type':'application/json','X-Scala-CSRF':this.csrf},body:JSON.stringify(arg)});
  const result=await scriptResult<any>(response,()=>{this.csrf='';});
  if(action==='read'&&result.status){try{const automation=await this.request('/automation');result.status.scheduler=automation.ok?await automation.json():{last_error:'Status der Tagesprüfung nicht verfügbar.'};}catch{result.status.scheduler={last_error:'Status der Tagesprüfung nicht verfügbar.'};}}
  return result as T;
 }
}
export type GoogleConnection=GoogleAdapter|SessionAdapter;
export function googleConnection(config:Config):GoogleConnection{return config.authOrigin?new SessionAdapter(config):new GoogleAdapter(config);}
const DB_NAME='scala-explicit-test-v1';
function db(){return new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore('store');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function readDB(key:string){const d=await db();try{return await new Promise<any>((resolve,reject)=>{const r=d.transaction('store').objectStore('store').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{d.close();}}
async function writeDB(entries:[string,any][]){const d=await db();try{await new Promise<void>((resolve,reject)=>{const t=d.transaction('store','readwrite');for(const [k,v] of entries)t.objectStore('store').put(v,k);t.oncomplete=()=>resolve();t.onabort=()=>reject(t.error);t.onerror=()=>reject(t.error);});}finally{d.close();}}
export class TestAdapter implements Adapter{
 kind='test' as const;
 async call<T=any>(action:string,arg:any={}):Promise<T>{return navigator.locks.request('scala-test-store',async()=>{
  let s:State=(await readDB('state'))??emptyState();let result:any;const at=new Date().toISOString();
  switch(action){
   case 'createVehicle':s=addVehicle(s,arg,at);result={ok:true};break;
   case 'read':return {state:s,status:{features:{capture:1,gallery:1},last_check:null,last_backup:null,last_error:null,remaining_mail_quota:null,trigger_installed:false}} as T;
   case 'upload':{const f=arg.file as UploadFile;assertFile(f);const bytes=base64Bytes(f.base64);if(bytes.length!==f.size||hashBytes(bytes)!==f.sha256)fail('Prüfsumme stimmt nicht.');verifySignature(bytes,f.mime);let u=s.Uploads.find(u=>u.sha256===f.sha256);if(!u){u={...meta('upload-'+f.sha256,at),operation_id:arg.operation_id,sha256:f.sha256,size:f.size,mime:f.mime,source_filename:f.source_filename,drive_id:'test-'+f.sha256};s.Uploads.push(u);}await writeDB([['file:'+u.drive_id,f]]);result=u;break;}
   case 'commit':{const output=commitImport(s,arg,at);s=output.state;result=output.result;break;}
   case 'edit':s=editEntity(s,arg.table,arg.id,arg.revision,arg.patch,at);result={ok:true};break;
   case 'attachDocument':{const d=s.Documents.find(x=>x.id===arg.id)??fail('Dokument fehlt.');if(d.revision!==arg.revision)fail('Konflikt: Dokument geändert.');if(!d.missing)fail('Original ist schon vorhanden.');const u=s.Uploads.find(x=>x.id===arg.upload_id)??fail('Upload fehlt.');Object.assign(d,{sha256:u.sha256,size:u.size,mime:u.mime,drive_id:u.drive_id,source_filename:u.source_filename,missing:false,revision:d.revision+1,updated_at:at});result={ok:true};break;}
   case 'document':{const doc=s.Documents.find(d=>d.id===arg.id)??fail('Datei fehlt.');return await readDB('file:'+doc.drive_id) as T;}
   case 'odometer':{if(!s.Odometer.some(x=>x.id===arg.id))s.Odometer.push({...meta(arg.id,at),date:arg.date,km:arg.km,confirmed:true,note:arg.note??null});validateState(s);result={ok:true};break;}
   case 'completeReminder':{const r=s.Reminders.find(x=>x.id===arg.id)??fail('Erinnerung fehlt.');if(r.completed_work_id!==arg.work_id&&r.revision!==arg.revision)fail('Konflikt: Erinnerung geändert.');completeReminder(s,arg.id,arg.work_id,at);validateState(s);result={ok:true};break;}
   case 'smoke':return {ok:true,identity:'Lokaler Testadapter. Keine Google-Verbindung.'} as T;
   case 'backup':await writeDB([['backup:'+at,clone(s)]]);return {ok:true,local:true} as T;
   case 'restoreStart':{validateState(arg.state);const id=crypto.randomUUID();const state=clone(arg.state) as State;state.Uploads=[];state.Documents.forEach(d=>{d.drive_id=null;d.missing=true;});await writeDB([['restore:'+id,state]]);return {id,sheet:'Neue lokale Testakte',folder:'Separater Testdateispeicher'} as T;}
   case 'restoreUpload':{const state=await readDB('restore:'+arg.restore_id) as State;const f=arg.file as UploadFile;assertFile(f);const bytes=base64Bytes(f.base64);if(hashBytes(bytes)!==f.sha256||bytes.length!==f.size)fail('Wiederherstellung: Prüfsumme fehlerhaft.');verifySignature(bytes,f.mime);for(const doc of state.Documents.filter(d=>d.sha256===f.sha256)){doc.drive_id='restore-'+arg.restore_id+'-'+f.sha256;doc.missing=false;doc.mime=f.mime;doc.size=f.size;await writeDB([['file:'+doc.drive_id,f]]);}await writeDB([['restore:'+arg.restore_id,state]]);return {ok:true} as T;}
   case 'restorePreview':{const state=await readDB('restore:'+arg.id) as State;return {state,missing:state.Documents.filter(d=>d.sha256&&d.missing).map(d=>d.title)} as T;}
   case 'restoreSwitch':{if(arg.confirm!==true)fail('Bestätigung fehlt.');const next=await readDB('restore:'+arg.id) as State;validateState(next);if(next.Documents.some(d=>d.sha256&&d.missing))fail('Dateien fehlen.');await writeDB([['prior-state:'+at,s]]);s=next;result={ok:true};break;}
   case 'orphanFiles':return s.Uploads.filter(u=>!s.Documents.some(d=>d.drive_id===u.drive_id)) as T;
   case 'testMail':fail('Im Testmodus werden keine E-Mails versendet.');
   default:fail('Aktion im Testadapter unbekannt.');
  }
  await writeDB([['state',s]]);return result as T;
 });}
}
export function base64Bytes(s:string){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
export function bytesBase64(b:Uint8Array){let s='';for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode(...b.subarray(i,i+8192));return btoa(s);}
export async function prepareFile(file:File):Promise<UploadFile>{const bytes=new Uint8Array(await file.arrayBuffer());const result={source_filename:file.name,mime:file.type||(/\.pdf$/i.test(file.name)?'application/pdf':''),size:file.size,sha256:hashBytes(bytes),base64:bytesBase64(bytes)};assertFile(result);verifySignature(bytes,result.mime);return result;}
