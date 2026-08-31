import { useCart } from "../../hooks/useCart";
import { useNavigate, Link } from "react-router-dom";
import { ChevronLeft, Trash2 } from "lucide-react";

export default function Cart() {
  const navigate = useNavigate();
  const { items, updateQty, removeFromCart, updateNote, subtotal, tax, total } = useCart();

  return (
    <div className="flex flex-col min-h-full bg-cream-light pb-40">
      <div className="bg-white p-4 flex items-center border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <button onClick={() => navigate(-1)} className="mr-4 text-maroon"><ChevronLeft size={24} /></button>
        <h2 className="font-serif text-xl text-gold font-bold uppercase tracking-wider">MY CART</h2>
      </div>

      <div className="p-4 space-y-4">
        {items.length === 0 && (
          <div className="text-center text-gray-400 py-16">
            <p className="text-lg font-semibold">Your cart is empty</p>
            <button onClick={() => navigate("/")} className="mt-4 text-maroon font-semibold text-sm underline">Browse Menu</button>
          </div>
        )}
        {items.map(item => {
          const stock = (item as any).stock ?? Infinity;
          const isOut = stock <= 0;
          const isLow = !isOut && stock !== Infinity && item.qty >= stock;
          return (
          <div key={item.id} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex flex-col gap-3 relative">
            <div className="flex gap-4">
              <Link to={`/product/${item.product_id}`} className="w-20 h-20 rounded-lg overflow-hidden shrink-0 bg-amber-50">
                <img src={item.image || "/cover.png"} alt={item.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).src = "/cover.png"; }} />
              </Link>
              <div className="flex-1 flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <Link to={`/product/${item.product_id}`} className="flex-1">
                    <h3 className="font-bold text-gray-800 text-sm">{item.name}</h3>
                    <p className="text-gray-500 text-xs">{item.size} • ₹{item.price}</p>
                    {isOut && <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">Out of Stock</span>}
                    {isLow && !isOut && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">Max qty reached</span>}
                  </Link>
                  <button onClick={() => removeFromCart(item.id)} className="text-red-300 hover:text-red-500 ml-2">
                    <Trash2 size={18} />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="font-bold text-maroon">₹{(item.price * item.qty).toFixed(2)}</span>
                  {item.unit === "gm" || item.unit === "kg" ? (
                    <span className="text-sm font-bold text-gray-700 bg-gray-100 px-3 py-1 rounded-full">
                      {item.unit === "gm" ? `${item.qty} gm` : `${item.qty} kg`}
                    </span>
                  ) : (
                  <div className="flex items-center bg-gray-50 border border-gray-200 rounded-full px-1">
                    <button onClick={() => updateQty(item.id, -1)} className="w-6 h-6 flex items-center justify-center text-gray-600 font-bold">-</button>
                    <span className="w-6 text-center font-bold text-sm">{item.qty}</span>
                    <button onClick={() => updateQty(item.id, 1)} disabled={isLow || isOut}
                      className="w-6 h-6 flex items-center justify-center text-gray-600 font-bold disabled:opacity-30 disabled:cursor-not-allowed">+</button>
                  </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          );
        })}
      </div>

      {items.length > 0 && (
        <>
          <div className="bg-white mx-4 rounded-xl p-5 shadow-sm border border-gray-100 space-y-3 mb-6">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span className="font-semibold text-gray-800">₹{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-400">
              <span>Tax 5% (incl.)</span>
              <span>₹{tax.toFixed(2)}</span>
            </div>
            <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
              <span className="font-bold text-gray-800">Total</span>
              <span className="font-bold text-xl text-maroon">₹{total.toFixed(2)}</span>
            </div>
          </div>

          <div className="fixed left-0 right-0 max-w-md mx-auto p-4 bg-white border-t border-gray-100 shadow-[0_-5px_20px_rgba(0,0,0,0.05)] z-30" style={{ bottom: 'calc(64px + env(safe-area-inset-bottom))' }}>
            <button onClick={() => navigate("/checkout")} className="w-full bg-maroon text-cream font-bold py-4 rounded-xl hover:bg-maroon-light transition-colors shadow-md text-lg">
              Proceed to Checkout
            </button>
          </div>
        </>
      )}
    </div>
  );
}
