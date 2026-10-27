import {canonical,clone,commitImport,completeReminder,editEntity,hash,meta,validateState,currentOdometer,dueStatus} from '../../../shared/logic';
import {addVehicle} from '../../../shared/vehicle';
import type {State,Table} from '../../../shared/types';
import {account,objectRecord,readState,replaceGeneration,writeState} from './store';
import {originalUpload,putObject,readObject,uploadParts} from './files';
import {problem,storage,type Account,type V2Env,type StoredObject} from './types';
const now=()=>new Date().toISOString();
export async function status(env:V2Env,a:Account){const usage=await storage(env).db.prepare('SELECT bytes FROM record_usage WHERE scope=?').bind(a.owner).first<{bytes:number}>();return {features:{capture:1,gallery:1,cloudflare:1},account_email:a.email,last_check:a.last_run?new Date(a.last_run).toISOString():null,last_backup:a.last_backup,last_error:a.last_error,remaining_mail_quota:null,scheduler:{last_run:a.last_run,last_error:a.last_error??(env.GOOGLE_AUTOMATION_STOPPED==='true'?null:'Automatische E-Mails pausiert: Abschaltung der alten Google-Tagesprüfung noch nicht bestätigt.')},storage:{bytes:usage?.bytes??0,limit:1000000000}};}
export async function bootstrap(env:V2Env,owner:string){const {state,account:a}=await readState(env,owner);return {state,status:await status(env,a),revision:a.revision};}
export async function upload(env:V2Env,owner:string,request:Request){
 const {original,bytes,digest,thumb,operation,restoreId}=await uploadParts(request),{db}=storage(env),a=(await account(env,owner))!;
 let generation=a.generation;
 if(restoreId){const target=await restoreTarget(env,owner,restoreId);generation=target.generation;const expected=await db.prepare("SELECT payload FROM record_entities WHERE owner=? AND generation=? AND kind='Documents' AND json_extract(payload,'$.sha256')=?").bind(owner,generation,digest).all<{payload:string}>();if(!expected.results.length||expected.results.some(r=>{const d=JSON.parse(r.payload);return d.size!==bytes.length||d.mime!==original.type;}))problem(400,'Original passt nicht zur geprüften Wiederherstellung.');}
 const object=await putObject(env,owner,digest,bytes,original.type,original.name,'original');if(thumb)await putObject(env,owner,'thumb-'+digest,thumb,'image/webp',original.name,'thumbnail');
 const u={...originalUpload(object,operation),...meta('upload-'+digest,now())};delete (u as any).base64;
 if(restoreId){await db.batch([db.prepare("UPDATE record_entities SET payload=json_set(payload,'$.drive_id',?,'$.missing',json('false')) WHERE owner=? AND generation=? AND kind='Documents' AND json_extract(payload,'$.sha256')=?").bind(object.id,owner,generation,digest),db.prepare('UPDATE record_accounts SET revision=revision+1 WHERE owner=?').bind(owner)]);}
 else await db.batch([db.prepare("INSERT OR IGNORE INTO record_entities(owner,generation,kind,id,payload) VALUES(?,?,'Uploads',?,?)").bind(owner,generation,u.id,JSON.stringify(u)),db.prepare('UPDATE record_accounts SET revision=revision+1 WHERE owner=?').bind(owner)]);
 return u;
}
export async function document(env:V2Env,owner:string,id:string,thumbnail:boolean){
 const {db}=storage(env),row=await db.prepare("SELECT e.payload FROM record_entities e JOIN record_accounts a ON a.owner=e.owner AND a.generation=e.generation WHERE e.owner=? AND e.kind='Documents' AND e.id=? AND a.disabled=0").bind(owner,id).first<{payload:string}>();if(!row)problem(404,'Dokument fehlt.');const d=JSON.parse(row.payload);if(d.missing||!d.sha256)problem(404,'Originaldatei fehlt.');const object=await readObject(env,owner,thumbnail?'thumb-'+d.sha256:d.sha256);if(!thumbnail&&(object.record.size!==d.size||object.record.mime!==d.mime))problem(409,'Originalangaben stimmen nicht.');return object;
}
async function restoreTarget(env:V2Env,owner:string,id:string){const target=await storage(env).db.prepare('SELECT * FROM record_restores WHERE owner=? AND id=?').bind(owner,id).first<{id:string;generation:string;source_hash:string}>();if(!target)problem(404,'Wiederherstellung gehört nicht zu diesem Konto.');return target;}
// Ready receipts are written only after byte/hash validation and a confirmed R2 write.
// Originals are immutable through this API; upload retries also check R2 metadata.
async function receipts(env:V2Env,owner:string){return new Map((await storage(env).db.prepare("SELECT * FROM record_objects WHERE owner=? AND status='ready'").bind(owner).all<StoredObject>()).results.map(r=>[r.id,r]));}
async function restorePreview(env:V2Env,owner:string,id:string){const target=await restoreTarget(env,owner,id),{state}=await readState(env,owner,target.generation),objects=await receipts(env,owner),missing:string[]=[];for(const d of state.Documents){if(!d.sha256)continue;const original=objects.get(d.sha256);if(d.missing||original?.role!=='original'||original.size!==d.size||original.mime!==d.mime||original.sha256!==d.sha256)missing.push(d.title);if(d.mime?.startsWith('image/')&&objects.get('thumb-'+d.sha256)?.role!=='thumbnail')missing.push(d.title+' (Bildvorschau)');}
 return {id,state,missing,target:{generation:target.generation}};
}
export async function backup(env:V2Env,a:Account,state:State){
 const {db,files}=storage(env),objects=await receipts(env,a.owner);for(const d of state.Documents.filter(d=>d.sha256&&!d.missing)){const o=objects.get(d.sha256!);if(o?.role!=='original'||o.size!==d.size||o.sha256!==d.sha256)problem(409,'Bestätigter Originalnachweis fehlt. Sicherung nicht bestätigt.');}
 const created=now(),snapshot={format:'vehicle-record-backup',schema_version:1,created_at:created,state},body=new TextEncoder().encode(JSON.stringify(snapshot)),id='snapshot-'+created.replaceAll(':','-')+'-'+hash(canonical(state)).slice(0,16);
 await putObject(env,a.owner,id,body,'application/json',id+'.json','snapshot');await db.prepare('UPDATE record_accounts SET last_backup=? WHERE owner=?').bind(created,a.owner).run();
 const old=await db.prepare("SELECT id,object_key FROM record_objects WHERE owner=? AND role='snapshot' AND status='ready' ORDER BY created_at DESC,id DESC").bind(a.owner).all<{id:string;object_key:string}>(),remove=old.results.slice(state.Settings[0].backup_retention,1000);if(remove.length){await files.delete(remove.map(r=>r.object_key));await db.prepare("DELETE FROM record_objects WHERE owner=? AND role='snapshot' AND id IN (SELECT value FROM json_each(?))").bind(a.owner,JSON.stringify(remove.map(r=>r.id))).run();}return {ok:true,snapshot_id:id};
}
async function documentExists(env:V2Env,owner:string,id:string,size:number){const o=await objectRecord(env,owner,id);if(o?.status!=='ready'||o.role!=='original'||o.size!==size||o.sha256!==id)problem(409,'Bestätigter Originalnachweis fehlt.');}
export async function action(env:V2Env,owner:string,name:string,arg:any):Promise<any>{
 const loaded=await readState(env,owner),a=loaded.account,s=loaded.state,{db}=storage(env);let next=clone(s),result:any={ok:true};
 switch(name){
 case 'read':return {result:{state:s,status:await status(env,a),revision:a.revision}};
 case 'status':return {result:await status(env,a)};
 case 'createVehicle':next=addVehicle(s,arg,now());break;
 case 'commit':{const objects=await receipts(env,owner);for(const selected of Object.values(arg.documents??{})){const u=s.Uploads.find(u=>u.id===selected);if(u){const o=objects.get(u.sha256);if(o?.role!=='original'||o.size!==u.size||o.sha256!==u.sha256)problem(409,'Bestätigter Originalnachweis fehlt.');}}const out=commitImport(s,arg,now());next=out.state;result=out.result;break;}
 case 'edit':next=editEntity(s,arg.table,arg.id,arg.revision,arg.patch,now());break;
 case 'odometer':if(!next.Odometer.some(x=>x.id===arg.id))next.Odometer.push({...meta(arg.id,now()),date:arg.date,km:arg.km,confirmed:true,note:arg.note??null});break;
 case 'completeReminder':{const r=next.Reminders.find(x=>x.id===arg.id)??problem(404,'Erinnerung fehlt.');if(r.completed_work_id===arg.work_id)break;if(r.revision!==arg.revision)problem(409,'Konflikt: Erinnerung geändert.');completeReminder(next,arg.id,arg.work_id,now());next.AuditLog.push({...meta(arg.id+'-done-'+arg.work_id,now()),entity_id:arg.id,action:'confirmed-completion',before:null,after:{work_id:arg.work_id}});break;}
 case 'attachDocument':{const d=next.Documents.find(d=>d.id===arg.id)??problem(404,'Dokument fehlt.'),u=s.Uploads.find(u=>u.id===arg.upload_id)??problem(404,'Upload fehlt.');if(!d.missing&&d.sha256===u.sha256)break;if(d.revision!==arg.revision||!d.missing)problem(409,'Konflikt: Dokument inzwischen geändert.');await documentExists(env,owner,u.sha256,u.size);Object.assign(d,{drive_id:u.drive_id,sha256:u.sha256,size:u.size,mime:u.mime,source_filename:u.source_filename,missing:false,revision:d.revision+1,updated_at:now()});next.AuditLog.push({...meta(d.id+'-attach-'+d.revision,now()),entity_id:d.id,action:'attach-original',before:null,after:{sha256:d.sha256}});break;}
 case 'smoke':{const id='probe-'+crypto.randomUUID();next.AuditLog.push({...meta(id,now()),entity_id:id,action:'connection-probe',before:null,after:{verified:true}});break;}
 case 'backup':result=await backup(env,a,s);return {result,...await bootstrap(env,owner)};
 case 'orphanFiles':return {result:(await db.prepare("SELECT o.id,o.name,o.size,o.status,o.created_at FROM record_objects o WHERE o.owner=? AND o.role='original' AND NOT EXISTS(SELECT 1 FROM record_entities e WHERE e.owner=o.owner AND e.generation=? AND e.kind='Documents' AND json_extract(e.payload,'$.sha256')=o.id)").bind(owner,a.generation).all()).results};
 case 'restoreStart':{validateState(arg.state);const source=clone(arg.state) as State,sourceHash=hash(canonical(source));const previous=await db.prepare('SELECT id,generation FROM record_restores WHERE owner=? AND source_hash=?').bind(owner,sourceHash).first<{id:string;generation:string}>();if(previous)return {result:previous};const generation='restore-'+crypto.randomUUID(),id=crypto.randomUUID();source.Uploads=[];for(const d of source.Documents){d.drive_id=null;d.missing=true;}await replaceGeneration(env,a,source,generation);await db.prepare('INSERT OR IGNORE INTO record_restores(owner,id,generation,source_hash,created_at) VALUES(?,?,?,?,?)').bind(owner,id,generation,sourceHash,now()).run();return {result:await db.prepare('SELECT id,generation FROM record_restores WHERE owner=? AND source_hash=?').bind(owner,sourceHash).first()};}
 case 'restorePreview':return {result:await restorePreview(env,owner,arg.id)};
 case 'restoreSwitch':{if(arg.confirm!==true)problem(400,'Bestätigung fehlt.');const preview=await restorePreview(env,owner,arg.id);if(preview.missing.length)problem(409,'Originale oder Vorschauen fehlen.');const nonce=crypto.randomUUID();await db.batch([db.prepare('INSERT INTO record_guards(nonce,owner,expected) VALUES(?,?,?)').bind(nonce,owner,a.revision),db.prepare('UPDATE record_accounts SET generation=?,revision=revision+1 WHERE owner=?').bind(preview.target.generation,owner),db.prepare('DELETE FROM record_guards WHERE nonce=?').bind(nonce)]);return {result:{ok:true},...await bootstrap(env,owner)};}
 default:problem(400,'Aktion nicht unterstützt.');
 }
 const revision=await writeState(env,a,s,next);const fresh={...a,revision};return {result,state:next,status:await status(env,fresh),revision};
}
