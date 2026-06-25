/**
 * frontend/lib/api.ts
 * Updated: business_type in UserProfile, updateBusinessType method, uploadProductImage, image_url in Product.
 */

const API_BASE = "";

export const tokenStore = {
  getAccess:  () => (typeof window !== "undefined" ? localStorage.getItem("access_token")  : null),
  getRefresh: () => (typeof window !== "undefined" ? localStorage.getItem("refresh_token") : null),
  set: (access: string, refresh: string) => {
    localStorage.setItem("access_token", access);
    localStorage.setItem("refresh_token", refresh);
  },
  clear: () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
  },
};

async function apiFetch<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const token = tokenStore.getAccess();
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(options.headers as Record<string, string>) };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401 && retry) {
    const refreshed = await tryRefreshToken();
    if (refreshed) return apiFetch<T>(path, options, false);
    tokenStore.clear();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Session expired.");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? body.detail ?? `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

async function tryRefreshToken(): Promise<boolean> {
  const refresh = tokenStore.getRefresh();
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    tokenStore.set(data.access_token, data.refresh_token);
    return true;
  } catch { return false; }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TokenResponse { access_token: string; refresh_token: string; expires_in: number }
export interface UserProfile {
  id: string; email: string; name: string; role: string;
  tenant_id: string; business_name: string;
  business_type?: string | null;  // NEW
  plan: string;
}
export interface Product {
  id: string; sku?: string; barcode?: string; name: string; category?: string; brand?: string;
  unit: string; cost_price: number; selling_price: number; quantity: number; reorder_point: number;
  is_low_stock: boolean; is_out_of_stock: boolean; margin_pct: number; expiry_date?: string;
  supplier_id?: string; image_url?: string;  // NEW
  is_active: boolean;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export const auth = {
  register: (data: { business_name: string; owner_name: string; email: string; password: string; phone?: string }) =>
    apiFetch<{ user: UserProfile; tokens: TokenResponse; message: string }>("/api/v1/auth/register", { method: "POST", body: JSON.stringify(data) }),

  login: (email: string, password: string) =>
    apiFetch<TokenResponse>("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),

  logout: (refresh_token: string) =>
    apiFetch<void>("/api/v1/auth/logout", { method: "POST", body: JSON.stringify({ refresh_token }) }),

  me: () => apiFetch<UserProfile>("/api/v1/auth/me"),

  updateMe: (data: { name?: string; phone?: string; current_password?: string; new_password?: string }) =>
    apiFetch<UserProfile>("/api/v1/auth/me", { method: "PUT", body: JSON.stringify(data) }),

  updateBusinessType: (business_type: string) =>
    apiFetch<{ message: string; business_type: string }>("/api/v1/auth/business-type", { method: "PUT", body: JSON.stringify({ business_type }) }),

  inviteStaff: (data: { email: string; name: string; role?: string }) =>
    apiFetch<{ message: string }>("/api/v1/auth/invite", { method: "POST", body: JSON.stringify(data) }),
};

// ── Inventory ─────────────────────────────────────────────────────────────────

export const inventory = {
  listProducts: (params?: { q?: string; category?: string; stock_filter?: string; skip?: number; limit?: number }) => {
    const qs = params ? new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))).toString() : "";
    return apiFetch<Product[]>(`/api/v1/inventory/products${qs ? "?" + qs : ""}`);
  },
  getProduct: (id: string) => apiFetch<Product>(`/api/v1/inventory/products/${id}`),
  createProduct: (data: Partial<Product> & { name: string }) =>
    apiFetch<Product>("/api/v1/inventory/products", { method: "POST", body: JSON.stringify(data) }),
  updateProduct: (id: string, data: Partial<Product>) =>
    apiFetch<Product>(`/api/v1/inventory/products/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  adjustStock: (id: string, delta: number, reason?: string) =>
    apiFetch<Product>(`/api/v1/inventory/products/${id}/stock`, { method: "PUT", body: JSON.stringify({ delta, reason }) }),
  deleteProduct: (id: string) => apiFetch<void>(`/api/v1/inventory/products/${id}`, { method: "DELETE" }),
  listSuppliers: () => apiFetch<{ id: string; name: string; phone?: string; lead_time_days: number }[]>("/api/v1/inventory/suppliers"),
  createSupplier: (data: object) => apiFetch<{ id: string; name: string }>("/api/v1/inventory/suppliers", { method: "POST", body: JSON.stringify(data) }),
  lowStockSummary: () => apiFetch<{ low_stock: number; out_of_stock: number }>("/api/v1/inventory/low-stock-summary"),

  uploadProductImage: async (file: File): Promise<string> => {
    const token = tokenStore.getAccess();
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_BASE}/api/v1/inventory/products/upload-image`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Image upload failed");
    }
    const data = await res.json();
    return data.image_url;
  },
};

// ── Sales ─────────────────────────────────────────────────────────────────────

export const sales = {
  recordTransaction: (data: { items: { product_id: string; quantity: number }[]; discount_amount?: number; payment_method?: string; customer_id?: string }) =>
    apiFetch<{ transaction_id: string; total: number; profit: number }>("/api/v1/sales/transaction", { method: "POST", body: JSON.stringify(data) }),
  dashboard: () => apiFetch<{
    revenue: number; profit: number; units_sold: number; transaction_count: number;
    revenue_change_pct: number; profit_change_pct: number; units_change_pct: number;
    top_products: { name: string; revenue: number; units: number }[];
  }>("/api/v1/sales/dashboard"),
  trends: (period?: string, days?: number) => {
    const qs = new URLSearchParams({ ...(period ? { period } : {}), ...(days ? { days: String(days) } : {}) }).toString();
    return apiFetch<{ date: string; revenue: number; profit: number }[]>(`/api/v1/sales/trends${qs ? "?" + qs : ""}`);
  },
  topProducts: (days?: number, limit?: number) => {
    const qs = new URLSearchParams({ ...(days ? { days: String(days) } : {}), ...(limit ? { limit: String(limit) } : {}) }).toString();
    return apiFetch<{ product_id: string; name: string; revenue: number; units: number; profit: number }[]>(`/api/v1/sales/top-products${qs ? "?" + qs : ""}`);
  },
  slowMovers: (days?: number) =>
    apiFetch<{ id: string; name: string; quantity: number; stock_value: number; expiry_date?: string }[]>(`/api/v1/sales/slow-movers${days ? `?days=${days}` : ""}`),
};

// ── AI ────────────────────────────────────────────────────────────────────────

export const ai = {
  async *chat(message: string, history: { role: string; content: string }[] = []) {
    const token = tokenStore.getAccess();
    const res = await fetch(`${API_BASE}/api/v1/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ message, conversation_history: history }),
    });
    if (!res.ok || !res.body) throw new Error("AI chat failed");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) yield data.text as string;
            if (data.error) throw new Error(data.error);
          } catch { /* ignore malformed */ }
        }
      }
    }
  },
  recommendations: () => apiFetch<{ id: string; type: string; urgency: string; message: string; product_name?: string }[]>("/api/v1/ai/recommendations"),
  healthScore: () => apiFetch<{
    insufficient_data: boolean; total: number; revenue_growth: number;
    inventory_efficiency: number; profit_margin: number; stock_turnover: number;
    customer_engagement: number; suggestions: string[];
  }>("/api/v1/ai/health-score"),
  forecast: (product_id?: string) =>
    apiFetch<{ product_id: string; product_name: string; daily_avg_units: number; predicted_30d_units: number; reorder_recommended: boolean }[]>(`/api/v1/ai/forecast${product_id ? `?product_id=${product_id}` : ""}`),
  marketingContent: (content_type?: string) =>
    apiFetch<{ variants: { tone: string; message: string }[] }>(`/api/v1/ai/marketing/content${content_type ? `?content_type=${content_type}` : ""}`),
};

// ── OCR ───────────────────────────────────────────────────────────────────────

export const ocr = {
  processInvoice: async (file: File) => {
    const token = tokenStore.getAccess();
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_BASE}/api/v1/ocr/invoice`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    if (!res.ok) throw new Error("OCR processing failed");
    return res.json();
  },
  confirmImport: (data: { items: object[]; supplier_name?: string }) =>
    apiFetch<{ created: number; updated: number; total_cost: number }>("/api/v1/ocr/confirm", { method: "POST", body: JSON.stringify(data) }),
};

// ── Customers ─────────────────────────────────────────────────────────────────

export const customers = {
  list: (params?: { segment?: string; q?: string }) => {
    const qs = params ? new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v != null) as [string, string][])).toString() : "";
    return apiFetch<{ id: string; name?: string; phone?: string; segment?: string; total_spent: number; visit_count: number }[]>(`/api/v1/customers${qs ? "?" + qs : ""}`);
  },
  create: (data: { name?: string; phone?: string; email?: string }) =>
    apiFetch<{ id: string }>("/api/v1/customers", { method: "POST", body: JSON.stringify(data) }),
  get: (id: string) => apiFetch<object>(`/api/v1/customers/${id}`),
  segments: () => apiFetch<Record<string, number>>("/api/v1/customers/segments"),
};
