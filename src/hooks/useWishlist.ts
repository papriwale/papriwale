import { useState, useEffect } from "react";

export function useWishlist() {
  const [wishlist, setWishlist] = useState<string[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("wishlist");
    if (saved) {
      try {
        setWishlist(JSON.parse(saved));
      } catch (e) {
        // ignore
      }
    }

    const handleStorageChange = () => {
      const updated = localStorage.getItem("wishlist");
      if (updated) {
        setWishlist(JSON.parse(updated));
      } else {
        setWishlist([]);
      }
    };

    window.addEventListener("wishlist_updated", handleStorageChange);
    return () => window.removeEventListener("wishlist_updated", handleStorageChange);
  }, []);

  const toggleWishlist = (productId: string) => {
    setWishlist(prev => {
      let next;
      if (prev.includes(productId)) {
        next = prev.filter(id => id !== productId);
      } else {
        next = [...prev, productId];
      }
      localStorage.setItem("wishlist", JSON.stringify(next));
      window.dispatchEvent(new Event("wishlist_updated"));
      return next;
    });
  };

  const isInWishlist = (productId: string) => wishlist.includes(productId);

  return { wishlist, toggleWishlist, isInWishlist };
}
