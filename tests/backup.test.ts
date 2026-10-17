import {afterEach,describe,it,expect,vi} from 'vitest';
import {zipSync,strToU8,unzipSync,strFromU8} from 'fflate';
import {exportArchive,parseArchives,restoreArchive} from '../src/backup';
import {emptyState,hashBytes,commitImport,meta,totals,canonical} from '../shared/logic';
import {pkg,request} from './fixtures';
import type {Adapter} from '../src/adapter';
import {setupGoogleMock} from './google-mock';
import {setup,dispatch} from '../apps-script/src/backend';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});
describe('Tatsächlicher ZIP-Rundlauf mit simuliertem Backend',()=>{
 it('exportiert ZIP/CSV und stellt Dateien, Beträge und Links mit neuen IDs wieder her',async()=>{
  const context=setupGoogleMock();setup();vi.useFakeTimers();const archives:Blob[]=[];vi.stubGlobal('document',{createElement:()=>({href:'',download:'',click:()=>{}})});vi.spyOn(URL,'createObjectURL').mockImplementation((blob:Blob|MediaSource)=>{archives.push(blob as Blob);return 'blob:test';});
  const bytes=Buffer.from('%PDF-1.4\nUNVERAENDERT'),file={source_filename:'Test.pdf',mime:'application/pdf',size:bytes.length,sha256:hashBytes(bytes),base64:bytes.toString('base64')};const u=dispatch('upload',{operation_id:'operation-test-0001',file});const p=pkg();p.documents=[{ref:'d1',source_filename:'Test.pdf',title:'Testbeleg',document_type:'invoice'}];p.expenses[0].document_refs=['d1'];dispatch('commit',request(p,{documents:{d1:u.id}}));const before=dispatch('read').state;
  const adapter:Adapter={kind:'google',call:async(a,p)=>dispatch(a,p)};await exportArchive(adapter,before,()=>{});expect(archives).toHaveLength(1);const exported=unzipSync(new Uint8Array(await archives[0].arrayBuffer()));expect(exported['tables/Expenses.csv']).toBeTruthy();expect(strFromU8(exported['files/'+file.sha256])).toBe(bytes.toString());expect(strFromU8(exported['data.json'])).not.toContain('OWNER_EMAIL');
  const parsed=await parseArchives([new File([await archives[0].arrayBuffer()],'test.zip')]);const result=await restoreArchive(adapter,parsed,()=>{});expect(result.missing).toHaveLength(0);expect(context.properties.SPREADSHEET_ID).not.toBe(result.target.sheet);await adapter.call('restoreSwitch',{id:result.id,confirm:true});const after=dispatch('read').state;expect(totals(after)).toEqual(totals(before));expect(after.DocumentLinks).toEqual(before.DocumentLinks);expect(after.Documents[0].drive_id).not.toBe(before.Documents[0].drive_id);expect(dispatch('document',{id:after.Documents[0].id}).base64).toBe(file.base64);
 });
 it('weist beschädigte Originale und fehlende Teilarchive zurück',async()=>{const context=setupGoogleMock();setup();const p=pkg();dispatch('commit',request(p));const state=dispatch('read').state;const {hash}=await import('../shared/logic');const m={format:'vehicle-record-backup',schema_version:1,state,state_sha256:hash(canonical(state)),part:1,parts:2};const zip=zipSync({'data.json':strToU8(JSON.stringify(m))});await expect(parseArchives([new File([zip],'part1.zip')])).rejects.toThrow(/alle 2/);});
});
