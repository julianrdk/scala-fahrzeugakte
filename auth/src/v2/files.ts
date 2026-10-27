import {MAX_FILE,verifySignature} from '../../../shared/logic';
import type {UploadFile} from '../../../shared/types';
import {objectRecord} from './store';
import {problem,storage,type V2Env,type StoredObject} from './types';
export async function sha(bytes:Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes))),n=>n.toString(16).padStart(2,'0')).join('');}
export async function putObject(env:V2Env,owner:string,id:string,bytes:Uint8Array,mime:string,name:string,role:StoredObject['role']){
 const {db,files}=storage(env),digest=await sha(bytes);let row=await objectRecord(env,owner,id);
 if(row&&role==='thumbnail'&&row.status==='ready'){const head=await files.head(row.object_key);if(head?.size===row.size&&head.customMetadata?.sha256===row.sha256)return row;}
 if(row&&(row.sha256!==digest||row.size!==bytes.length||row.mime!==mime))problem(409,'Dateivorgang gehört zu anderen Daten.');
 if(!row){const key=owner+'/'+role+'/'+id;try{await db.prepare('INSERT OR IGNORE INTO record_objects(owner,id,object_key,sha256,size,mime,name,role,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(owner,id,key,digest,bytes.length,mime,name,role,'reserved',new Date().toISOString()).run();}catch(error){if(String(error).includes('STORAGE_QUOTA'))problem(413,'Speichergrenze erreicht. Weitere Uploads sind derzeit gesperrt; deine vorhandenen Daten bleiben erhalten.','STORAGE_QUOTA');throw error;}row=await objectRecord(env,owner,id);}
 if(!row)problem(500,'Dateireservierung fehlt.');
 const head=await files.head(row.object_key);
 if(!head||head.size!==row.size||head.customMetadata?.sha256!==digest)await files.put(row.object_key,bytes,{httpMetadata:{contentType:mime},customMetadata:{sha256:digest},sha256:Uint8Array.from(digest.match(/../g)!,x=>parseInt(x,16)).buffer});
 await db.prepare("UPDATE record_objects SET status='ready' WHERE owner=? AND id=?").bind(owner,id).run();return {...row,status:'ready' as const};
}
export async function readObject(env:V2Env,owner:string,id:string){const record=await objectRecord(env,owner,id);if(!record||record.status!=='ready')problem(404,'Originaldatei oder Vorschau fehlt.');const body=await storage(env).files.get(record.object_key);if(!body)problem(404,'Gespeicherte Datei fehlt.');const bytes=new Uint8Array(await body.arrayBuffer());if(bytes.length!==record.size||await sha(bytes)!==record.sha256)problem(409,'Dateiprüfsumme stimmt nicht. Original bitte aus einer Sicherung prüfen.');return {bytes,record};}
export async function uploadParts(request:Request){
 const length=Number(request.headers.get('Content-Length'));if(length>MAX_FILE+256*1024)problem(413,'Die Datei darf höchstens 4 MiB groß sein.');
 const reader=request.body?.getReader();if(!reader)problem(400,'Datei fehlt.');let total=0;const buffers:Uint8Array[]=[];for(;;){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>MAX_FILE+256*1024){await reader.cancel();problem(413,'Dateiupload ist zu groß.');}buffers.push(value);}
 const data=await new Response(new Blob(buffers.map(b=>new Uint8Array(b).buffer)),{headers:{'Content-Type':request.headers.get('Content-Type')??''}}).formData();const original=data.get('original'),thumbnail=data.get('thumbnail');
 if(!(original instanceof File)||!original.size||original.size>MAX_FILE)problem(400,'Bitte ein Original mit maximal 4 MiB auswählen.');
 if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(original.type)||original.name.length>500)problem(400,'Dateityp oder Dateiname ungültig.');
 const bytes=new Uint8Array(await original.arrayBuffer());verifySignature(bytes,original.type);const digest=await sha(bytes);if(data.get('sha256')!==digest)problem(400,'Originalprüfsumme stimmt nicht.');
 let thumb:Uint8Array|undefined;if(thumbnail instanceof File){if(!original.type.startsWith('image/')||thumbnail.type!=='image/webp'||thumbnail.size>128*1024||!thumbnail.size)problem(400,'Bildvorschau ungültig.');thumb=new Uint8Array(await thumbnail.arrayBuffer());verifySignature(thumb,'image/webp');if(!webpSize(thumb))problem(400,'Bildvorschau darf maximal 640 Pixel Kantenlänge haben.');}
 if(original.type.startsWith('image/')&&!thumb)problem(400,'Für ein Bild fehlt die kleine Vorschau. Bitte erneut auswählen.');
 const operation=String(data.get('operation_id')??'');if(!/^[\w-]{8,100}$/.test(operation))problem(400,'Vorgangskennung ungültig.');
 return {original,bytes,digest,thumb,operation,restoreId:String(data.get('restore_id')??'')};
}
// WebP dimensions from the bounded RIFF header, without decoding untrusted images on the server.
export function webpSize(b:Uint8Array){let width=0,height=0;for(let p=12;p+8<=b.length;){const tag=String.fromCharCode(...b.slice(p,p+4)),length=new DataView(b.buffer,b.byteOffset+p+4,4).getUint32(0,true),o=p+8;if(o+length>b.length)return false;
  if(tag==='VP8X'&&length>=10){if(b[o]&2)return false;width=1+b[o+4]+(b[o+5]<<8)+(b[o+6]<<16);height=1+b[o+7]+(b[o+8]<<8)+(b[o+9]<<16);break;}
  if(tag==='VP8 '&&length>=10&&b[o+3]===157&&b[o+4]===1&&b[o+5]===42){width=(b[o+6]+(b[o+7]<<8))&16383;height=(b[o+8]+(b[o+9]<<8))&16383;break;}
  if(tag==='VP8L'&&length>=5&&b[o]===47){width=1+b[o+1]+((b[o+2]&63)<<8);height=1+(b[o+2]>>6)+(b[o+3]<<2)+((b[o+4]&15)<<10);break;}p=o+length+(length%2);
 }return width>0&&height>0&&width<=640&&height<=640;}
export function originalUpload(row:StoredObject,operation:string):UploadFile&{id:string;drive_id:string;operation_id:string}{return {id:'upload-'+row.sha256,operation_id:operation,drive_id:row.id,source_filename:row.name,mime:row.mime,size:row.size,sha256:row.sha256,base64:''};}
