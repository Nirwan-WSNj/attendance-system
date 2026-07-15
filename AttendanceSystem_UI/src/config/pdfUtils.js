export function sanitizePdfFilePart(value) {
    return String(value ?? "")
        .trim()
        .replace(/[<>:"/\\|?*]+/g, "-")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^[._-]+|[._-]+$/g, "");
}

export function buildPdfFileName(...parts) {
    const cleanParts = parts.map(sanitizePdfFilePart).filter(Boolean);
    return `${cleanParts.join("_") || "attendance-report"}.pdf`;
}

export function pdfDocumentTitle(fileName) {
    return sanitizePdfFilePart(String(fileName ?? "attendance-report.pdf").replace(/\.pdf$/i, "")) || "attendance-report";
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function pdfPreparingHtml(fileName, message = "Preparing PDF preview...") {
    const documentTitle = pdfDocumentTitle(fileName);
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(documentTitle)}</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f1f5f9;font-family:Arial,sans-serif;color:#334155}.loading-card{width:min(420px,calc(100vw - 32px));padding:32px;text-align:center;background:#fff;border:1px solid #dbe3ec;border-radius:14px;box-shadow:0 18px 44px rgba(15,23,42,.12);animation:previewIn .22s ease-out}.spinner{width:34px;height:34px;margin:0 auto 16px;border:3px solid #dbeafe;border-top-color:#2563eb;border-radius:50%;animation:spin .8s linear infinite}.message{font-weight:700;color:#0f172a}.file{margin-top:8px;font-size:12px;color:#64748b;overflow-wrap:anywhere}@keyframes spin{to{transform:rotate(360deg)}}@keyframes previewIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
</style></head><body><div class="loading-card"><div class="spinner"></div><div class="message">${escapeHtml(message)}</div><div class="file">${escapeHtml(fileName)}</div></div></body></html>`;
}

export function printLifecycleScript(fileName, { statusId = "pdfStatus", closeDelay = 450 } = {}) {
    const documentTitle = JSON.stringify(pdfDocumentTitle(fileName));
    const safeStatusId = JSON.stringify(statusId);
    const delay = Math.max(0, Number(closeDelay) || 0);

    return `<script>
(function(){
  var printStarted=false;
  var closeScheduled=false;
  var printMedia=window.matchMedia ? window.matchMedia("print") : null;
  var wasPrinting=false;
  var statusId=${safeStatusId};
  var reportTitle=${documentTitle};
  function setStatus(text){
    var node=document.getElementById(statusId);
    if(node) node.textContent=text;
  }
  function finishPrint(){
    if(!printStarted || closeScheduled) return;
    closeScheduled=true;
    setStatus("Print dialog closed - closing preview...");
    window.setTimeout(function(){ window.close(); },${delay});
  }
  function invokePrint(){
    window.requestAnimationFrame(function(){
      window.requestAnimationFrame(function(){ window.print(); });
    });
  }
  window.startPdfPrint=function(){
    if(printStarted) return;
    printStarted=true;
    document.title=reportTitle;
    setStatus("Opening print dialog...");
    window.focus();
    var waits=[];
    if(document.fonts && document.fonts.ready) waits.push(document.fonts.ready);
    Array.prototype.forEach.call(document.images || [],function(img){
      if(!img.complete) waits.push(new Promise(function(resolve){img.addEventListener("load",resolve,{once:true});img.addEventListener("error",resolve,{once:true});}));
    });
    var assetsReady=Promise.all(waits);
    var timeout=new Promise(function(resolve){window.setTimeout(resolve,2000);});
    Promise.race([assetsReady,timeout]).then(invokePrint).catch(invokePrint);
  };
  window.closePdfPreview=function(){ window.close(); };
  window.addEventListener("beforeprint",function(){
    if(!printStarted) printStarted=true;
    document.title=reportTitle;
    setStatus("Print dialog open...");
  });
  window.addEventListener("afterprint",finishPrint);
  if(printMedia){
    var onPrintChange=function(event){
      if(event.matches){ wasPrinting=true; }
      else if(wasPrinting){ finishPrint(); }
    };
    if(printMedia.addEventListener) printMedia.addEventListener("change",onPrintChange);
    else if(printMedia.addListener) printMedia.addListener(onPrintChange);
  }
  window.addEventListener("load",function(){ setStatus("Ready"); });
})();
</script>`;
}
