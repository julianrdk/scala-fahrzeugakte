import {canonical,clone,emptyState,tables,validateState} from '../../../shared/logic';
import type {State,Table} from '../../../shared/types';
import {problem,storage,type Account,type V2Env,type Statement} from './types';
const at=()=>new Date().toISOString();
function entries(state:State){return tables.flatMap(kind=>state[kind].map(row=>({kind,id:row.id,payload:JSON.stringify(row)})));}
function chunks<T>(rows:T[],limit=400000){const out:T[][]=[];let batch:T[]=[],size=0;for(const row of rows){const n=new TextEncoder().encode(JSON.stringify(row)).length;if(n>900000)problem(413,'Ein Datensatz ist zu groß. Bitte Umfang prüfen.');if(size+n>limit&&batch.length){out.push(batch);batch=[];size=0;}batch.push(row);size+=n;}if(batch.length)out.push(batch);return out;}
function insert(env:V2Env,owner:string,generation:string,rows:ReturnType<typeof entries>):Statement[]{const {db}=storage(env);return chunks(rows).map(group=>db.prepare('INSERT OR REPLACE INTO record_entities(owner,generation,kind,id,payload) SELECT ?,?,json_extract(value,\'$.kind\'),json_extract(value,\'$.id\'),json_extract(value,\'$.payload\') FROM json_each(?)').bind(owner,generation,JSON.stringify(group)));}
export async function account(env:V2Env,owner:string){return storage(env).db.prepare('SELECT * FROM record_accounts WHERE owner=?').bind(owner).first<Account>();}
export async function createAccount(env:V2Env,owner:string,email:string){
 const {db}=storage(env),generation=crypto.randomUUID(),state=emptyState(at());
 const rows=entries(state);
 await db.batch([db.prepare('INSERT OR IGNORE INTO record_accounts(owner,email,generation,next_run) VALUES(?,?,?,?)').bind(owner,email,generation,Date.now()+86400000),...chunks(rows).map(group=>db.prepare('INSERT OR IGNORE INTO record_entities(owner,generation,kind,id,payload) SELECT ?,?,json_extract(value,\'$.kind\'),json_extract(value,\'$.id\'),json_extract(value,\'$.payload\') FROM json_each(?) WHERE EXISTS(SELECT 1 FROM record_accounts WHERE owner=? AND generation=?)').bind(owner,generation,JSON.stringify(group),owner,generation))]);
 return (await account(env,owner))!;
}
export async function readState(env:V2Env,owner:string,generation?:string){
 const {db}=storage(env),rows=await db.prepare('SELECT a.*,e.kind,e.payload FROM record_accounts a LEFT JOIN record_entities e ON e.owner=a.owner AND e.generation=COALESCE(?,a.generation) WHERE a.owner=?').bind(generation??null,owner).all<Account&{kind:Table|null;payload:string|null}>();
 if(!rows.results.length)problem(404,'Konto fehlt.');const a=rows.results[0];if(a.disabled)problem(403,'Dieses Konto ist gesperrt.');
 const state={schema_version:1,...Object.fromEntries(tables.map(t=>[t,[]]))} as State;
 for(const row of rows.results)if(row.kind&&row.payload){if(!tables.includes(row.kind))problem(500,'Ungültiger Datensatztyp.');(state[row.kind] as any[]).push(JSON.parse(row.payload));}
 validateState(state);return {state,account:a};
}
export async function writeState(env:V2Env,a:Account,before:State,next:State,generation=a.generation){
 validateState(next);for(const t of tables)if(next[t].length>10000)problem(413,'Mehr als 10.000 Einträge in einem Bereich.');
 const {db}=storage(env),nonce=crypto.randomUUID(),previous=new Map(entries(before).map(row=>[row.kind+'\0'+row.id,row.payload])),updated=entries(next),keys=new Set(updated.map(row=>row.kind+'\0'+row.id));
 const changed=updated.filter(row=>previous.get(row.kind+'\0'+row.id)!==row.payload),removed=entries(before).filter(row=>!keys.has(row.kind+'\0'+row.id));
 if(!changed.length&&!removed.length)return a.revision;
 const statements=[db.prepare('INSERT INTO record_guards(nonce,owner,expected) VALUES(?,?,?)').bind(nonce,a.owner,a.revision)];
 for(const group of chunks(removed))statements.push(db.prepare('DELETE FROM record_entities WHERE owner=? AND generation=? AND EXISTS(SELECT 1 FROM json_each(?) WHERE json_extract(value,\'$.kind\')=record_entities.kind AND json_extract(value,\'$.id\')=record_entities.id)').bind(a.owner,generation,JSON.stringify(group)));
 statements.push(...insert(env,a.owner,generation,changed),db.prepare('UPDATE record_accounts SET revision=revision+1 WHERE owner=?').bind(a.owner),db.prepare('DELETE FROM record_guards WHERE nonce=?').bind(nonce));
 try{await db.batch(statements);}catch(error){if(String(error).includes('RECORD_CONFLICT'))problem(409,'Konflikt: Die Akte wurde inzwischen geändert. Bitte neu laden und denselben Vorgang prüfen.','CONFLICT');throw error;}return a.revision+1;
}
export async function replaceGeneration(env:V2Env,a:Account,state:State,generation:string){
 validateState(state);
 // Staging generations are immutable until uploaded originals are attached. Never replace active rows.
 await storage(env).db.batch(insert(env,a.owner,generation,entries(state)));
}
export async function objectRecord(env:V2Env,owner:string,id:string){return storage(env).db.prepare('SELECT * FROM record_objects WHERE owner=? AND id=?').bind(owner,id).first<import('./types').StoredObject>();}
export function stateEqual(a:State,b:State){return canonical(a)===canonical(b);}
