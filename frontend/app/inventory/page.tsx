/**
 * frontend/app/inventory/page.tsx
 * Updated: Card View + Table View toggle, image upload with preview,
 * auto-refresh after add, success/error toasts, image_url support.
 */
"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { inventory as inventoryApi } from "@/lib/api";
import type { Product } from "@/lib/api";

const INR = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const daysUntil = (d?: string) => {
  if (!d) return null;
  const diff = new Date(d).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

// ── Product Form Modal ─────────────────────────────────────────────────────────
function ProductFormModal({ product, onClose, onSaved }: {
  product: Product | null; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: product?.name ?? "",
    category: product?.category ?? "",
    brand: product?.brand ?? "",
    sku: product?.sku ?? "",
    unit: product?.unit ?? "piece",
    cost_price: product?.cost_price ?? 0,
    selling_price: product?.selling_price ?? 0,
    quantity: product?.quantity ?? 0,
    reorder_point: product?.reorder_point ?? 10,
    expiry_date: product?.expiry_date ?? "",
    image_url: product?.image_url ?? "",
  });
  const [saving, setSaving]       = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>(product?.image_url ?? "");
  const [dragOver, setDragOver]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const margin = form.selling_price > 0
    ? (((form.selling_price - form.cost_price) / form.selling_price) * 100).toFixed(1) : "0";

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image too large — max 5MB"); return; }
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setUploading(true);
    try {
      const imageUrl = await inventoryApi.uploadProductImage(file);
      setForm((f) => ({ ...f, image_url: imageUrl }));
      setPreviewUrl(imageUrl);
      toast.success("Image uploaded");
    } catch (e: unknown) {
      setPreviewUrl("");
      toast.error(e instanceof Error ? e.message : "Image upload failed");
    } finally { setUploading(false); }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Product name is required"); return; }
    if (form.selling_price <= 0) { toast.error("Selling price must be greater than 0"); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        expiry_date: form.expiry_date || undefined,
        category: form.category || undefined,
        brand: form.brand || undefined,
        sku: form.sku || undefined,
        image_url: form.image_url || undefined,
      };
      if (product) {
        await inventoryApi.updateProduct(product.id, payload);
        toast.success(`"${form.name}" updated successfully`);
      } else {
        await inventoryApi.createProduct(payload);
        toast.success(`"${form.name}" added to inventory`);
      }
      onSaved();
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed. Please try again.");
    } finally { setSaving(false); }
  };

  return (
    <div style={{
      position:"fixed",inset:0,background:"rgba(0,0,0,.75)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:50,backdropFilter:"blur(4px)",
    }} onClick={(e)=>e.target===e.currentTarget&&onClose()}>
      <div style={{
        background:"#0d1526",border:"1px solid #1a2540",borderRadius:16,
        padding:28,width:580,maxWidth:"95vw",maxHeight:"92vh",overflowY:"auto",
      }}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:22}}>
          <h2 style={{fontFamily:"var(--font-serif)",fontSize:22,color:"#e2e8f0"}}>
            {product ? "Edit Product" : "Add Product"}
          </h2>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#64748b",fontSize:22,cursor:"pointer"}}>✕</button>
        </div>

        {/* Image upload area */}
        <div style={{marginBottom:18}}>
          <label style={{fontSize:11,color:"#64748b",fontFamily:"var(--font-mono)",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:".06em"}}>
            Product Image (optional)
          </label>
          <div
            style={{
              border:`2px dashed ${dragOver?"#f59e0b":"#1a2540"}`,borderRadius:10,
              padding:20,textAlign:"center",cursor:"pointer",transition:"all .15s",
              background:dragOver?"rgba(245,158,11,.05)":"rgba(255,255,255,.02)",
              display:"flex",alignItems:"center",gap:16,flexWrap:"wrap",justifyContent:"center",
            }}
            onDragOver={(e)=>{e.preventDefault();setDragOver(true)}}
            onDragLeave={()=>setDragOver(false)}
            onDrop={(e)=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files[0];if(f)handleImageUpload(f);}}
            onClick={()=>fileRef.current?.click()}
          >
            {previewUrl ? (
              <img src={previewUrl} alt="preview" style={{width:80,height:80,objectFit:"cover",borderRadius:8,border:"1px solid #1a2540"}}
                onError={()=>setPreviewUrl("")}/>
            ) : (
              <div style={{fontSize:36}}>📷</div>
            )}
            <div>
              <div style={{fontSize:13,color:"#e2e8f0",marginBottom:3}}>
                {uploading ? "Uploading…" : previewUrl ? "Click or drag to replace" : "Drag & drop or click to upload"}
              </div>
              <div style={{fontSize:11,color:"#64748b",fontFamily:"var(--font-mono)"}}>JPEG, PNG, WebP · max 5MB</div>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}}
            onChange={(e)=>{const f=e.target.files?.[0];if(f)handleImageUpload(f);}}/>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          {/* Full width name */}
          <div style={{gridColumn:"1/-1"}}>
            <label style={{fontSize:11,color:"#64748b",fontFamily:"var(--font-mono)",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:".06em"}}>Product Name *</label>
            <input value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})}
              style={{width:"100%",background:"#111f36",border:"1px solid #1a2540",borderRadius:7,padding:"9px 12px",color:"#e2e8f0",fontSize:13,outline:"none"}}
              placeholder="e.g. Aashirvaad Atta 5kg"/>
          </div>

          {[{l:"Category",k:"category",ph:"Grocery"},{l:"Brand",k:"brand",ph:"Aashirvaad"},{l:"SKU",k:"sku",ph:"SKU-001"},{l:"Unit",k:"unit",ph:"piece"}].map(({l,k,ph})=>(
            <div key={k}>
              <label style={{fontSize:11,color:"#64748b",fontFamily:"var(--font-mono)",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:".06em"}}>{l}</label>
              <input value={(form as Record<string,string|number>)[k] as string}
                onChange={(e)=>setForm({...form,[k]:e.target.value})}
                placeholder={ph}
                style={{width:"100%",background:"#111f36",border:"1px solid #1a2540",borderRadius:7,padding:"9px 12px",color:"#e2e8f0",fontSize:13,outline:"none"}}/>
            </div>
          ))}

          {[{l:"Cost Price (₹)",k:"cost_price"},{l:"Selling Price (₹)",k:"selling_price"},{l:"Opening Stock",k:"quantity"},{l:"Reorder Point",k:"reorder_point"}].map(({l,k})=>(
            <div key={k}>
              <label style={{fontSize:11,color:"#64748b",fontFamily:"var(--font-mono)",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:".06em"}}>{l}</label>
              <input type="number" value={(form as Record<string,string|number>)[k] as number}
                onChange={(e)=>setForm({...form,[k]:parseFloat(e.target.value)||0})}
                style={{width:"100%",background:"#111f36",border:"1px solid #1a2540",borderRadius:7,padding:"9px 12px",color:"#e2e8f0",fontSize:13,fontFamily:"var(--font-mono)",outline:"none"}}/>
            </div>
          ))}

          <div>
            <label style={{fontSize:11,color:"#64748b",fontFamily:"var(--font-mono)",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:".06em"}}>Expiry Date</label>
            <input type="date" value={form.expiry_date}
              onChange={(e)=>setForm({...form,expiry_date:e.target.value})}
              style={{width:"100%",background:"#111f36",border:"1px solid #1a2540",borderRadius:7,padding:"9px 12px",color:"#e2e8f0",fontSize:13,outline:"none",colorScheme:"dark"}}/>
          </div>

          <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",background:"rgba(74,222,128,.08)",borderRadius:8,border:"1px solid rgba(74,222,128,.2)"}}>
            <span style={{fontSize:11,color:"#64748b",fontFamily:"var(--font-mono)"}}>Margin</span>
            <span style={{fontSize:24,fontFamily:"var(--font-serif)",color:"#4ade80"}}>{margin}%</span>
          </div>
        </div>

        <div style={{display:"flex",gap:10,marginTop:24,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{padding:"9px 20px",borderRadius:8,border:"1px solid #1a2540",background:"transparent",color:"#e2e8f0",cursor:"pointer",fontFamily:"var(--font-sans)"}}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving||uploading} style={{padding:"9px 22px",borderRadius:8,border:"none",background:"#f59e0b",color:"#000",cursor:saving?"not-allowed":"pointer",fontWeight:600,fontFamily:"var(--font-sans)",opacity:saving?0.7:1}}>
            {saving?"Saving…":product?"Save Changes":"Add Product"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function InventoryPage() {
  const [products, setProducts]       = useState<Product[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [stockFilter, setStockFilter] = useState<"all"|"low"|"out">("all");
  const [viewMode, setViewMode]       = useState<"table"|"card">("table");
  const [editProduct, setEditProduct] = useState<Product|null|undefined>(undefined);
  const [adjustingId, setAdjustingId] = useState<string|null>(null);
  const searchRef = useRef<ReturnType<typeof setTimeout>>();

  const loadProducts = useCallback(async (q=search, sf=stockFilter) => {
    setLoading(true);
    try {
      const data = await inventoryApi.listProducts({ q:q||undefined, stock_filter:sf==="all"?undefined:sf, limit:200 });
      setProducts(data);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load products");
    } finally { setLoading(false); }
  }, [search, stockFilter]);

  useEffect(()=>{ loadProducts(); },[]);

  const handleSearch = (v:string) => {
    setSearch(v);
    clearTimeout(searchRef.current);
    searchRef.current = setTimeout(()=>loadProducts(v,stockFilter),300);
  };

  const handleFilterChange = (f: typeof stockFilter) => {
    setStockFilter(f);
    loadProducts(search,f);
  };

  const handleAdjustStock = async (product:Product, delta:number) => {
    setAdjustingId(product.id);
    try {
      const updated = await inventoryApi.adjustStock(product.id, delta);
      setProducts((prev)=>prev.map((p)=>p.id===product.id?updated:p));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Stock adjustment failed");
    } finally { setAdjustingId(null); }
  };

  const handleDelete = async (product:Product) => {
    if(!confirm(`Delete "${product.name}"?`)) return;
    try {
      await inventoryApi.deleteProduct(product.id);
      setProducts((prev)=>prev.filter((p)=>p.id!==product.id));
      toast.success("Product removed");
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
  };

  const totalValue = products.reduce((s,p)=>s+p.cost_price*p.quantity,0);
  const lowCount   = products.filter((p)=>p.is_low_stock&&!p.is_out_of_stock).length;
  const outCount   = products.filter((p)=>p.is_out_of_stock).length;

  // Product initials avatar
  const initials = (name:string) => name.split(" ").map((w)=>w[0]).join("").slice(0,2).toUpperCase();
  const avatarColor = (name:string) => {
    const colors = ["#f59e0b","#4ade80","#60a5fa","#f87171","#a78bfa","#fb923c"];
    return colors[name.charCodeAt(0)%colors.length];
  };

  return (
    <>
      <style>{`
        .inv-page{padding:28px;min-height:100vh}
        .inv-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:22px}
        .btn{padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:none;transition:all .15s;font-family:var(--font-sans)}
        .btn-p{background:#f59e0b;color:#000}.btn-p:hover{background:#fbbf24}
        .btn-g{background:#0d1526;color:#e2e8f0;border:1px solid #1a2540}.btn-g:hover{border-color:#f59e0b;color:#f59e0b}
        .controls{display:flex;gap:12px;margin-bottom:18px;flex-wrap:wrap;align-items:center}
        .search-input{flex:1;min-width:200px;background:#0d1526;border:1px solid #1a2540;border-radius:8px;padding:9px 14px;color:#e2e8f0;font-size:13px;outline:none}
        .search-input:focus{border-color:#f59e0b}
        .filter-tabs,.view-tabs{display:flex;gap:4px}
        .ftab{padding:7px 14px;border-radius:7px;font-size:12px;font-family:var(--font-mono);cursor:pointer;border:1px solid #1a2540;background:transparent;color:#64748b;transition:all .15s}
        .ftab.on{background:#f59e0b;color:#000;border-color:#f59e0b}
        .stats-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
        .stat-card{background:#0d1526;border:1px solid #1a2540;border-radius:10px;padding:14px 16px}
        .stat-label{font-size:10px;color:#64748b;font-family:var(--font-mono);text-transform:uppercase;letter-spacing:.06em}
        .stat-val{font-family:var(--font-serif);font-size:26px;margin-top:2px}
        /* Table */
        .table-wrap{background:#0d1526;border:1px solid #1a2540;border-radius:12px;overflow:hidden}
        table{width:100%;border-collapse:collapse}
        th{font-size:10px;font-family:var(--font-mono);text-transform:uppercase;letter-spacing:.06em;color:#64748b;padding:11px 14px;text-align:left;border-bottom:1px solid #1a2540;background:#111f36;font-weight:500}
        td{padding:10px 14px;font-size:13px;border-bottom:1px solid #1a2540;vertical-align:middle}
        tr:last-child td{border-bottom:none}
        tr:hover td{background:rgba(255,255,255,.02)}
        .stock-adj{display:flex;align-items:center;gap:6px}
        .adj-btn{width:24px;height:24px;border-radius:5px;border:1px solid #1a2540;background:transparent;color:#e2e8f0;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:all .15s}
        .adj-btn:hover{border-color:#f59e0b;color:#f59e0b}
        /* Card view */
        .card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
        .product-card{background:#0d1526;border:1px solid #1a2540;border-radius:12px;overflow:hidden;transition:all .2s;cursor:default}
        .product-card:hover{border-color:#243050;transform:translateY(-2px)}
        .product-img{width:100%;height:130px;object-fit:cover;background:#111f36}
        .product-avatar{width:100%;height:130px;display:flex;align-items:center;justify-content:center;font-family:var(--font-serif);font-size:36px;color:#fff}
        .product-card-body{padding:14px}
        .product-card-name{font-size:13px;font-weight:600;color:#e2e8f0;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .product-card-cat{font-size:10px;color:#64748b;font-family:var(--font-mono);margin-bottom:10px}
        .product-card-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
        .stock-badge{padding:2px 8px;border-radius:4px;font-size:10px;font-family:var(--font-mono);font-weight:600}
        .card-actions{display:flex;gap:6px;margin-top:10px}
        .sk{background:linear-gradient(90deg,#0d1526 25%,#1a2540 50%,#0d1526 75%);background-size:200% 100%;animation:sh 1.4s infinite;border-radius:8px}
        @keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}
        @media(max-width:640px){.stats-strip{grid-template-columns:1fr 1fr}.inv-page{padding:16px}}
      `}</style>

      <div className="inv-page">
        <div className="inv-header">
          <div>
            <h1 style={{fontFamily:"var(--font-serif)",fontSize:26,color:"#e2e8f0"}}>Inventory</h1>
            <p style={{fontSize:12,color:"#64748b",fontFamily:"var(--font-mono)",marginTop:3}}>
              {products.length} products · {lowCount} low stock · {outCount} out
            </p>
          </div>
          <div style={{display:"flex",gap:10}}>
            <button className="btn btn-g" onClick={()=>loadProducts()}>↻ Refresh</button>
            <button className="btn btn-p" onClick={()=>setEditProduct(null)}>+ Add Product</button>
          </div>
        </div>

        {/* Controls */}
        <div className="controls">
          <input className="search-input" placeholder="🔍  Search by name, SKU, or barcode…"
            value={search} onChange={(e)=>handleSearch(e.target.value)}/>
          <div className="filter-tabs">
            {(["all","low","out"] as const).map((f)=>(
              <button key={f} className={`ftab${stockFilter===f?" on":""}`} onClick={()=>handleFilterChange(f)}>
                {f==="all"?"All":f==="low"?"⚠ Low":"✕ Out"}
              </button>
            ))}
          </div>
          <div className="view-tabs">
            {(["table","card"] as const).map((v)=>(
              <button key={v} className={`ftab${viewMode===v?" on":""}`} onClick={()=>setViewMode(v)}>
                {v==="table"?"☰ Table":"⊞ Cards"}
              </button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="stats-strip">
          {[
            {label:"Total SKUs",     val:products.length,  color:"#e2e8f0"},
            {label:"Low Stock",      val:lowCount,         color:"#f59e0b"},
            {label:"Out of Stock",   val:outCount,         color:"#f87171"},
            {label:"Inventory Value",val:INR(totalValue),  color:"#4ade80"},
          ].map((s)=>(
            <div key={s.label} className="stat-card">
              <div className="stat-label">{s.label}</div>
              <div className="stat-val" style={{color:s.color}}>{s.val}</div>
            </div>
          ))}
        </div>

        {/* Table view */}
        {viewMode === "table" && (
          <div className="table-wrap">
            {loading ? (
              <div style={{padding:20}}>{Array.from({length:6}).map((_,i)=><div key={i} className="sk" style={{height:44,marginBottom:8}}/>)}</div>
            ) : products.length === 0 ? (
              <div style={{textAlign:"center",padding:"48px 0",color:"#64748b",fontSize:14}}>
                <div style={{fontSize:40,marginBottom:12}}>📦</div>
                No products found.{" "}
                <button onClick={()=>setEditProduct(null)} style={{color:"#f59e0b",background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>
                  Add your first product
                </button>
              </div>
            ) : (
              <table>
                <thead>
                  <tr><th>Product</th><th>Category</th><th>Cost</th><th>Price</th><th>Margin</th><th>Stock</th><th>Expiry</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {products.map((p)=>{
                    const expDays = daysUntil(p.expiry_date);
                    const stockColor = p.is_out_of_stock?"#f87171":p.is_low_stock?"#f59e0b":"#e2e8f0";
                    return (
                      <tr key={p.id}>
                        <td>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            {p.image_url
                              ? <img src={p.image_url} alt={p.name} style={{width:32,height:32,borderRadius:6,objectFit:"cover",border:"1px solid #1a2540"}} onError={(e)=>(e.currentTarget.style.display="none")}/>
                              : <div style={{width:32,height:32,borderRadius:6,background:avatarColor(p.name),display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#000",flexShrink:0}}>{initials(p.name)}</div>
                            }
                            <div>
                              <div style={{fontWeight:500,color:"#e2e8f0"}}>{p.name}</div>
                              {p.sku&&<div style={{fontSize:10,color:"#64748b",fontFamily:"var(--font-mono)"}}>SKU: {p.sku}</div>}
                            </div>
                          </div>
                        </td>
                        <td style={{color:"#64748b",fontSize:12}}>{p.category??"—"}</td>
                        <td style={{fontFamily:"var(--font-mono)",fontSize:12}}>{INR(p.cost_price)}</td>
                        <td style={{fontFamily:"var(--font-mono)",fontSize:12,color:"#f59e0b"}}>{INR(p.selling_price)}</td>
                        <td style={{fontFamily:"var(--font-mono)",fontSize:12,color:p.margin_pct<10?"#f87171":"#4ade80"}}>{p.margin_pct.toFixed(1)}%</td>
                        <td>
                          <div className="stock-adj">
                            <button className="adj-btn" onClick={()=>handleAdjustStock(p,-1)} disabled={adjustingId===p.id}>−</button>
                            <span style={{fontFamily:"var(--font-mono)",fontSize:13,color:stockColor,minWidth:28,textAlign:"center"}}>{p.quantity}</span>
                            <button className="adj-btn" onClick={()=>handleAdjustStock(p,1)} disabled={adjustingId===p.id}>+</button>
                            {p.is_out_of_stock&&<span style={{fontSize:10,color:"#f87171",fontFamily:"var(--font-mono)"}}>OUT</span>}
                            {p.is_low_stock&&!p.is_out_of_stock&&<span style={{fontSize:10,color:"#f59e0b",fontFamily:"var(--font-mono)"}}>LOW</span>}
                          </div>
                        </td>
                        <td style={{fontSize:11,fontFamily:"var(--font-mono)"}}>
                          {expDays===null?"—":expDays<=0?<span style={{color:"#f87171"}}>EXPIRED</span>:expDays<=30?<span style={{color:"#fb923c"}}>{expDays}d left</span>:<span style={{color:"#64748b"}}>{p.expiry_date}</span>}
                        </td>
                        <td>
                          <div style={{display:"flex",gap:6}}>
                            <button className="btn btn-g" style={{padding:"5px 10px",fontSize:11}} onClick={()=>setEditProduct(p)}>Edit</button>
                            <button className="btn" style={{padding:"5px 10px",fontSize:11,background:"rgba(248,113,113,.1)",color:"#f87171",border:"1px solid rgba(248,113,113,.2)"}} onClick={()=>handleDelete(p)}>Del</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Card view */}
        {viewMode === "card" && (
          loading ? (
            <div className="card-grid">{Array.from({length:8}).map((_,i)=><div key={i} className="sk" style={{height:260}}/>)}</div>
          ) : products.length === 0 ? (
            <div style={{textAlign:"center",padding:"48px 0",color:"#64748b"}}>
              <div style={{fontSize:40,marginBottom:12}}>📦</div>
              <p>No products yet. <button onClick={()=>setEditProduct(null)} style={{color:"#f59e0b",background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>Add your first product</button></p>
            </div>
          ) : (
            <div className="card-grid">
              {products.map((p)=>(
                <div key={p.id} className="product-card">
                  {p.image_url
                    ? <img className="product-img" src={p.image_url} alt={p.name} onError={(e)=>{e.currentTarget.style.display="none";(e.currentTarget.nextElementSibling as HTMLElement)!.style.display="flex"}}/>
                    : null
                  }
                  <div className="product-avatar" style={{background:avatarColor(p.name),display:p.image_url?"none":"flex"}}>
                    {initials(p.name)}
                  </div>
                  <div className="product-card-body">
                    <div className="product-card-name" title={p.name}>{p.name}</div>
                    <div className="product-card-cat">{p.category??"Uncategorised"}</div>
                    <div className="product-card-row">
                      <span style={{fontFamily:"var(--font-mono)",fontSize:14,color:"#f59e0b",fontWeight:600}}>{INR(p.selling_price)}</span>
                      <span className="stock-badge" style={{
                        background:p.is_out_of_stock?"rgba(248,113,113,.15)":p.is_low_stock?"rgba(245,158,11,.15)":"rgba(74,222,128,.1)",
                        color:p.is_out_of_stock?"#f87171":p.is_low_stock?"#f59e0b":"#4ade80",
                      }}>
                        {p.is_out_of_stock?"OUT":p.is_low_stock?"LOW":p.quantity+" units"}
                      </span>
                    </div>
                    <div style={{fontSize:11,color:"#64748b",fontFamily:"var(--font-mono)"}}>Margin: {p.margin_pct.toFixed(1)}%</div>
                    <div className="card-actions">
                      <button className="btn btn-g" style={{flex:1,padding:"6px",fontSize:11}} onClick={()=>setEditProduct(p)}>Edit</button>
                      <button className="btn" style={{padding:"6px 10px",fontSize:11,background:"rgba(248,113,113,.1)",color:"#f87171",border:"1px solid rgba(248,113,113,.2)"}} onClick={()=>handleDelete(p)}>Del</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {editProduct !== undefined && (
        <ProductFormModal
          product={editProduct}
          onClose={()=>setEditProduct(undefined)}
          onSaved={()=>{ loadProducts(); }}
        />
      )}
    </>
  );
}
