import {vi} from 'vitest';
let serial=0;
export class MockSheet{
 rows:any[][]=[];formulas:string[][]=[];name:string;id=++serial;maxRows=1000;
 constructor(name:string){this.name=name;}setFrozenRows(){}getSheetId(){return this.id;}getMaxRows(){return this.maxRows;}
 getDataRange(){return {getValues:()=>this.rows.map(r=>[...r]),getFormulas:()=>this.formulas.length?this.formulas:this.rows.map(r=>r.map(()=>''))};}
 getRange(_cell:string){return {getValue:()=>this.rows[0]?.[0]??''};}
}
class MockBook{
 id='sheet-'+(++serial);sheets=[new MockSheet('Sheet1')];
 getId(){return this.id;}insertSheet(name:string){const s=new MockSheet(name);this.sheets.push(s);return s;}getSheetByName(name:string){return this.sheets.find(s=>s.name===name);}getSheets(){return this.sheets;}deleteSheet(s:MockSheet){this.sheets=this.sheets.filter(x=>x!==s);}setSpreadsheetTimeZone(){}
}
const iterator=(a:any[])=>{let i=0;return {hasNext:()=>i<a.length,next:()=>a[i++]};};
class MockFile{
 id='file-'+(++serial);trashed=false;created=new Date();
 constructor(public name:string,public bytes:number[]=[],public mime='application/octet-stream',public parent=''){}
 getId(){return this.id;}getName(){return this.name;}getOwner(){return {getEmail:()=> 'owner@example.invalid'};}getSharingAccess(){return 'PRIVATE';}getEditors(){return [];}getViewers(){return [];}getBlob(){return {getBytes:()=>this.bytes};}getDateCreated(){return this.created;}getParents(){return iterator([{getId:()=>this.parent}]);}setTrashed(v:boolean){this.trashed=v;}makeCopy(name:string,folder:MockFolder){return folder.createFile({name,bytes:this.bytes,mime:this.mime});}
}
class MockFolder extends MockFile{
 files:MockFile[]=[];folders:MockFolder[]=[];
 constructor(name:string,public registry:Map<string,MockFile>){super(name);registry.set(this.id,this);}createFile(b:any){const f=new MockFile(b.name,b.bytes,b.mime,this.id);this.files.push(f);this.registry.set(f.id,f);return f;}getFilesByName(n:string){return iterator(this.files.filter(f=>f.name===n&&!f.trashed));}getFiles(){return iterator(this.files.filter(f=>!f.trashed));}getFoldersByName(n:string){return iterator(this.folders.filter(f=>f.name===n));}createFolder(n:string){const f=new MockFolder(n,this.registry);this.folders.push(f);return f;}
}
export function setupGoogleMock(){
 const properties:Record<string,string>={OWNER_EMAIL:'owner@example.invalid',REMINDER_EMAIL:'owner@example.invalid',APP_ORIGIN:'https://vehicle.example.invalid'},books=new Map<string,MockBook>(),files=new Map<string,MockFile>();
 const context={active:'owner@example.invalid',effective:'owner@example.invalid',failBatch:false,failMail:false,quota:100,triggers:[] as any[],mail:[] as any[],batches:[] as any[],books,files,properties};
 vi.stubGlobal('Session',{getActiveUser:()=>({getEmail:()=>context.active}),getEffectiveUser:()=>({getEmail:()=>context.effective})});
 vi.stubGlobal('PropertiesService',{getScriptProperties:()=>({getProperty:(k:string)=>properties[k]??null,setProperty:(k:string,v:string)=>properties[k]=v,setProperties:(p:object)=>Object.assign(properties,p),deleteProperty:(k:string)=>delete properties[k]})});
 vi.stubGlobal('DriveApp',{Access:{PRIVATE:'PRIVATE'},createFolder:(n:string)=>new MockFolder(n,files),getFileById:(id:string)=>files.get(id),getFolderById:(id:string)=>files.get(id)});
 vi.stubGlobal('SpreadsheetApp',{create:()=>{const book=new MockBook();books.set(book.id,book);const file=new MockFile('book');file.id=book.id;files.set(book.id,file);return book;},openById:(id:string)=>books.get(id)});
 vi.stubGlobal('Sheets',{Spreadsheets:{batchUpdate:(payload:any,id:string)=>{context.batches.push(payload);if(context.failBatch)throw Error('Simulierter atomarer Commit-Fehler');const book=books.get(id)!;for(const r of payload.requests){if(r.appendDimension){book.sheets.find(s=>s.id===r.appendDimension.sheetId)!.maxRows+=r.appendDimension.length;continue;}const u=r.updateCells,sheet=book.sheets.find(s=>s.id===u.range.sheetId)!;sheet.rows=u.rows.map((r:any)=>r.values.map((v:any)=>v.userEnteredValue.numberValue??v.userEnteredValue.boolValue??v.userEnteredValue.stringValue));}}}});
 vi.stubGlobal('Utilities',{getUuid:()=>String(++serial).padStart(36,'0'),base64Decode:(s:string)=>Array.from(Buffer.from(s,'base64')),base64Encode:(b:number[])=>Buffer.from(b).toString('base64'),newBlob:(b:any,mime:string,name:string)=>({name,mime,bytes:Array.from(typeof b==='string'?Buffer.from(b):b)}),formatDate:()=> '2026-10-17'});
 vi.stubGlobal('LockService',{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})});
 vi.stubGlobal('ScriptApp',{getProjectTriggers:()=>context.triggers,deleteTrigger:(t:any)=>context.triggers=context.triggers.filter(x=>x!==t),newTrigger:(handler:string)=>{const chain:any={timeBased:()=>chain,everyDays:()=>chain,atHour:()=>chain,inTimezone:()=>chain,create:()=>context.triggers.push({getHandlerFunction:()=>handler})};return chain;}});
 vi.stubGlobal('MailApp',{getRemainingDailyQuota:()=>context.quota,sendEmail:(m:any)=>{context.mail.push(m);if(context.failMail)throw Error('Abbruch nach Versandbeginn');}});
 return context;
}
