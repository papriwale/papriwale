import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useCart } from "../../hooks/useCart";
import { ChevronLeft, ShoppingBag, Heart } from "lucide-react";
import { useWishlist } from "../../hooks/useWishlist";

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);
  const [qty, setQty] = useState(1);
  const [gmInput, setGmInput] = useState("");
  const [variants, setVariants] = useState<any[]>([]);
  const [selectedSize, setSelectedSize] = useState("");
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { addToCart } = useCart();

  useEffect(() => {
    fetch(`/api/products/${id}?mobile=1`)
      .then(res => {
        if (!res.ok) throw new Error("not-found");
        return res.json();
      })
      .then(data => setProduct(data?.id ? data : null))
      .catch(() => {
        setProduct(null);
        setNotFound(true);
      });
    fetch(`/api/product-variants?product_id=${id}`)
      .then(res => res.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setVariants(list);
        if (list.length > 0) setSelectedSize(list[0].size_label);
      });
  }, [id]);

  if (notFound) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center bg-cream-light px-6 text-center">
        <h2 className="font-serif text-2xl text-maroon font-bold">Product not available</h2>
        <p className="mt-2 text-sm text-gray-500">This item is hidden from the mobile app or no longer exists.</p>
        <button
          onClick={() => navigate(-1)}
          className="mt-6 bg-maroon text-white px-5 py-3 rounded-full font-semibold"
        >
          Go Back
        </button>
      </div>
    );
  }

  if (!product) return null;

  const getPrice = () => {
    if (variants.length === 0) return product.price;
    const v = variants.find(v => v.size_label === selectedSize);
    return v ? product.price * v.variant_price_modifier : product.price;
  };

  const isGm = product?.unit === "gm";
  const isKg = product?.unit === "kg";
  const isOutOfStock = product.current_stock_qty <= 0;
  const isLowStock = !isOutOfStock && product.current_stock_qty <= product.safety_low_threshold;

  const handleAddToCart = () => {
    if (isOutOfStock) return;
    const size = selectedSize || "Regular";
    const variantData = variants.find(v => v.size_label === size);
    const finalPrice = variantData ? product.price * variantData.variant_price_modifier : product.price;
    if (isGm) {
      const grams = Number(gmInput);
      if (!grams || grams <= 0) return;
      if (grams > product.current_stock_qty) {
        alert(`Only ${product.current_stock_qty}gm available.`);
        return;
      }
      addToCart({ ...product, price: finalPrice }, size, grams);
    } else if (isKg) {
      if (qty > product.current_stock_qty) {
        alert(`Only ${product.current_stock_qty} kg available.`);
        return;
      }
      addToCart({ ...product, price: finalPrice }, size, qty);
    } else {
      if (qty > product.current_stock_qty) {
        alert(`Only ${product.current_stock_qty} pcs available.`);
        return;
      }
      addToCart({ ...product, price: finalPrice }, size, qty);
    }
    // toast shown by useCart — no navigate
  };

  return (
    <div className="relative flex flex-col min-h-full bg-white pb-40">
      {/* Header — fixed on scroll */}
      <div className="sticky top-0 left-0 right-0 p-4 flex items-center justify-between z-10 bg-white/80 backdrop-blur-sm border-b border-gray-100">
        <button onClick={() => navigate(-1)} className="w-10 h-10 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-maroon shadow-sm">
          <ChevronLeft size={24} />
        </button>

      </div>

      {/* Image */}
      <div className="w-full h-96 bg-amber-50">
        {product.image
          ? <img src={product.image} alt={product.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).src = "/cover.png"; }} />
          : <img src="/cover.png" alt={product.name} className="w-full h-full object-cover" />}
      </div>

      {/* Details */}
      <div className="p-6">
        <div className="flex justify-between items-start mb-2">
          <h2 className="font-serif text-3xl text-maroon font-bold">{product.name}</h2>
          <button
            onClick={() => toggleWishlist(product.id)}
            className={`pt-1 ${isInWishlist(product.id) ? 'text-maroon' : 'text-gray-300 hover:text-maroon'}`}
          >
            <Heart size={28} fill={isInWishlist(product.id) ? 'currentColor' : 'none'} />
          </button>
        </div>
        <p className="text-gold font-bold text-xl mb-1">₹{isGm ? (getPrice() * 1000).toFixed(0) : getPrice().toFixed(2)} <span className="text-sm font-normal text-gray-500">/ {isGm ? "kg" : isKg ? "kg" : (product.unit || "pc")}</span></p>
        <div className="flex items-center gap-2 mb-4">
          {isOutOfStock && <span className="text-xs font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Out of Stock</span>}
          {isLowStock && <span className="text-xs font-bold bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full">Low Stock</span>}
        </div>

        {product.description ? (
          <p className="text-gray-500 text-sm leading-relaxed mb-6">{product.description}</p>
        ) : (
          <p className="text-gray-400 text-sm leading-relaxed mb-6 italic">Fresh and handcrafted with finest ingredients. A signature delicacy from Shri Badrinarayan Papriwale.</p>
        )}

        {/* Variant Size Selection — only if variants exist */}
        {variants.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-bold text-gray-800 mb-3 uppercase tracking-wider">Select Size</h3>
            <div className="flex flex-wrap gap-2">
              {variants.map(v => (
                <button
                  key={v.size_label}
                  onClick={() => setSelectedSize(v.size_label)}
                  className={`px-4 py-2 text-sm font-semibold rounded-full border transition-colors ${
                    selectedSize === v.size_label ? "bg-maroon text-white border-maroon" : "bg-white text-gray-600 border-gray-200"
                  }`}
                >
                  {v.size_label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Qty / Gm Input */}
        {isGm ? (
          <div className="mb-4">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Enter Quantity (gm)</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="1"
                placeholder="e.g. 250"
                value={gmInput}
                onChange={e => setGmInput(e.target.value)}
                className="flex-1 border-2 border-gray-200 focus:border-maroon rounded-xl px-4 py-3 text-lg font-bold text-center focus:outline-none"
              />
              <span className="text-gray-500 font-semibold">gm</span>
            </div>
            {gmInput && Number(gmInput) > 0 && (
              <p className="text-center text-maroon font-bold mt-2">Total: ₹{(getPrice() * Number(gmInput)).toFixed(2)}</p>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center mb-4">
            <div className="flex items-center bg-gray-50 border border-gray-200 rounded-full px-2 py-1">
              <button onClick={() => setQty(Math.max(1, qty - 1))} className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-gray-200 rounded-full font-bold text-xl">-</button>
              <span className="w-12 text-center font-bold text-lg">{qty}</span>
              <button onClick={() => setQty(Math.min(product.current_stock_qty, qty + 1))} className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-gray-200 rounded-full font-bold text-xl">+</button>
            </div>
          </div>
        )}
      </div>

      {/* Sticky Bottom Bar */}
      <div className="fixed left-0 right-0 max-w-md mx-auto p-4 bg-white border-t border-gray-100 shadow-[0_-5px_20px_rgba(0,0,0,0.05)] z-30" style={{ bottom: 'calc(64px + env(safe-area-inset-bottom))' }}>
        <button onClick={handleAddToCart} disabled={isOutOfStock}
          className="w-full bg-maroon text-cream font-bold py-4 rounded-xl hover:bg-maroon-light transition-colors shadow-md flex items-center justify-center gap-2 text-lg disabled:opacity-50 disabled:cursor-not-allowed">
          <ShoppingBag size={20} /> {isOutOfStock ? "Out of Stock" : "Add to Cart"}
        </button>
      </div>
    </div>
  );
}
