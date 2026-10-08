let libraryPromise=null, ocrPromise=null;
function loadPDF(){libraryPromise ||= import('/vendor/pdf.mjs').then(lib=>{lib.GlobalWorkerOptions.workerSrc='/vendor/pdf.worker.mjs';return lib;});return libraryPromise;}
function loadOCR(){ocrPromise ||= new Promise((resolve,reject)=>{if(globalThis.Tesseract)return resolve(globalThis.Tesseract);const script=document.createElement('script');script.src='/vendor/tesseract.min.js';script.onload=()=>resolve(globalThis.Tesseract);script.onerror=()=>reject(new Error('Could not load OCR. Check your connection and try again.'));document.head.append(script);});return ocrPromise;}
function pageText(content){const lines=[];let line=[],y=null;for(const item of content.items){if(!('str' in item))continue;const nextY=item.transform?.[5];if(y!==null&&nextY!==undefined&&Math.abs(nextY-y)>3&&line.length){lines.push(line.join(' '));line=[];}if(item.str.trim())line.push(item.str);y=nextY;if(item.hasEOL&&line.length){lines.push(line.join(' '));line=[];y=null;}}if(line.length)lines.push(line.join(' '));return lines.join('\n');}

export async function readSupervisorPDF(file,onProgress=()=>{}){
  if(!file?.size||file.size>10*1024*1024)throw new Error('Choose a PDF up to 10 MB for the free hosting version.');
  const lib=await loadPDF();
  const loadingTask=lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,standardFontDataUrl:'/vendor/pdfjs-fonts/',wasmUrl:'/vendor/pdfjs-wasm/'});const pdf=await loadingTask.promise;
  let worker=null;const pages=[];let usedOCR=false;
  try {
    if(pdf.numPages<1||pdf.numPages>40)throw new Error('BEO PDFs must contain 1–40 pages.');
    for(let i=1;i<=pdf.numPages;i++){
      onProgress(`Reading page ${i} of ${pdf.numPages}…`);
      const page=await pdf.getPage(i);let text=pageText(await page.getTextContent());
      if(text.replace(/\s/g,'').length<40){
        usedOCR=true;
        onProgress(`Reading scanned page ${i} of ${pdf.numPages}…`);
        if(!worker){const tesseract=await loadOCR();worker=await tesseract.createWorker('eng',1,{workerPath:'/vendor/tesseract-worker.min.js',corePath:'/vendor/tesseract-core',langPath:'/vendor/tessdata',workerBlobURL:false,logger:message=>{if(message.status==='recognizing text')onProgress(`Scanned page ${i}: ${Math.round(message.progress*100)}%…`);}});}
        const viewport=page.getViewport({scale:1.7});const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;const result=await worker.recognize(canvas);text=result.data.text;canvas.width=0;canvas.height=0;
      }
      pages.push(`--- Page ${i} ---\n${text}`);page.cleanup();
    }
    const text=pages.join('\n\n');if(text.length>2000000)throw new Error('Extracted text is too large. Split this PDF into one BEO.');return {text,pages:pdf.numPages,ocr:usedOCR};
  } finally {await worker?.terminate();await loadingTask.destroy();}
}
