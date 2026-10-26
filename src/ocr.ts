import type {ReceiptPage} from '../shared/receipt';
import {MAX_FILE} from '../shared/logic';
export type OcrOptions={signal:AbortSignal;onProgress:(message:string)=>void;forceOcr?:boolean};
export type ReadReceiptResult={pages:ReceiptPage[];previews:string[]};
const abort=()=>new DOMException('Texterkennung abgebrochen.','AbortError');
export async function readReceipt(file:File,options:OcrOptions):Promise<ReadReceiptResult>{
 if(file.size>MAX_FILE||!file.size)throw Error('Bitte einen Beleg mit maximal 4 MiB auswählen.');
 const {signal,onProgress}=options;let worker:Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>|null=null,loadingTask:any=null;const previews:string[]=[],pages:ReceiptPage[]=[];
 function check(){if(signal.aborted)throw abort();}
 async function recognize(canvas:HTMLCanvasElement,page:number){check();if(!worker){onProgress('Texterkennung und Sprachdaten werden geladen …');const {createWorker}=await import('tesseract.js');check();worker=await createWorker(['deu','eng'],1,{workerPath:new URL('ocr/worker.min.js',document.baseURI).href,corePath:new URL('ocr/core/',document.baseURI).href,langPath:new URL('ocr/lang',document.baseURI).href,logger:m=>{if(!signal.aborted)onProgress('Seite '+page+' · '+(m.status==='recognizing text'?'Text wird erkannt':m.status==='loading language traineddata'?'Sprachdaten werden geladen':'Texterkennung wird vorbereitet')+' … '+Math.round((m.progress??0)*100)+' %');}});await worker.setParameters({preserve_interword_spaces:'1'});}
  check();const response=await worker.recognize(canvas);check();return response.data.text;
 }
 function stop(){void worker?.terminate();void loadingTask?.destroy();}signal.addEventListener('abort',stop,{once:true});
 async function preview(canvas:HTMLCanvasElement){const ratio=Math.min(1,1000/canvas.width),small=document.createElement('canvas');small.width=Math.round(canvas.width*ratio);small.height=Math.round(canvas.height*ratio);small.getContext('2d')!.drawImage(canvas,0,0,small.width,small.height);const blob=await new Promise<Blob>((resolve,reject)=>small.toBlob(b=>b?resolve(b):reject(Error('Belegvorschau nicht verfügbar.')),'image/jpeg',.82));check();previews.push(URL.createObjectURL(blob));}
 try{check();if(file.type==='application/pdf'||/\.pdf$/i.test(file.name)){
   onProgress('PDF wird geöffnet …');const pdfjs=await import('pdfjs-dist'),workerUrl=await import('pdfjs-dist/build/pdf.worker.min.mjs?url');pdfjs.GlobalWorkerOptions.workerSrc=workerUrl.default;
   loadingTask=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),useWorkerFetch:false,standardFontDataUrl:new URL('ocr/pdf/standard_fonts/',document.baseURI).href,cMapUrl:new URL('ocr/pdf/cmaps/',document.baseURI).href,cMapPacked:true,wasmUrl:new URL('ocr/pdf/wasm/',document.baseURI).href});loadingTask.onPassword=()=>{void loadingTask.destroy();};const pdf=await loadingTask.promise;check();
   for(let n=1;n<=pdf.numPages;n++){check();onProgress('Seite '+n+' von '+pdf.numPages+' wird gelesen …');const page=await pdf.getPage(n),content=await page.getTextContent(),rows=new Map<number,{x:number;text:string;width:number}[]>();
    for(const item of content.items){if(!('str' in item))continue;const y=Math.round(item.transform[5]/3)*3,items=rows.get(y)??[];items.push({x:item.transform[4],text:item.str,width:item.width});rows.set(y,items);}
    const text=[...rows.entries()].sort((a,b)=>b[0]-a[0]).map(([,row])=>{let last=0;return row.sort((a,b)=>a.x-b.x).map((item,i)=>{const gap=i&&item.x-last>9?'  ':i?' ':'';last=item.x+item.width;return gap+item.text;}).join('');}).join('\n');
    const viewport0=page.getViewport({scale:1}),scale=Math.min(2.5,Math.sqrt(5e6/(viewport0.width*viewport0.height))),viewport=page.getViewport({scale}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);const context=canvas.getContext('2d');if(!context)throw Error('Belegvorschau nicht verfügbar.');await page.render({canvasContext:context,canvas,viewport}).promise;check();await preview(canvas);
    const direct=!options.forceOcr&&text.replace(/\s/g,'').length>=80;pages.push({page:n,text:direct?text:await recognize(canvas,n),method:direct?'text':'ocr'});canvas.width=0;canvas.height=0;page.cleanup();
   }
  }else if(/^image\/(jpeg|png|webp)$/.test(file.type)){const bitmap=await createImageBitmap(file);try{const scale=Math.min(1,Math.sqrt(5e6/(bitmap.width*bitmap.height))),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const context=canvas.getContext('2d')!;context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);await preview(canvas);pages.push({page:1,text:await recognize(canvas,1),method:'ocr'});canvas.width=0;canvas.height=0;}finally{bitmap.close();}}
  else throw Error('Erlaubt sind PDF, JPG, PNG und WebP.');
  check();return {pages,previews};
 }catch(error){previews.forEach(URL.revokeObjectURL);if(signal.aborted)throw abort();if(error instanceof Error&&/password|destroyed/i.test(error.message))throw Error('Die PDF ist geschützt oder konnte nicht geöffnet werden. Bitte ungeschützt bereitstellen oder Angaben manuell erfassen.');throw error;
 }finally{signal.removeEventListener('abort',stop);if(worker)await (worker as import('tesseract.js').Worker).terminate().catch(()=>{});if(loadingTask)await loadingTask.destroy().catch(()=>{});}
}
