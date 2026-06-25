/**
 * frontend/lib/store.ts
 * Updated: business_type added to UserProfile, selector hooks.
 */
"use client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { tokenStore } from "./api";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: "owner" | "staff";
  tenant_id: string;
  business_name: string;
  business_type?: string | null;  // NEW
  plan: "free" | "pro" | "business";
}

export interface CartItem {
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  line_total: number;
}

interface StoreState {
  // Auth
  user: UserProfile | null;
  isAuthenticated: boolean;
  setUser: (user: UserProfile, access: string, refresh: string) => void;
  clearAuth: () => void;

  // Cart
  cartItems: CartItem[];
  discountAmount: number;
  paymentMethod: "cash" | "upi" | "card" | "credit";
  customerId: string | null;
  addToCart: (product: { id: string; name: string; selling_price: number; cost_price: number }) => void;
  removeFromCart: (product_id: string) => void;
  updateQuantity: (product_id: string, quantity: number) => void;
  setDiscount: (amount: number) => void;
  setPaymentMethod: (method: "cash" | "upi" | "card" | "credit") => void;
  setCustomerId: (id: string | null) => void;
  clearCart: () => void;
  cartSubtotal: () => number;
  cartTotal: () => number;
  cartProfit: () => number;
  cartItemCount: () => number;

  // UI
  sidebarOpen: boolean;
  lowStockCount: number;
  outOfStockCount: number;
  unreadInsights: number;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setLowStockCount: (count: number) => void;
  setOutOfStockCount: (count: number) => void;
  setUnreadInsights: (count: number) => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,

      setUser: (user, access, refresh) => {
        tokenStore.set(access, refresh);
        set({ user, isAuthenticated: true });
      },
      clearAuth: () => {
        tokenStore.clear();
        set({ user: null, isAuthenticated: false, cartItems: [] });
      },

      cartItems: [],
      discountAmount: 0,
      paymentMethod: "cash",
      customerId: null,

      addToCart: (product) => {
        const items = get().cartItems;
        const existing = items.find((i) => i.product_id === product.id);
        if (existing) {
          set({ cartItems: items.map((i) => i.product_id === product.id
            ? { ...i, quantity: i.quantity + 1, line_total: (i.quantity + 1) * i.unit_price }
            : i) });
        } else {
          set({ cartItems: [...items, {
            product_id: product.id, name: product.name, quantity: 1,
            unit_price: product.selling_price, unit_cost: product.cost_price,
            line_total: product.selling_price,
          }]});
        }
      },
      removeFromCart: (product_id) => set({ cartItems: get().cartItems.filter((i) => i.product_id !== product_id) }),
      updateQuantity: (product_id, quantity) => {
        if (quantity <= 0) { get().removeFromCart(product_id); return; }
        set({ cartItems: get().cartItems.map((i) => i.product_id === product_id
          ? { ...i, quantity, line_total: quantity * i.unit_price } : i) });
      },
      setDiscount: (amount) => set({ discountAmount: amount }),
      setPaymentMethod: (method) => set({ paymentMethod: method }),
      setCustomerId: (id) => set({ customerId: id }),
      clearCart: () => set({ cartItems: [], discountAmount: 0, paymentMethod: "cash", customerId: null }),
      cartSubtotal: () => get().cartItems.reduce((s, i) => s + i.line_total, 0),
      cartTotal: () => Math.max(0, get().cartSubtotal() - get().discountAmount),
      cartProfit: () => get().cartItems.reduce((s, i) => s + (i.unit_price - i.unit_cost) * i.quantity, 0) - get().discountAmount,
      cartItemCount: () => get().cartItems.reduce((s, i) => s + i.quantity, 0),

      sidebarOpen: true,
      lowStockCount: 0,
      outOfStockCount: 0,
      unreadInsights: 0,
      toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setLowStockCount: (count) => set({ lowStockCount: count }),
      setOutOfStockCount: (count) => set({ outOfStockCount: count }),
      setUnreadInsights: (count) => set({ unreadInsights: count }),
    }),
    {
      name: "copilot-store",
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") return {
          getItem: () => null, setItem: () => {}, removeItem: () => {}
        };
        return localStorage;
      }),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        sidebarOpen: state.sidebarOpen,
      }),
    }
  )
);

export const useUser      = () => useStore((s) => s.user);
export const useIsAuth    = () => useStore((s) => s.isAuthenticated);
export const useCart      = () => useStore((s) => ({
  items: s.cartItems, discount: s.discountAmount, paymentMethod: s.paymentMethod,
  customerId: s.customerId, subtotal: s.cartSubtotal(), total: s.cartTotal(),
  profit: s.cartProfit(), itemCount: s.cartItemCount(),
}));
export const useUIBadges  = () => useStore((s) => ({
  lowStock: s.lowStockCount, outOfStock: s.outOfStockCount, unreadInsights: s.unreadInsights,
}));
