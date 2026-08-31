import { useState, useEffect } from "react";
import { ChevronLeft, FileText, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../lib/apiFetch";

export default function Orders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const getPaymentLabel = (order: any) => {
    const method = String(order.payment_method || order.payment_mode || "").toLowerCase();
    if (method === "upi") return "UPI / QR";
    if (method === "razorpay") return "Razorpay";
    if (method === "card") return "Card";
    if (method === "cash") return "Cash";
    return order.payment_mode || order.payment_method || "Payment";
  };

  const fetchOrders = () => {
    const customerId = localStorage.getItem("customerId");
    const customerPhone = localStorage.getItem("customerPhone") || localStorage.getItem("employeePhone");
    if (!customerId && !customerPhone) { setOrders([]); setLoading(false); return; }
    setLoading(true);
    const params = new URLSearchParams();
    if (customerId) params.set("customer_id", customerId);
    if (customerPhone) params.set("customer_phone", customerPhone);
    apiFetch(`/api/orders?${params.toString()}`)
      .then(r => r.json())
      .then(d => setOrders(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchOrders();
    window.addEventListener("customerProfileUpdated", fetchOrders);
    return () => window.removeEventListener("customerProfileUpdated", fetchOrders);
  }, []);

  return (
    <div className="flex flex-col min-h-full bg-cream-light pb-24">
      <div className="bg-white p-4 flex items-center border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <button onClick={() => navigate(-1)} className="mr-4 text-maroon"><ChevronLeft size={24} /></button>
        <h2 className="font-serif text-xl text-gold font-bold uppercase tracking-wider">MY ORDERS</h2>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto" style={{ maxHeight: "calc(7 * 140px)" }}>
        {loading ? (
          <div className="flex justify-center py-12 text-maroon"><Loader2 size={32} className="animate-spin" /></div>
        ) : orders.length === 0 ? (
          <div className="text-center text-gray-400 py-12 flex flex-col items-center">
            <FileText size={48} className="mb-4 opacity-20" />
            <p>No order history yet</p>
          </div>
        ) : (
          orders.map((order, i) => (
            <div key={order.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-gray-800 text-sm">{order.id}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${order.order_status === "Paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                  {order.order_status}
                </span>
              </div>
              <p className="text-xs text-gray-400 mb-3">{new Date(order.timestamp).toLocaleString()}</p>
              <div className="space-y-1 mb-3">
                {order.items?.map((item: any, j: number) => (
                  <div key={j} className="flex items-center gap-3 py-1">
                    {item.image
                      ? <img src={item.image} alt={item.name} className="w-10 h-10 rounded-lg object-cover shrink-0 border border-gray-100" onError={e => { (e.target as HTMLImageElement).src = "/cover.png"; }} />
                      : <img src="/cover.png" alt={item.name} className="w-10 h-10 rounded-lg object-cover shrink-0 border border-gray-100" />}
                    <div className="flex-1 flex justify-between text-xs text-gray-600">
                      <span className="font-medium">{item.name} {item.size ? `(${item.size})` : ""} ×{item.qty}</span>
                      <span className="font-bold text-maroon">₹{(item.price * item.qty).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                <span className="text-xs text-gray-500 capitalize">
                  {getPaymentLabel(order)}
                  {order.table_id ? ` • Table ${order.table_id}` : ""}
                </span>
                <span className="font-bold text-maroon">₹{Number(order.grand_total).toFixed(2)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
