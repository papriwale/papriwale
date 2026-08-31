import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

export default function Categories() {
  const [categories, setCategories] = useState<any[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetch("/api/categories").then(r => r.json()).then(d => setCategories(Array.isArray(d) ? d : []));
  }, []);

  return (
    <div className="flex flex-col min-h-full bg-cream-light pb-24">
      {/* Header */}
      <div className="bg-white p-4 flex items-center border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <button onClick={() => navigate(-1)} className="mr-4 text-maroon">
          <ChevronLeft size={24} />
        </button>
        <h2 className="font-serif text-xl text-gold font-bold uppercase tracking-wider">CATEGORIE</h2>
      </div>

      <div className="p-4 grid grid-cols-3 gap-3">
        {categories.map(cat => (
          <Link key={cat.id} to={`/category/${cat.id}`} className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 aspect-[4/5] relative group">
            <img src={cat.image} alt={cat.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" onError={e => { (e.target as HTMLImageElement).src = "/cover.png"; }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end justify-center pb-3">
              <span className="text-white font-bold text-[10px] sm:text-xs uppercase tracking-wider text-center px-1 leading-tight">{cat.name}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
