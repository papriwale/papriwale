import { useEffect, useState, useRef } from "react";
import { ChevronRight, ChevronLeft, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { useCart } from "../../hooks/useCart";
import { apiFetch } from "../../lib/apiFetch";

const DEFAULT_SLIDES = [
  { image: "https://images.pexels.com/photos/1028714/pexels-photo-1028714.jpeg?auto=compress&cs=tinysrgb&w=800", label: "Premium Sweets",   sub: "Handcrafted with love" },
  { image: "https://images.pexels.com/photos/4449068/pexels-photo-4449068.jpeg?auto=compress&cs=tinysrgb&w=800", label: "Fresh Namkeen",    sub: "Crispy & flavourful" },
  { image: "https://images.pexels.com/photos/1775043/pexels-photo-1775043.jpeg?auto=compress&cs=tinysrgb&w=800", label: "Bakery Delights",  sub: "Baked fresh daily" },
  { image: "https://images.pexels.com/photos/9609847/pexels-photo-9609847.jpeg?auto=compress&cs=tinysrgb&w=800", label: "Festival Specials", sub: "Order for every occasion" },
];

export default function Home() {
  const [categories, setCategories] = useState<any[]>([]);
  const [bestsellers, setBestsellers] = useState<any[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [slides, setSlides] = useState<any[]>([]);
  const [slideIndex, setSlideIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ type: "product" | "category"; id: string; name: string; sub: string; image: string; to: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const touchStartX = useRef(0);

  // Auto-advance slideshow every 3.5s
  useEffect(() => {
    if (slides.length === 0) return;
    const t = setInterval(() => setSlideIndex(i => (i + 1) % slides.length), 3500);
    return () => clearInterval(t);
  }, [slides.length]);

  // Search filter — products + categories
  useEffect(() => {
    if (searchQuery.trim().length < 2) { setSearchResults([]); return; }
    const q = searchQuery.toLowerCase();
    const matchedProducts = allProducts
      .filter(p => p.name?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q))
      .slice(0, 5)
      .map(p => ({ type: "product" as const, id: p.id, name: p.name, sub: `₹${p.price}/kg`, image: p.image, to: `/product/${p.id}` }));
    const matchedCats = categories
      .filter(c => c.name?.toLowerCase().includes(q))
      .slice(0, 3)
      .map(c => ({ type: "category" as const, id: c.id, name: c.name, sub: "Browse category", image: c.image, to: `/category/${c.id}` }));
    setSearchResults([...matchedCats, ...matchedProducts]);
  }, [searchQuery, allProducts, categories]);

  useEffect(() => {
    apiFetch("/api/products?mobile=1")
      .then(res => res.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setAllProducts(list);
        setBestsellers(list.slice(0, 6));
      }).catch(() => {});

    apiFetch("/api/categories")
      .then(res => res.json())
      .then(data => setCategories(Array.isArray(data) ? data : []))
      .catch(() => {});

    apiFetch("/api/banners")
      .then(res => res.ok ? res.json() : Promise.reject(res.status))
      .then(data => setSlides(Array.isArray(data) && data.length > 0 ? data : DEFAULT_SLIDES))
      .catch(() => setSlides(DEFAULT_SLIDES));
  }, []);

  const categoryImages: Record<string, string> = {
    "Sweets":    "https://images.pexels.com/photos/1028714/pexels-photo-1028714.jpeg?auto=compress&cs=tinysrgb&w=200",
    "Namkeen":   "https://images.pexels.com/photos/4449068/pexels-photo-4449068.jpeg?auto=compress&cs=tinysrgb&w=200",
    "Bakery":    "https://images.pexels.com/photos/1775043/pexels-photo-1775043.jpeg?auto=compress&cs=tinysrgb&w=200",
    "Beverages": "https://images.pexels.com/photos/312418/pexels-photo-312418.jpeg?auto=compress&cs=tinysrgb&w=200",
    "Snacks":    "https://images.pexels.com/photos/1583884/pexels-photo-1583884.jpeg?auto=compress&cs=tinysrgb&w=200",
  };

  const getCatImage = (cat: any) => cat.image || categoryImages[cat.name] || "/cover.png";

  const getProductImage = (product: any) => {
    if (product.image) return product.image;
    const name = (product.name || "").toLowerCase();
    if (name.includes("gulab") || name.includes("jamun")) return "https://images.pexels.com/photos/14477896/pexels-photo-14477896.jpeg?auto=compress&cs=tinysrgb&w=200";
    if (name.includes("kaju") || name.includes("katli")) return "https://images.pexels.com/photos/1028714/pexels-photo-1028714.jpeg?auto=compress&cs=tinysrgb&w=200";
    if (name.includes("ladoo") || name.includes("laddoo")) return "https://images.pexels.com/photos/9609847/pexels-photo-9609847.jpeg?auto=compress&cs=tinysrgb&w=200";
    if (name.includes("barfi") || name.includes("burfi")) return "https://images.pexels.com/photos/1028714/pexels-photo-1028714.jpeg?auto=compress&cs=tinysrgb&w=200";
    if (name.includes("namkeen") || name.includes("sev") || name.includes("mixture")) return "https://images.pexels.com/photos/4449068/pexels-photo-4449068.jpeg?auto=compress&cs=tinysrgb&w=200";
    if (name.includes("cake") || name.includes("bread") || name.includes("bakery")) return "https://images.pexels.com/photos/1775043/pexels-photo-1775043.jpeg?auto=compress&cs=tinysrgb&w=200";
    if (name.includes("halwa") || name.includes("kheer")) return "https://images.pexels.com/photos/9609847/pexels-photo-9609847.jpeg?auto=compress&cs=tinysrgb&w=200";
    return "/cover.png";
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = direction === 'left' ? -120 : 120;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <div className="flex flex-col min-h-full space-y-6 pb-6 bg-cream-light">

      {/* Search Bar */}
      <div className="px-4 pt-4 relative">
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search sweets, namkeen, bakery..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:outline-none focus:border-maroon shadow-sm"
          />
        </div>
        {(searchResults.length > 0 || searchQuery.trim().length >= 2) && (
          <div className="absolute left-4 right-4 top-full mt-1 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
            {searchResults.length === 0 ? (
              <div className="px-4 py-5 text-center text-sm text-gray-400">No results for "{searchQuery}"</div>
            ) : (
              searchResults.map(r => (
                <Link
                  key={r.type + r.id}
                  to={r.to}
                  onClick={() => { setSearchQuery(""); setSearchResults([]); }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-cream-light border-b border-gray-50 last:border-0"
                >
                  {r.type === "category" ? (
                    <div className="w-10 h-10 rounded-lg bg-maroon/10 flex items-center justify-center shrink-0">
                      <span className="text-lg">🏪</span>
                    </div>
                  ) : (
                    <img src={r.image || "/cover.png"} alt={r.name} className="w-10 h-10 rounded-lg object-cover shrink-0" onError={e => { (e.target as HTMLImageElement).src = "/cover.png"; }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 text-sm truncate">{r.name}</p>
                    <p className="text-xs text-maroon font-bold">{r.sub}</p>
                  </div>
                  <span className="text-[10px] text-gray-400 shrink-0">{r.type === "category" ? "Category" : "Product"}</span>
                </Link>
              ))
            )}
          </div>
        )}
      </div>

      {/* Hero Slideshow */}
      {slides.length > 0 && (
      <div className="w-full relative shrink-0 px-4">
        <div className="h-52 w-full relative rounded-3xl overflow-hidden shadow-md"
          onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={e => {
            const diff = touchStartX.current - e.changedTouches[0].clientX;
            if (Math.abs(diff) > 40) setSlideIndex(i => diff > 0 ? (i + 1) % slides.length : (i - 1 + slides.length) % slides.length);
          }}
        >
          {slides.map((slide, i) => (
            <div
              key={i}
              className="absolute inset-0 transition-opacity duration-700"
              style={{ opacity: i === slideIndex ? 1 : 0 }}
            >
              <img src={slide.image} alt={slide.label} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
              <div className="absolute bottom-4 left-5">
                <p className="text-white font-serif font-bold text-xl leading-tight">{slide.label}</p>
                <p className="text-white/80 text-xs mt-0.5">{slide.sub}</p>
              </div>
            </div>
          ))}
          {/* Dot indicators */}
          <div className="absolute bottom-3 right-4 flex gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setSlideIndex(i)}
                className={`rounded-full transition-all duration-300 ${i === slideIndex ? "w-5 h-2 bg-white" : "w-2 h-2 bg-white/50"}`}
              />
            ))}
          </div>
        </div>
      </div>
      )}

      {/* Categories Rail */}
      <div className="px-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-serif text-maroon font-bold text-lg">Categories</h3>
        </div>
        <div className="relative group">
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-[90%] -translate-x-3 z-10 p-1.5 rounded-full bg-white/95 backdrop-blur border border-gray-200 text-maroon shadow-md focus:outline-none"
          >
            <ChevronLeft size={16} />
          </button>

          <div ref={scrollRef} className="flex space-x-4 overflow-x-auto pb-2 scrollbar-hide snap-x relative z-0">
            {categories.map(cat => (
              <Link key={cat.id} to={`/category/${cat.id}`} className="flex flex-col items-center space-y-2 shrink-0 w-20 snap-start">
                <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-gold/50 shadow-sm bg-amber-50">
                  <img src={getCatImage(cat)} alt={cat.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).src = "/cover.png"; }} />
                </div>
                <span className="text-xs font-semibold text-gray-700">{cat.name}</span>
              </Link>
            ))}
          </div>
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 -translate-y-[90%] translate-x-3 z-10 p-1.5 rounded-full bg-white/95 backdrop-blur border border-gray-200 text-maroon shadow-md focus:outline-none"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Best Sellers */}
      <div className="px-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-serif text-maroon font-bold text-lg">Best Sellers</h3>
          <Link to="/bestsellers" className="text-xs font-bold text-gold hover:text-gold-light">VIEW ALL</Link>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {bestsellers.map(product => (
            <Link key={product.id} to={`/product/${product.id}`} className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 flex flex-col">
              <div className="h-24 w-full bg-amber-50">
                <img src={getProductImage(product)} alt={product.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).src = "/cover.png"; }} />
              </div>
              <div className="p-2 flex flex-col flex-1 justify-between">
                <h4 className="font-bold text-[11px] text-gray-800 line-clamp-2 leading-tight mb-1">{product.name}</h4>
              <p className="text-maroon font-bold text-[10px] mt-1">₹{product.unit === "gm" ? (product.price * 1000).toFixed(0) : product.price}/{product.unit === "gm" ? "kg" : (product.unit || "pc")}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
