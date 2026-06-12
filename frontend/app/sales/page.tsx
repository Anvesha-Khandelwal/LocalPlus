/**
 * frontend/app/sales/page.tsx
 * POS (Point of Sale) + transaction history in one page.
 *
 * Left panel  — product search + cart (POS terminal)
 * Right panel — today's stats + recent transactions
 *
 * Flow:
 *   1. Search products by name/barcode
 *   2. Click product → adds to cart (uses Zustand cart state)
 *   3. Adjust quantities, set discount, choose payment method
 *   4. Click "Record Sale" → POST /api/v1/sales/transaction
 *   5. On success: print receipt (browser print), clear cart, refresh stats
 */
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { inventory as inventoryApi, sales as salesApi } from "@/lib/api";
import { useCart, useStore } from "@/lib/store";
import type { Product } from "@/lib/api";

const INR = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export default function SalesPage() {
  const [searchQ, setSearchQ]         = useState("");
  const [results, setResults]         = useState<Product[]>([]);
  const [searching, setSearching]     = useState(false);
  const [recording, setRecording]     = useState(false);
  const [todayStats, setTodayStats]   = useState<{ revenue: number; profit: number; units_sold: number; transaction_count: number } | null>(null);
  const [recentTxns, setRecentTxns]   = useState<{ transaction_id: string; total: number; created_at?: string }[]>([]);

  const cart         = useCart();
  const addToCart    = useStore((s) => s.addToCart);
  const removeFromCart  = useStore((s) => s.removeFromCart);
  const updateQty    = useStore((s) => s.updateQuantity);
  const clearCart    = useStore((s) => s.clearCart);
  const setDiscount  = useStore((s) => s.setDiscount);
  const setPayment   = useStore((s) => s.setPaymentMethod);
  const searchRef    = useRef<ReturnType<typeof setTimeout>>();

  // Load today's stats
  useEffect(() => {
    salesApi.dashboard().then(setTodayStats).catch(() => {});
  }, []);

  // Debounced product search
  const handleSearch = (v: string) => {
    setSearchQ(v);
    clearTimeout(searchRef.current);
    if (!v.trim()) { setResults([]); return; }
    searchRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await inventoryApi.listProducts({ q: v, limit: 8 });
        setResults(data);
      } finally {
        setSearching(false);
      }
    }, 250);
  };

  const handleAddProduct = (p: Product) => {
    if (p.is_out_of_stock) { toast.error(`${p.name} is out of stock`); return; }
    addToCart({ id: p.id, name: p.name, selling_price: p.selling_price, cost_price: p.cost_price });
    setSearchQ(""); setResults([]);
    toast.success(`${p.name} added`, { duration: 1500 });
  };

  const handleRecordSale = async () => {
    if (cart.items.length === 0) { toast.error("Cart is empty"); return; }
    setRecording(true);
    try {
      const result = await salesApi.recordTransaction({
        items: cart.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
        discount_amount: cart.discount,
        payment_method: cart.paymentMethod,
      });
      clearCart();
      setRecentTxns((prev) => [{ transaction_id: result.transaction_id, total: result.total }, ...prev.slice(0, 9)]);
      setTodayStats(await salesApi.dashboard());
      toast.success(`Sale recorded! Total: ${INR(result.total)} · Profit: ${INR(result.profit)}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to record sale");
    } finally {
      setRecording(false);
    }
  };

  return (
    <>
      <style>{`
        .sales-page { display:grid; grid-template-columns:1fr 340px; gap:0; min-height:100vh; }
        .pos-panel { padding:28px; border-right:1px solid var(--border); }
        .stats-panel { padding:24px; background:var(--surface); }
        .search-wrap { position:relative; margin-bottom:16px; }
        .search-input { width:100%; background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:11px 16px; color:var(--text); font-size:14px; outline:none; }
        .search-input:focus { border-color:var(--amber); }
        .search-results { position:absolute; top:100%; left:0; right:0; background:var(--surface); border:1px solid var(--border); border-radius:10px; margin-top:4px; z-index:20; overflow:hidden; }
        .search-item { padding:10px 14px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; font-size:13px; }
        .search-item:hover { background:var(--surface-2); }
        .cart-empty { text-align:center; padding:48px 0; color:var(--muted); }
        .cart-item { display:flex; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid var(--border); }
        .cart-item:last-child { border:none; }
        .cart-name { flex:1; font-size:13px; min-width:0; }
        .cart-price { font-family:var(--font-mono); font-size:12px; color:var(--amber); flex-shrink:0; }
        .qty-ctrl { display:flex; align-items:center; gap:5px; }
        .qbtn { width:22px; height:22px; border-radius:4px; border:1px solid var(--border); background:transparent; color:var(--text); cursor:pointer; font-size:13px; }
        .totals { background:var(--surface-2); border-radius:10px; padding:14px 16px; margin-top:16px; }
        .total-row { display:flex; justify-content:space-between; font-size:13px; margin-bottom:8px; }
        .total-row.final { font-family:var(--font-serif); font-size:20px; color:var(--amber); margin-top:10px; padding-top:10px; border-top:1px solid var(--border); }
        .payment-btns { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin:14px 0; }
        .pbtn { padding:7px; border-radius:6px; border:1px solid var(--border); background:transparent; color:var(--muted); font-size:11px; font-family:var(--font-mono); cursor:pointer; transition:all .15s; }
        .pbtn.on { background:var(--amber); color:#000; border-color:var(--amber); }
        .record-btn { width:100%; padding:14px; border-radius:10px; border:none; background:var(--amber); color:#000; font-size:15px; font-weight:700; cursor:pointer; font-family:var(--font-sans); transition:all .15s; }
        .record-btn:hover { background:var(--amber-2); }
        .record-btn:disabled { opacity:.6; cursor:not-allowed; }
        .stat-mini { background:var(--surface-2); border-radius:8px; padding:12px 14px; margin-bottom:10px; }
        .sm-label { font-size:10px; color:var(--muted); font-family:var(--font-mono); text-transform:uppercase; }
        .sm-val { font-family:var(--font-serif); font-size:22px; margin-top:2px; }
        .txn-row { padding:10px 0; border-bottom:1px solid var(--border); font-size:12px; display:flex; justify-content:space-between; }
        .txn-row:last-child { border:none; }
        @media(max-width:760px){.sales-page{grid-template-columns:1fr}.stats-panel{display:none}}
      `}</style>

      <div className="sales-page">
        {/* POS Panel */}
        <div className="pos-panel">
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 26, marginBottom: 20 }}>Point of Sale</h1>

          {/* Product search */}
          <div className="search-wrap">
            <input
              className="search-input"
              placeholder="🔍  Search or scan barcode…"
              value={searchQ}
              onChange={(e) => handleSearch(e.target.value)}
              autoFocus
            />
            {searching && (
              <div className="search-results">
                <div style={{ padding: "10px 14px", color: "var(--muted)", fontSize: 12 }}>Searching…</div>
              </div>
            )}
            {results.length > 0 && (
              <div className="search-results">
                {results.map((p) => (
                  <div key={p.id} className="search-item" onClick={() => handleAddProduct(p)}>
                    <div>
                      <div style={{ color: "var(--text)" }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>Stock: {p.quantity}</div>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", color: "var(--amber)", fontSize: 13 }}>{INR(p.selling_price)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cart */}
          {cart.items.length === 0 ? (
            <div className="cart-empty">
              <div style={{ fontSize: 48, marginBottom: 12 }}>🛒</div>
              <p>Search for a product to start a sale</p>
            </div>
          ) : (
            <>
              <div style={{ maxHeight: "40vh", overflowY: "auto" }}>
                {cart.items.map((item) => (
                  <div key={item.product_id} className="cart-item">
                    <div className="cart-name">
                      <div style={{ fontWeight: 500, color: "var(--text)" }}>{item.name}</div>
                      <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{INR(item.unit_price)} each</div>
                    </div>
                    <div className="qty-ctrl">
                      <button className="qbtn" onClick={() => updateQty(item.product_id, item.quantity - 1)}>−</button>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, width: 24, textAlign: "center" }}>{item.quantity}</span>
                      <button className="qbtn" onClick={() => updateQty(item.product_id, item.quantity + 1)}>+</button>
                    </div>
                    <div className="cart-price">{INR(item.line_total)}</div>
                    <button onClick={() => removeFromCart(item.product_id)} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 14, marginLeft: 4 }}>✕</button>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="totals">
                <div className="total-row">
                  <span style={{ color: "var(--muted)" }}>Subtotal</span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>{INR(cart.subtotal)}</span>
                </div>
                <div className="total-row" style={{ alignItems: "center" }}>
                  <span style={{ color: "var(--muted)" }}>Discount (₹)</span>
                  <input
                    type="number" min={0} value={cart.discount}
                    onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                    style={{ width: 80, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 5, padding: "3px 8px", color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "right", outline: "none" }}
                  />
                </div>
                <div className="total-row final">
                  <span>Total</span>
                  <span>{INR(cart.total)}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--green)", fontFamily: "var(--font-mono)", textAlign: "right", marginTop: 4 }}>
                  Profit: {INR(cart.profit)}
                </div>
              </div>

              {/* Payment method */}
              <div className="payment-btns">
                {(["cash", "upi", "card", "credit"] as const).map((m) => (
                  <button key={m} className={`pbtn${cart.paymentMethod === m ? " on" : ""}`} onClick={() => setPayment(m)}>
                    {m.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Record sale */}
              <button className="record-btn" onClick={handleRecordSale} disabled={recording}>
                {recording ? "Recording…" : `✓ Record Sale · ${INR(cart.total)}`}
              </button>
              <button onClick={clearCart} style={{ width: "100%", marginTop: 8, padding: "8px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", cursor: "pointer", fontSize: 12 }}>
                Clear Cart
              </button>
            </>
          )}
        </div>

        {/* Stats Panel */}
        <div className="stats-panel">
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 20, marginBottom: 16 }}>Today's Summary</div>

          {todayStats ? (
            <>
              {[
                { label: "Revenue",     val: INR(todayStats.revenue),           color: "var(--amber)" },
                { label: "Profit",      val: INR(todayStats.profit),            color: "var(--green)" },
                { label: "Units Sold",  val: String(todayStats.units_sold),     color: "var(--text)"  },
                { label: "Transactions",val: String(todayStats.transaction_count), color: "var(--text)" },
              ].map((s) => (
                <div key={s.label} className="stat-mini">
                  <div className="sm-label">{s.label}</div>
                  <div className="sm-val" style={{ color: s.color }}>{s.val}</div>
                </div>
              ))}
            </>
          ) : (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ height: 60, borderRadius: 8, marginBottom: 10, background: "linear-gradient(90deg,var(--surface-2) 25%,var(--border) 50%,var(--surface-2) 75%)", backgroundSize: "200% 100%", animation: "sh 1.4s infinite" }} />
            ))
          )}

          {recentTxns.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>Recent Sales</div>
              {recentTxns.map((t, i) => (
                <div key={i} className="txn-row">
                  <span style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}>#{t.transaction_id.slice(-6).toUpperCase()}</span>
                  <span style={{ color: "var(--amber)", fontFamily: "var(--font-mono)" }}>{INR(t.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
