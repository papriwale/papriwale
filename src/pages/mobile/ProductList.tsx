import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useCart } from "../../hooks/useCart";
import { ChevronLeft, Heart, ArrowUpDown } from "lucide-react";
import { useWishlist } from "../../hooks/useWishlist";

export default function ProductList() {
  const [products, setProducts] = useState<any[]>([]);
  const [categoryName, setCategoryName] = useState("");
  const [sortOption, setSortOption] = useState<string>("default");
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [gms, setGms] = useState<Record<string, string>>({});
  const { id } = useParams();
  const navigate = useNavigate();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { addToCart } = useCart();

  useEffect(() => {
    fetch("/api/categories")
      .then(r => r.json())
      .then(data => {
        const all = Array.isArray(data) ? data : [];
        const cat = all.find((c: any) => c.id === id);
        const name = cat?.name || "";
        setCategoryName(name);
        return fetch("/api/products?mobile=1").then(r => r.json()).then(pdata => {
          const prods = Array.isArray(pdata) ? pdata : [];
          setProducts(prods.filter((p: any) =>
            p.category_id === id ||
            p.category === id ||
            (name && p.category?.toLowerCase() === name.toLowerCase())
          ));
        });
      });
  }, [id]);

  const sortedProducts = [...products].sort((a, b) => {
    if (sortOption === "price-asc") return a.price - b.price;
    if (sortOption === "price-desc") return b.price - a.price;
    // For popularity, assume 'current_stock_qty' inverse or mock popularity
    if (sortOption === "popularity") return b.price - a.price; 
    return 0;
  });

  return (
    <div className="flex flex-col min-h-full bg-cream-light pb-24">
      <div className="bg-white p-4 flex items-center justify-between border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center">
          <button onClick={() => navigate(-1)} className="mr-4 text-maroon">
            <ChevronLeft size={24} />
          </button>
          <h2 className="font-serif text-xl text-gold font-bold uppercase tracking-wider">{categoryName || "Products"}</h2>
        </div>
      </div>

      <div className="px-4 py-3 flex justify-between items-center border-b border-gray-100 bg-gray-50 sticky top-[65px] z-10">
        <span className="text-sm font-semibold text-gray-600">{products.length} Products</span>
        <div className="relative">
          <select 
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value)}
            className="appearance-none bg-white border border-gray-300 rounded-full pl-3 pr-8 py-1.5 text-xs font-semibold focus:outline-none focus:border-maroon focus:ring-1 focus:ring-maroon shadow-sm text-gray-700 cursor-pointer"
          >
            <option value="default">Sort by</option>
            <option value="popularity">Popularity</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
          </select>
          <ArrowUpDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
      </div>

      <div className="p-4 space-y-4">
        {sortedProducts.length === 0 && (
          <div className="text-center text-gray-400 py-16">
            <p className="text-lg font-semibold">No products in this category yet</p>
          </div>
        )}
        {sortedProducts.map(product => (
          <div key={product.id} className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 flex p-3 relative">
            <button 
              onClick={() => toggleWishlist(product.id)}
              className={`absolute top-3 right-3 z-10 ${isInWishlist(product.id) ? 'text-maroon' : 'text-gray-300 hover:text-maroon'}`}
            >
              <Heart size={20} fill={isInWishlist(product.id) ? 'currentColor' : 'none'} />
            </button>
            <Link to={`/product/${product.id}`} className="w-24 h-24 rounded-lg overflow-hidden shrink-0 bg-amber-50">
              {product.image
                ? <img src={product.image} alt={product.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).src = "/cover.png"; }} />
                : <img src="/cover.png" alt={product.name} className="w-full h-full object-cover" />}
            </Link>
            <div className="ml-4 flex flex-col justify-between py-1 flex-1">
              <Link to={`/product/${product.id}`}>
                <h3 className="font-bold text-gray-800 pr-6 leading-tight">{product.name}</h3>
                <p className="text-maroon font-semibold text-sm mt-1">₹{product.unit === "gm" ? (product.price * 1000).toFixed(0) : product.price} / {product.unit === "gm" ? "kg" : (product.unit === "kg" ? "kg" : "pc")}</p>
              </Link>
              {product.unit === "gm" ? (
                <div className="flex items-center gap-1 mt-2">
                  {product.current_stock_qty <= 0 ? (
                    <span className="text-xs font-bold text-red-500 bg-red-50 px-3 py-1.5 rounded-full">Out of Stock</span>
                  ) : (
                    <>
                      <input
                        type="number"
                        min="1"
                        max={product.current_stock_qty}
                        placeholder="gm"
                        value={gms[product.id] || ""}
                        onChange={e => setGms(prev => ({ ...prev, [product.id]: e.target.value }))}
                        className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:border-maroon"
                      />
                      <button
                        onClick={() => {
                          const g = Number(gms[product.id]);
                          if (!g || g <= 0) return;
                          if (g > product.current_stock_qty) { alert(`Only ${product.current_stock_qty}gm available.`); return; }
                          addToCart(product, "Regular", g);
                          setGms(prev => ({ ...prev, [product.id]: "" }));
                        }}
                        className="bg-maroon text-white text-xs font-bold px-3 py-1.5 rounded-full hover:bg-maroon-light"
                      >Add</button>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1 mt-2">
                  {product.current_stock_qty <= 0 ? (
                    <span className="text-xs font-bold text-red-500 bg-red-50 px-3 py-1.5 rounded-full">Out of Stock</span>
                  ) : (
                    <>
                      <button onClick={() => setQtys(prev => ({ ...prev, [product.id]: Math.max(1, (prev[product.id] || 1) - 1) }))} className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 font-bold">-</button>
                      <span className="w-6 text-center text-sm font-bold">{qtys[product.id] || 1}</span>
                      <button onClick={() => setQtys(prev => ({ ...prev, [product.id]: Math.min(product.current_stock_qty, (prev[product.id] || 1) + 1) }))} className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 font-bold">+</button>
                      <button
                        onClick={() => {
                          const q = qtys[product.id] || 1;
                          if (q > product.current_stock_qty) { alert(`Only ${product.current_stock_qty} pcs available.`); return; }
                          addToCart(product, undefined, q);
                          setQtys(prev => ({ ...prev, [product.id]: 1 }));
                        }}
                        className="bg-maroon text-white text-xs font-bold px-3 py-1.5 rounded-full hover:bg-maroon-light ml-1"
                      >Add</button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
