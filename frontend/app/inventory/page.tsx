/**
 * frontend/app/inventory/page.tsx
 *
 * Full inventory management page.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────┐
 *   │ Header: title + Add Product + Import CSV buttons  │
 *   ├──────────────────────────────────────────────────┤
 *   │ Search bar │ Category filter │ Stock filter tabs  │
 *   ├──────────────────────────────────────────────────┤
 *   │ Stats strip: total / low / out / value           │
 *   ├──────────────────────────────────────────────────┤
 *   │ Product table (paginated, inline stock edit)     │
 *   └──────────────────────────────────────────────────┘
 *
 * Features:
 *   - Debounced search (300ms) hits /api/v1/inventory/products?q=
 *   - Stock-level colour coding: amber = low, red = out
 *   - Inline +/- stock adjustment (calls PUT /products/{id}/stock)
 *   - ProductFormModal for create/edit
 *   - Soft delete with confirmation
 *   - Expiry date warning badge (within 30 days)
 */
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { inventory as inventoryApi } from "@/lib/api";
import type { Product } from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

const INR = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const daysUntil = (d?: string) => {
  if (!d) return null;
  const diff = new Date(d).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

// ── ProductFormModal ──────────────────────────────────────────────────────────

function ProductFormModal({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: product?.name ?? "",
    category: product?.category ?? "",
    brand: product?.brand ?? "",
    sku: product?.sku ?? "",
    barcode: product?.barcode ?? "",
    unit: product?.unit ?? "piece",
    cost_price: product?.cost_price ?? 0,
    selling_price: product?.selling_price ?? 0,
    quantity: product?.quantity ?? 0,
    reorder_point: product?.reorder_point ?? 10,
    expiry_date: product?.expiry_date ?? "",
  });
  const [saving, setSaving] = useState(false);

  const margin = form.selling_price > 0
    ? (((form.selling_price - form.cost_price) / form.selling_price) * 100).toFixed(1)
    : "0";

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Product name is required"); return; }
    if (form.selling_price <= 0) { toast.error("Selling price must be > 0"); return; }
    setSaving(true);
    try {
      if (product) {
        await inventoryApi.updateProduct(product.id, form);
        toast.success("Product updated");
      } else {
        await inventoryApi.createProduct(form);
        toast.success("Product created");
      }
      onSaved();
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 14, padding: 28, width: 560, maxWidth: "95vw",
        maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>
            {product ? "Edit Product" : "Add Product"}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {[
            { label: "Product Name *", key: "name", full: true },
            { label: "Category", key: "category" },
            { label: "Brand", key: "brand" },
            { label: "SKU", key: "sku" },
            { label: "Barcode", key: "barcode" },
            { label: "Unit (piece/kg/litre)", key: "unit" },
          ].map(({ label, key, full }) => (
            <div key={key} style={full ? { gridColumn: "1/-1" } : {}}>
              <label style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)", display: "block", marginBottom: 4 }}>{label}</label>
              <input
                value={(form as Record<string, string | number>)[key] as string}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                style={{
                  width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)",
                  borderRadius: 7, padding: "8px 10px", color: "var(--text)", fontSize: 13,
                  fontFamily: "var(--font-sans)", outline: "none",
                }}
              />
            </div>
          ))}

          {[
            { label: "Cost Price (₹)", key: "cost_price", type: "number" },
            { label: "Selling Price (₹)", key: "selling_price", type: "number" },
            { label: "Opening Stock", key: "quantity", type: "number" },
            { label: "Reorder Point", key: "reorder_point", type: "number" },
          ].map(({ label, key }) => (
            <div key={key}>
              <label style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)", display: "block", marginBottom: 4 }}>{label}</label>
              <input
                type="number"
                value={(form as Record<string, string | number>)[key] as number}
                onChange={(e) => setForm({ ...form, [key]: parseFloat(e.target.value) || 0 })}
                style={{
                  width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)",
                  borderRadius: 7, padding: "8px 10px", color: "var(--text)", fontSize: 13,
                  fontFamily: "var(--font-mono)", outline: "none",
                }}
              />
            </div>
          ))}

          <div>
            <label style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)", display: "block", marginBottom: 4 }}>Expiry Date</label>
            <input type="date" value={form.expiry_date}
              onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
              style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 10px", color: "var(--text)", fontSize: 13, outline: "none", colorScheme: "dark" }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "rgba(74,222,128,.08)", borderRadius: 8, border: "1px solid rgba(74,222,128,.2)" }}>
            <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>Margin</span>
            <span style={{ fontSize: 22, fontFamily: "var(--font-serif)", color: "var(--green)" }}>{margin}%</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text)", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: "var(--amber)", color: "#000", cursor: saving ? "not-allowed" : "pointer", fontWeight: 600, fontFamily: "var(--font-sans)", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Saving…" : product ? "Save Changes" : "Add Product"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const [products, setProducts]         = useState<Product[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [stockFilter, setStockFilter]   = useState<"all" | "low" | "out">("all");
  const [editProduct, setEditProduct]   = useState<Product | null | undefined>(undefined); // undefined=closed, null=create new
  const [adjustingId, setAdjustingId]   = useState<string | null>(null);
  const searchRef = useRef<ReturnType<typeof setTimeout>>();

  const loadProducts = useCallback(async (q = search, sf = stockFilter) => {
    setLoading(true);
    try {
      const data = await inventoryApi.listProducts({ q: q || undefined, stock_filter: sf === "all" ? undefined : sf, limit: 100 });
      setProducts(data);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [search, stockFilter]);

  useEffect(() => { loadProducts(); }, []);

  const handleSearch = (v: string) => {
    setSearch(v);
    clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => loadProducts(v, stockFilter), 300);
  };

  const handleFilterChange = (f: typeof stockFilter) => {
    setStockFilter(f);
    loadProducts(search, f);
  };

  const handleAdjustStock = async (product: Product, delta: number) => {
    setAdjustingId(product.id);
    try {
      const updated = await inventoryApi.adjustStock(product.id, delta);
      setProducts((prev) => prev.map((p) => p.id === product.id ? updated : p));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Stock adjustment failed");
    } finally {
      setAdjustingId(null);
    }
  };

  const handleDelete = async (product: Product) => {
    if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    try {
      await inventoryApi.deleteProduct(product.id);
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
      toast.success("Product removed");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const totalValue   = products.reduce((s, p) => s + p.cost_price * p.quantity, 0);
  const lowCount     = products.filter((p) => p.is_low_stock && !p.is_out_of_stock).length;
  const outCount     = products.filter((p) => p.is_out_of_stock).length;

  return (
    <>
      <style>{`
        .inv-page { padding: 28px; min-height: 100vh; }
        .inv-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; }
        .btn { padding:8px 16px; border-radius:8px; font-size:13px; font-family:var(--font-sans); font-weight:600; cursor:pointer; border:none; transition:all .15s; }
        .btn-p { background:var(--amber); color:#000; }
        .btn-g { background:var(--surface); color:var(--text); border:1px solid var(--border); }
        .btn-g:hover { border-color:var(--amber); color:var(--amber); }
        .controls { display:flex; gap:12px; margin-bottom:18px; flex-wrap:wrap; align-items:center; }
        .search-input { flex:1; min-width:200px; background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:9px 14px; color:var(--text); font-size:13px; font-family:var(--font-sans); outline:none; }
        .search-input:focus { border-color:var(--amber); }
        .filter-tabs { display:flex; gap:4px; }
        .ftab { padding:7px 14px; border-radius:7px; font-size:12px; font-family:var(--font-mono); cursor:pointer; border:1px solid var(--border); background:transparent; color:var(--muted); transition:all .15s; }
        .ftab.on { background:var(--amber); color:#000; border-color:var(--amber); }
        .stats-strip { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:20px; }
        .stat-card { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:14px 16px; }
        .stat-label { font-size:10px; color:var(--muted); font-family:var(--font-mono); text-transform:uppercase; letter-spacing:.06em; }
        .stat-val { font-family:var(--font-serif); font-size:26px; margin-top:2px; }
        .table-wrap { background:var(--surface); border:1px solid var(--border); border-radius:12px; overflow:hidden; }
        table { width:100%; border-collapse:collapse; }
        th { font-size:10px; font-family:var(--font-mono); text-transform:uppercase; letter-spacing:.06em; color:var(--muted); padding:11px 14px; text-align:left; border-bottom:1px solid var(--border); font-weight:500; background:var(--surface-2); }
        td { padding:11px 14px; font-size:13px; border-bottom:1px solid var(--border); vertical-align:middle; }
        tr:last-child td { border-bottom:none; }
        tr:hover td { background:rgba(255,255,255,.02); }
        .stock-adj { display:flex; align-items:center; gap:6px; }
        .adj-btn { width:24px; height:24px; border-radius:5px; border:1px solid var(--border); background:transparent; color:var(--text); cursor:pointer; font-size:14px; display:flex; align-items:center; justify-content:center; transition:all .15s; }
        .adj-btn:hover { border-color:var(--amber); color:var(--amber); }
        .qty-val { font-family:var(--font-mono); font-size:13px; min-width:32px; text-align:center; }
        .sk { background:linear-gradient(90deg,var(--surface) 25%,var(--border) 50%,var(--surface) 75%); background-size:200% 100%; animation:sh 1.4s infinite; border-radius:6px; }
        @keyframes sh { 0%{background-position:200% 0}100%{background-position:-200% 0} }
      `}</style>

      <div className="inv-page">
        {/* Header */}
        <div className="inv-header">
          <div>
            <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 26 }}>Inventory</h1>
            <p style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-mono)", marginTop: 3 }}>
              {products.length} products · last updated just now
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-g" onClick={() => toast.info("CSV import coming soon!")}>📥 Import CSV</button>
            <button className="btn btn-p" onClick={() => setEditProduct(null)}>+ Add Product</button>
          </div>
        </div>

        {/* Search + filters */}
        <div className="controls">
          <input
            className="search-input"
            placeholder="🔍  Search by name, SKU, or barcode…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
          <div className="filter-tabs">
            {(["all", "low", "out"] as const).map((f) => (
              <button key={f} className={`ftab${stockFilter === f ? " on" : ""}`} onClick={() => handleFilterChange(f)}>
                {f === "all" ? "All" : f === "low" ? "⚠ Low" : "✕ Out"}
              </button>
            ))}
          </div>
        </div>

        {/* Stats strip */}
        <div className="stats-strip">
          {[
            { label: "Total SKUs",     val: products.length,       color: "var(--text)"  },
            { label: "Low Stock",      val: lowCount,              color: "var(--amber)" },
            { label: "Out of Stock",   val: outCount,              color: "var(--red)"   },
            { label: "Inventory Value",val: INR(totalValue),       color: "var(--green)" },
          ].map((s) => (
            <div key={s.label} className="stat-card">
              <div className="stat-label">{s.label}</div>
              <div className="stat-val" style={{ color: s.color }}>{s.val}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="table-wrap">
          {loading ? (
            <div style={{ padding: 20 }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="sk" style={{ height: 44, marginBottom: 8 }} />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: "var(--muted)", fontSize: 14 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
              No products found. <button onClick={() => setEditProduct(null)} style={{ color: "var(--amber)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Add your first product</button>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Cost</th>
                  <th>Price</th>
                  <th>Margin</th>
                  <th>Stock</th>
                  <th>Expiry</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const expiryDays = daysUntil(p.expiry_date);
                  const stockColor = p.is_out_of_stock ? "var(--red)" : p.is_low_stock ? "var(--amber)" : "var(--text)";
                  return (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: 500, color: "var(--text)" }}>{p.name}</div>
                        {p.sku && <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>SKU: {p.sku}</div>}
                      </td>
                      <td style={{ color: "var(--muted)", fontSize: 12 }}>{p.category ?? "—"}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{INR(p.cost_price)}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--amber)" }}>{INR(p.selling_price)}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: p.margin_pct < 10 ? "var(--red)" : "var(--green)" }}>
                        {p.margin_pct.toFixed(1)}%
                      </td>
                      <td>
                        <div className="stock-adj">
                          <button className="adj-btn" onClick={() => handleAdjustStock(p, -1)} disabled={adjustingId === p.id}>−</button>
                          <span className="qty-val" style={{ color: stockColor }}>{p.quantity}</span>
                          <button className="adj-btn" onClick={() => handleAdjustStock(p, 1)} disabled={adjustingId === p.id}>+</button>
                          {p.is_out_of_stock && <span style={{ fontSize: 10, color: "var(--red)", fontFamily: "var(--font-mono)" }}>OUT</span>}
                          {p.is_low_stock && !p.is_out_of_stock && <span style={{ fontSize: 10, color: "var(--amber)", fontFamily: "var(--font-mono)" }}>LOW</span>}
                        </div>
                      </td>
                      <td style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>
                        {expiryDays === null ? "—" : expiryDays <= 0 ? <span style={{ color: "var(--red)" }}>EXPIRED</span>
                          : expiryDays <= 30 ? <span style={{ color: "var(--orange)" }}>{expiryDays}d left</span>
                          : <span style={{ color: "var(--muted)" }}>{p.expiry_date}</span>}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn btn-g" style={{ padding: "5px 10px", fontSize: 11 }} onClick={() => setEditProduct(p)}>Edit</button>
                          <button className="btn" style={{ padding: "5px 10px", fontSize: 11, background: "rgba(248,113,113,.1)", color: "var(--red)", border: "1px solid rgba(248,113,113,.2)" }} onClick={() => handleDelete(p)}>Del</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Product form modal */}
      {editProduct !== undefined && (
        <ProductFormModal
          product={editProduct}
          onClose={() => setEditProduct(undefined)}
          onSaved={loadProducts}
        />
      )}
    </>
  );
}
