import { useState, useEffect } from "react";
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Gallery() {
  const navigate = useNavigate();
  const [photos, setPhotos] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/gallery").then(r => r.json()).then(d => setPhotos(Array.isArray(d) ? d : []));
  }, []);

  return (
    <div className="flex flex-col min-h-full bg-cream-light pb-24">
      <div className="bg-white p-4 flex items-center border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <button onClick={() => navigate(-1)} className="mr-4 text-maroon">
          <ChevronLeft size={24} />
        </button>
        <h2 className="font-serif text-xl text-gold font-bold uppercase tracking-wider">GALLERY</h2>
      </div>

      <div className="p-4 flex-1">
        {photos.length === 0 && (
          <p className="text-center text-gray-400 py-12 italic">No photos yet.</p>
        )}
        {photos.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-4 mb-4">
              {photos.slice(0, 2).map(photo => (
                <div key={photo.id} className="rounded-xl overflow-hidden shadow-sm bg-white border border-gray-100 flex flex-col">
                  <img src={photo.url} alt={photo.title} className="w-full h-32 object-cover" onError={e => { (e.target as HTMLImageElement).src = "/cover.png"; }} />
                  <div className="p-2 flex-1 flex items-center justify-center text-center">
                    <h3 className="font-serif text-maroon font-bold text-sm leading-tight">{photo.title}</h3>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-4">
              {photos.slice(2).map(photo => (
                <div key={photo.id} className="rounded-xl overflow-hidden shadow-sm bg-white border border-gray-100">
                  <img src={photo.url} alt={photo.title} className="w-full h-56 object-cover" onError={e => { (e.target as HTMLImageElement).src = "/cover.png"; }} />
                  <div className="p-3">
                    <h3 className="font-serif text-maroon font-bold text-lg">{photo.title}</h3>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="p-6 text-center text-gray-500 text-sm">
        <p>© 2026 Papriwale. All Rights Reserved.</p>
      </div>
    </div>
  );
}
