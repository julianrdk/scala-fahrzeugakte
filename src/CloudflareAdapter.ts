import {base64Bytes,bytesBase64,SignInRequired,type Adapter,type Config} from './adapter';
import {cachedThumbnail,clearThumbnailCache,makeThumbnail} from './thumbnail';
import type {Doc,UploadFile} from '../shared/types';
import {FuelSearchError,type FuelQuery,type FuelResult,type FuelStatus} from '../shared/fuel';
import {clearTimings,timed} from './timings';
export class CloudflareAdapter implements Adapter{
 readonly kind='cloudflare' as const;accountEmail='';private cached:any=null;private documents=new Map<string,Doc>();private epoch=0;private closed=false;
 constructor(public config:Config,public accountId:string,private token:()=>Promise<string|null>,private invalid:()=>void=()=>{}){}
 resume(){this.closed=false;}
 dispose(){this.epoch++;this.closed=true;this.cached=null;this.documents.clear();clearTimings();void clearThumbnailCache();}
 private valid(epoch:number){if(this.closed||epoch!==this.epoch)throw new SignInRequired('Kontositzung wurde gewechselt.');}
 private async request(path:string,init:RequestInit={}){if(this.closed)throw new SignInRequired('Bitte anmelden.');const epoch=this.epoch,token=await this.token();this.valid(epoch);if(!token){this.dispose();this.invalid();throw new SignInRequired('Bitte erneut anmelden.');}let response:Response;try{response=await fetch(this.config.apiOrigin+path,{...init,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',headers:{...Object.fromEntries(new Headers(init.headers)),Authorization:'Bearer '+token}});}catch{throw Error('Keine Serverbestätigung. Verbindung prüfen und denselben Vorgang wiederholen.');}this.valid(epoch);if(response.status===401||response.status===403){this.dispose();this.invalid();throw new SignInRequired('Bitte erneut anmelden.');}return response;}
 private async json(path:string,init:RequestInit={}){const epoch=this.epoch,response=await this.request(path,init);let body:any;try{body=await response.json();}catch{throw Error('Keine gültige Serverbestätigung.');}this.valid(epoch);if(!response.ok){if(path.startsWith('/v2/fuel/'))throw new FuelSearchError(body.error??'Tankstellensuche nicht verfügbar.',body.retryAfter??0);throw Error(body.error??'Speichern nicht bestätigt.');}return body;}
 private remember(snapshot:any){if(snapshot.state){this.documents=new Map(snapshot.state.Documents.map((d:Doc)=>[d.id,d]));this.accountEmail=snapshot.status?.account_email??'';}}
 async bootstrap(){this.cached=null;return timed('Aktenstart',async()=>{const snapshot=await this.json('/v2/bootstrap');this.remember(snapshot);return snapshot;});}
 async thumbnail(doc:Doc){const epoch=this.epoch;return timed('Bildvorschau',()=>cachedThumbnail(this.accountId,doc.sha256!,async()=>{const response=await this.request('/v2/documents/'+encodeURIComponent(doc.id)+'/thumbnail');if(!response.ok)throw Error('Bildvorschau konnte nicht geladen werden.');return response.blob();},()=>!this.closed&&this.epoch===epoch));}
 async call<T=any>(name:string,arg:any={}):Promise<T>{
  if(name==='read'){if(this.cached&&!arg.fresh){const result=this.cached;this.cached=null;return result;}return await this.bootstrap();}
  if(name==='document'){const epoch=this.epoch,response=await this.request('/v2/documents/'+encodeURIComponent(arg.id)+'/original');if(!response.ok)throw Error('Originaldatei konnte nicht geladen werden.');const bytes=new Uint8Array(await response.arrayBuffer()),d=this.documents.get(arg.id);this.valid(epoch);return {base64:bytesBase64(bytes),source_filename:d?.source_filename??d?.title??'Original',mime:response.headers.get('Content-Type')??'application/octet-stream',size:bytes.length,sha256:d?.sha256} as T;}
  this.cached=null;
  if(name==='upload'||name==='restoreUpload'){const f=arg.file as UploadFile,blob=new Blob([base64Bytes(f.base64)],{type:f.mime}),data=new FormData();data.set('original',blob,f.source_filename);data.set('sha256',f.sha256);data.set('operation_id',arg.operation_id??'restore-'+arg.restore_id);if(arg.restore_id)data.set('restore_id',arg.restore_id);if(f.mime.startsWith('image/'))data.set('thumbnail',await makeThumbnail(blob),'thumbnail.webp');const out=await this.json('/v2/files',{method:'POST',body:data});return out.result;}
  const send=()=>this.json('/v2/actions/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(arg)}),out=await (['commit','edit','odometer','createVehicle','completeReminder','attachDocument','smoke'].includes(name)?timed('Speichern',send):send());if(out.state){this.remember(out);this.cached={state:out.state,status:out.status,revision:out.revision};}return out.result as T;
 }
 fuelStatus(){return this.json('/v2/fuel/status') as Promise<FuelStatus>;}
 searchFuel(query:FuelQuery,signal?:AbortSignal){return this.json('/v2/fuel/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(query),signal}) as Promise<FuelResult>;}
}
