import { useEffect, useState } from "react";
import { ChevronLeft, Heart } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { useWishlist } from "../../hooks/useWishlist";

export default function Wishlist() {
  const navigate = useNavigate();
  const { wishlist, toggleWishlist } = useWishlist();
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/products?mobile=1")
      .then(res => res.json())
      .then(data => setProducts(data));
  }, []);

  const wishlistedProducts = products.filter(p => wishlist.includes(p.id));

  return (
    <div className="flex flex-col min-h-screen bg-cream-light pb-24">
      <div className="bg-white p-4 flex items-center border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <button onClick={() => navigate(-1)} className="mr-4 text-maroon">
          <ChevronLeft size={24} />
        </button>
        <h2 className="font-serif text-xl text-gold font-bold uppercase tracking-wider">WISHLIST</h2>
      </div>

      {wishlistedProducts.length === 0 ? (
        <div className="p-4 flex-1 flex flex-col items-center justify-center min-h-[50vh]">
          <h3 className="text-gray-500 font-medium text-lg">Your wishlist is empty</h3>
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {wishlistedProducts.map(product => (
            <div key={product.id} className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 flex p-3 relative">
              <button
                onClick={() => toggleWishlist(product.id)}
                className="absolute top-3 right-3 text-maroon z-10"
              >
                <Heart size={20} fill="currentColor" />
              </button>
              <Link to={`/product/${product.id}`} className="w-24 h-24 rounded-lg overflow-hidden shrink-0 bg-amber-50">
                <img src={product.image || "/cover.png"} alt={product.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).src = "/cover.png"; }} />
              </Link>
              <Link to={`/product/${product.id}`} className="ml-4 flex flex-col justify-between py-1 flex-1">
                <div>
                  <h3 className="font-bold text-gray-800 pr-6 leading-tight">{product.name}</h3>
                  <p className="text-maroon font-semibold text-sm mt-1">₹{product.price} / kg</p>
                </div>
                <span className="self-end bg-maroon text-white text-xs font-bold px-4 py-1.5 rounded-full">
                  View
                </span>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
