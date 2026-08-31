import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { apiFetch } from "../../lib/apiFetch";

export default function Bestsellers() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    apiFetch("/api/products?mobile=1")
      .then(r => r.json())
      .then(data => setProducts(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col min-h-full bg-cream-light pb-24">
      <div className="bg-white p-4 flex items-center border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <button onClick={() => navigate(-1)} className="mr-4 text-maroon"><ChevronLeft size={24} /></button>
        <h2 className="font-serif text-xl text-gold font-bold uppercase tracking-wider">Best Sellers</h2>
      </div>

      <div className="p-4 grid grid-cols-2 gap-4">
        {products.map(product => (
          <Link key={product.id} to={`/product/${product.id}`} className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 flex flex-col">
            <div className="h-36 w-full bg-amber-50">
              <img
                src={product.image || "/cover.png"}
                alt={product.name}
                className="w-full h-full object-cover"
                onError={e => { (e.target as HTMLImageElement).src = "/cover.png"; }}
              />
            </div>
            <div className="p-3 flex flex-col flex-1 justify-between">
              <h4 className="font-bold text-sm text-gray-800 line-clamp-2 leading-tight mb-1">{product.name}</h4>
              <p className="text-maroon font-bold text-sm mt-1">
                ₹{product.unit === "gm" ? (product.price * 1000).toFixed(0) : product.price}
                <span className="text-xs font-normal text-gray-500"> / {product.unit === "gm" ? "kg" : (product.unit || "pc")}</span>
              </p>
            </div>
          </Link>
        ))}
        {products.length === 0 && (
          <div className="col-span-2 text-center text-gray-400 py-16">No products found.</div>
        )}
      </div>
    </div>
  );
}
