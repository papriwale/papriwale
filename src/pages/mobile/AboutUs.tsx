import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function AboutUs() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col min-h-full bg-cream-light pb-24">
      <div className="bg-white p-4 flex items-center border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <button onClick={() => navigate(-1)} className="mr-4 text-maroon">
          <ChevronLeft size={24} />
        </button>
        <h2 className="font-serif text-xl text-gold font-bold uppercase tracking-wider">ABOUT US</h2>
      </div>

      <div className="p-6 bg-white m-4 rounded-xl shadow-sm border border-gray-100 space-y-6">
        <section>
          <h3 className="font-serif text-2xl text-maroon font-bold mb-3">Our Story</h3>
          <div className="space-y-4 text-gray-700 leading-relaxed text-sm">
            <p>
              Badrinarayan Papriwale began as a tiny shop in Buxar (Bihar), the land of Maharishi Viswamitra Tapobhumi. By 1948, Badrinarayan ji tried to make some new type of sweet and after attempting many tries he finally satisfied by making one. And that was named as Papri.
            </p>
            <p>
              Badrinarayan ji was the person who discoved this sweet in buxar(Bihar),and after that the buxar is famous for his delicious papri.
            </p>
            <p>
              Today also our brand name is running by his name Badrinarayan Papriwale, which is the oldest shop in buxar(Bihar).
            </p>
            <p>
              Our papri is famous in many cities and its being an owner that we are starting the online delivery of it. As many people are unable to come to our city and they cannot have the taste of it.
            </p>
          </div>
        </section>

        <section>
          <h3 className="font-serif text-xl text-maroon font-bold mb-3">Rooted in Tradition, Crafted with Love</h3>
          <p className="text-gray-700 leading-relaxed text-sm">
            Welcome to our sweet world, where every bite tells a story of heritage, purity, and passion. We are proud to be based in Buxar, a culturally rich town located in the heart of Bihar, known for its historical significance and age-old traditions.
          </p>
        </section>

        <section>
          <h3 className="font-serif text-xl text-maroon font-bold mb-3">Buxar – A Town Steeped in Heritage</h3>
          <div className="space-y-4 text-gray-700 leading-relaxed text-sm">
            <p>
              Nestled on the banks of the sacred Ganges River, Buxar is a land that blends mythology, history, and culture. From being a key battleground during historic events like the Battle of Buxar (1764) to being home to spiritual legends like Maharishi Vishwamitra and Lord Ram’s guru, Vasishtha, the town is deeply woven into India’s ancient narrative.
            </p>
            <p>
              But Buxar is not only known for its history—it’s also a treasure trove of authentic Bihari culinary delights, especially traditional Indian sweets that have been passed down through generations.
            </p>
          </div>
        </section>
        
        <div className="rounded-lg overflow-hidden my-4 shadow-sm border border-gray-200">
          <img src="https://images.unsplash.com/photo-1559598467-f8b76c8155d0?q=80&w=1471&auto=format&fit=crop" alt="Indian Sweets" className="w-full h-48 object-cover" />
        </div>

        <section>
          <h3 className="font-serif text-xl text-maroon font-bold mb-3">The Sweet Soul of Buxar – Soan Papdi</h3>
          <div className="space-y-4 text-gray-700 leading-relaxed text-sm">
            <p>
              Among the wide variety of sweets our town is known for, Soan Papdi holds a special place. Light, flaky, and melt-in-the-mouth, this golden-hued delicacy is more than just a dessert—it’s a celebration in every bite.
            </p>
            <p>
              In Buxar, Soan Papdi is not mass-produced; it is handcrafted with love using traditional methods and the finest ingredients: pure ghee, gram flour, sugar, and cardamom. Each piece is carefully spun to achieve that signature layered, airy texture that makes it irresistible. It’s often shared during festivals, weddings, and special occasions as a symbol of joy and hospitality.
            </p>
          </div>
        </section>

        <section>
          <h3 className="font-serif text-xl text-maroon font-bold mb-3">Our Promise</h3>
          <p className="text-gray-700 leading-relaxed text-sm">
            At our shop, we carry forward this legacy by preparing sweets the traditional way, with a deep respect for purity and taste. Whether it’s our signature Soan Papdi or our wide range of other mithai, you’ll always find a sweet connection to Buxar in every box.
          </p>
        </section>
        
        <section>
          <h3 className="font-serif text-xl text-maroon font-bold mb-3">Directors</h3>
          <p className="text-gray-700 leading-relaxed text-sm font-medium text-center mb-4">
            Mrs. Kavita Devi and Mr. arun kumar
          </p>
          <div className="flex justify-center mb-4">
            <div className="w-48 h-48 bg-gray-200 rounded-2xl border-4 border-cream-light shadow-sm flex items-center justify-center overflow-hidden">
              <span className="text-gray-400 text-xs">Director Photo</span>
              {/* <img src="director-photo-url.jpg" alt="Directors" className="w-full h-full object-cover" /> */}
            </div>
          </div>
        </section>

        <div className="pt-6 border-t border-gray-100 mt-6 text-center">
          <p className="text-sm text-gray-700 mb-2">Nationwide delivery is now available! Get your favorite Papri delivered anywhere in India by visiting</p>
          <a href="https://www.papriwale.com" className="text-maroon font-bold text-lg hover:underline">www.papriwale.com</a>
        </div>
      </div>
    </div>
  );
}
