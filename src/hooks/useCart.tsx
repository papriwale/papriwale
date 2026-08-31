import React, { createContext, useContext, useState, useEffect } from "react";
import { X } from "lucide-react";

type CartItem = {
  id: string;
  product_id: string;
  name: string;
  size: string;
  price: number;
  qty: number;
  unit: string;
  image: string;
  note?: string;
};

type CartContextType = {
  items: CartItem[];
  addToCart: (product: any, size?: string, qty?: number) => void;
  removeFromCart: (id: string) => void;
  updateQty: (id: string, delta: number) => void;
  updateNote: (id: string, note: string) => void;
  clearCart: () => void;
  subtotal: number;
  tax: number;
  total: number;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem("cartItems");
    return saved ? JSON.parse(saved) : [];
  });

  const [toast, setToast] = useState<{ name: string; image: string } | null>(null);
  const toastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (name: string, image: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ name, image });
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };
  
  const [dbVariants, setDbVariants] = useState<any[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [selectedSize, setSelectedSize] = useState("");
  const [qty, setQty] = useState(1);
  const [variants, setVariants] = useState<any[]>([]);

  useEffect(() => {
    localStorage.setItem("cartItems", JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    fetch("/api/product-variants").then(r => r.json()).then(setDbVariants).catch(() => {});
  }, []);

  const addToCart = async (product: any, size?: string, quantity: number = 1) => {
    if (product.current_stock_qty <= 0) return;
    if (!size) {
      const productVariants = dbVariants.filter((v: any) => v.product_id === product.id);
      if (productVariants.length > 0) {
        const priced = productVariants.map((v: any) => ({
          size_label: v.size_label,
          price: product.price * v.variant_price_modifier,
        }));
        setVariants(priced);
        setSelectedProduct(product);
        setSelectedSize(priced[0].size_label);
        setQty(1);
        setShowModal(true);
        return;
      }
      size = "Regular";
    }
    const variantData = dbVariants.find((v: any) => v.product_id === product.id && v.size_label === size);
    const finalPrice = variantData ? product.price * variantData.variant_price_modifier : product.price;
    const cartItemId = `${product.id}-${size}`;
    setItems(prev => {
      const existing = prev.find(i => i.id === cartItemId);
      const currentQty = existing?.qty || 0;
      const newQty = Math.min(currentQty + quantity, product.current_stock_qty);
      if (existing) return prev.map(i => i.id === cartItemId ? { ...i, qty: newQty } : i);
      return [...prev, { id: cartItemId, product_id: product.id, name: product.name, size: size!, price: finalPrice, qty: newQty, unit: product.unit || "pcs", image: product.image, stock: product.current_stock_qty }];
    });
    showToast(product.name, product.image);
  };

  const handleModalConfirm = () => {
    const variant = variants.find(v => v.size_label === selectedSize);
    const cartItemId = `${selectedProduct.id}-${selectedSize}`;
    const existing = items.find(i => i.id === cartItemId);
    const currentQty = existing?.qty || 0;
    const maxQty = selectedProduct.current_stock_qty ?? Infinity;
    if (currentQty + qty > maxQty) {
      alert(`Only ${maxQty} available for "${selectedProduct.name}".`);
      return;
    }
    setItems(prev => {
      const ex = prev.find(i => i.id === cartItemId);
      if (ex) return prev.map(i => i.id === cartItemId ? { ...i, qty: i.qty + qty } : i);
      return [...prev, { id: cartItemId, product_id: selectedProduct.id, name: selectedProduct.name, size: selectedSize, price: variant.price, qty, unit: selectedProduct.unit || "pcs", image: selectedProduct.image, stock: maxQty } as any];
    });
    showToast(selectedProduct.name, selectedProduct.image);
    setShowModal(false);
  };

  const removeFromCart = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const updateQty = (id: string, delta: number) => {
    setItems(prev => prev.map(i => {
      if (i.id !== id) return i;
      const maxQty = (i as any).stock ?? Infinity;
      return { ...i, qty: Math.min(maxQty, Math.max(1, i.qty + delta)) };
    }));
  };

  const updateNote = (id: string, note: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, note } : i));
  };

  const clearCart = () => setItems([]);

  const subtotal = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const tax = subtotal * 0.05;
  const total = subtotal; // tax is informational only, not added to total

  return (
    <CartContext.Provider value={{ items, addToCart, removeFromCart, updateQty, updateNote, clearCart, subtotal, tax, total }}>
      {children}

      {/* Added to cart toast */}
      {toast && (
        <div
          className="fixed top-5 left-1/2 z-[200] pointer-events-none"
          style={{
            transform: `translateX(-50%)`,
            animation: 'slideDown 0.35s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          <div className="flex items-center gap-3 bg-gray-900 text-white px-4 py-3 rounded-2xl shadow-2xl min-w-[220px] max-w-[320px]">
            {toast.image
              ? <img src={toast.image} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}/>
              : <div className="w-10 h-10 rounded-lg bg-maroon shrink-0 flex items-center justify-center text-white text-lg">🛒</div>}
            <div className="flex flex-col">
              <span className="text-xs text-gray-400 font-medium">Added to cart</span>
              <span className="text-sm font-bold leading-tight line-clamp-1">{toast.name}</span>
            </div>
            <span className="ml-auto text-green-400 text-xl">✓</span>
          </div>
        </div>
      )}
      
      {/* Sizing Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-cream-light">
              <h3 className="font-serif text-lg text-maroon font-bold">CHOOSE ITEM SPECIFICATIONS</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4">
              <p className="font-bold text-gray-800 text-sm mb-3">Select Serving Size Volume Option:</p>
              <div className="space-y-2 mb-6">
                {variants.map(v => (
                  <label key={v.size_label} onClick={() => setSelectedSize(v.size_label)} className={`flex items-center justify-between p-3 rounded-lg border-2 cursor-pointer transition-colors ${selectedSize === v.size_label ? 'border-maroon bg-maroon/5' : 'border-gray-200'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selectedSize === v.size_label ? 'border-maroon' : 'border-gray-300'}`}>
                        {selectedSize === v.size_label && <div className="w-2 h-2 rounded-full bg-maroon" />}
                      </div>
                      <span className="font-medium text-gray-800">{v.size_label}</span>
                    </div>
                    <span className="text-sm font-bold text-gray-600">₹{v.price.toFixed(2)}</span>
                  </label>
                ))}
              </div>
              
              <p className="font-bold text-gray-800 text-sm mb-3 text-center">Adjust Intended Item Order Volume Balance:</p>
              <div className="flex items-center justify-center gap-4 mb-6">
                <button onClick={() => setQty(Math.max(1, qty - 1))} className="w-12 h-12 flex items-center justify-center text-maroon hover:bg-maroon/10 rounded-full font-bold text-2xl border border-gray-200">-</button>
                <span className="w-12 text-center font-bold text-2xl text-gray-800">{qty}</span>
                <button onClick={() => setQty(qty + 1)} className="w-12 h-12 flex items-center justify-center text-maroon hover:bg-maroon/10 rounded-full font-bold text-2xl border border-gray-200">+</button>
              </div>
              
              <button onClick={handleModalConfirm} className="w-full bg-maroon text-cream font-bold py-3.5 rounded-lg hover:bg-maroon-light transition-colors uppercase tracking-wider text-sm shadow-md">
                CONFIRM AND ADD TO CHECKOUT TRAY
              </button>
            </div>
          </div>
        </div>
      )}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
