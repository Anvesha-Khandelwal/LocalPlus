/**
 * frontend/app/ocr/page.tsx
 * Invoice scanner — drag & drop or click to upload a bill/invoice image.
 * Extracted items shown in an editable table before confirming import.
 */
"use client";
import { useState, useCallback } from "react";
import { toast } from "sonner";
import { ocr as ocrApi } from "@/lib/api";

interface ExtractedItem { name: string; quantity: number | null; unit_cost: number | null }

export default function OCRPage() {
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [items, setItems]       = useState<ExtractedItem[]>([]);
  const [supplierName, setSupplierName] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [done, setDone]         = useState<{ created: number; updated: number } | null>(null);

  const processFile = async (file: File) => {
    setProcessing(true); setItems([]); setDone(null);
    try {
      const result = await ocrApi.processInvoice(file);
      setItems(result.extracted_items ?? []);
      setSupplierName(result.supplier_name ?? "");
      if ((result.extracted_items ?? []).length === 0) toast.warning("No items detected. Try a clearer image.");
      else toast.success(`${result.extracted_items.length} items extracted`);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "OCR failed"); }
    finally { setProcessing(false); }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, []);

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const result = await ocrApi.confirmImport({ items, supplier_name: supplierName || undefined });
      setDone(result); setItems([]);
      toast.success(`Imported: ${result.created} new, ${result.updated} updated`);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Import failed"); }
    finally { setConfirming(false); }
  };

  return (
    <>
      <style>{`
        .ocr-page{padding:28px;max-width:800px}
        .drop-zone{border:2px dashed var(--border);border-radius:14px;padding:60px 20px;text-align:center;cursor:pointer;transition:all .15s}
        .drop-zone.drag{border-color:var(--amber);background:rgba(245,158,11,.06)}
        .drop-zone:hover{border-color:var(--border-2)}
        .item-row{display:grid;grid-template-columns:1fr 80px 100px 30px;gap:8px;margin-bottom:8px;align-items:center}
        .edit-input{background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:6px 8px;color:var(--text);font-size:12px;font-family:var(--font-mono);outline:none;width:100%}
        .edit-input:focus{border-color:var(--amber)}
        .confirm-btn{padding:11px 24px;border-radius:10px;border:none;background:var(--amber);color:#000;font-size:14px;font-weight:700;cursor:pointer;margin-top:16px}
        .confirm-btn:disabled{opacity:.6;cursor:not-allowed}
      `}</style>
      <div className="ocr-page">
        <h1 style={{fontFamily:"var(--font-serif)",fontSize:26,marginBottom:4}}>📄 Scan Invoice</h1>
        <p style={{fontSize:12,color:"var(--muted)",fontFamily:"var(--font-mono)",marginBottom:24}}>Upload a supplier bill to auto-import stock into inventory</p>

        {/* Drop zone */}
        {items.length === 0 && !processing && !done && (
          <div className={`drop-zone${dragging?" drag":""}`}
            onDragOver={(e)=>{e.preventDefault();setDragging(true)}}
            onDragLeave={()=>setDragging(false)}
            onDrop={handleDrop}
            onClick={()=>{const i=document.createElement("input");i.type="file";i.accept="image/*,application/pdf";i.onchange=(e)=>{const f=(e.target as HTMLInputElement).files?.[0];if(f)processFile(f)};i.click()}}
          >
            <div style={{fontSize:48,marginBottom:12}}>📸</div>
            <p style={{fontSize:15,color:"var(--text)",marginBottom:6}}>Drop invoice image here</p>
            <p style={{fontSize:12,color:"var(--muted)"}}>or click to browse · JPEG, PNG, PDF supported</p>
          </div>
        )}

        {processing && (
          <div style={{textAlign:"center",padding:"60px 0"}}>
            <div style={{width:40,height:40,border:"3px solid var(--border)",borderTopColor:"var(--amber)",borderRadius:"50%",animation:"spin .8s linear infinite",margin:"0 auto 16px"}}/>
            <p style={{color:"var(--muted)",fontSize:13}}>Running OCR and extracting products…</p>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}

        {/* Extracted items editor */}
        {items.length > 0 && (
          <div>
            <div style={{fontSize:13,fontWeight:600,marginBottom:12,color:"var(--text)"}}>Review extracted items ({items.length})</div>
            <div style={{marginBottom:12}}>
              <label style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)",display:"block",marginBottom:4}}>Supplier Name</label>
              <input className="edit-input" style={{width:280}} value={supplierName} onChange={(e)=>setSupplierName(e.target.value)} placeholder="Auto-detected or enter manually" />
            </div>
            <div className="item-row" style={{marginBottom:6}}>
              {["Product Name","Qty","Unit Cost (₹)",""].map(h=><div key={h} style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)",textTransform:"uppercase",letterSpacing:".06em"}}>{h}</div>)}
            </div>
            {items.map((item, i) => (
              <div key={i} className="item-row">
                <input className="edit-input" value={item.name} onChange={(e)=>setItems(prev=>prev.map((it,idx)=>idx===i?{...it,name:e.target.value}:it))} />
                <input className="edit-input" type="number" value={item.quantity??""} onChange={(e)=>setItems(prev=>prev.map((it,idx)=>idx===i?{...it,quantity:parseInt(e.target.value)||null}:it))} />
                <input className="edit-input" type="number" value={item.unit_cost??""} onChange={(e)=>setItems(prev=>prev.map((it,idx)=>idx===i?{...it,unit_cost:parseFloat(e.target.value)||null}:it))} />
                <button onClick={()=>setItems(prev=>prev.filter((_,idx)=>idx!==i))} style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:16}}>✕</button>
              </div>
            ))}
            <button className="confirm-btn" onClick={handleConfirm} disabled={confirming}>
              {confirming?"Importing…":`✓ Import ${items.length} items to Inventory`}
            </button>
            <button onClick={()=>setItems([])} style={{marginLeft:10,padding:"11px 16px",borderRadius:10,border:"1px solid var(--border)",background:"transparent",color:"var(--muted)",cursor:"pointer",fontSize:13}}>Cancel</button>
          </div>
        )}

        {done && (
          <div style={{background:"rgba(74,222,128,.1)",border:"1px solid rgba(74,222,128,.3)",borderRadius:12,padding:24,textAlign:"center"}}>
            <div style={{fontSize:40,marginBottom:10}}>✅</div>
            <p style={{color:"var(--green)",fontSize:15,fontWeight:600}}>{done.created} products created · {done.updated} products updated</p>
            <button onClick={()=>setDone(null)} style={{marginTop:14,padding:"9px 20px",borderRadius:8,border:"1px solid var(--border)",background:"transparent",color:"var(--text)",cursor:"pointer"}}>Scan another invoice</button>
          </div>
        )}
      </div>
    </>
  );
}
