import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, CheckCircle2 } from "lucide-react";
import { useCart } from "../../hooks/useCart";
import { apiFetch } from "../../lib/apiFetch";

declare global {
  interface Window {
    Razorpay?: any;
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise(resolve => {
    if (window.Razorpay) return resolve(true);

    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function Checkout() {
  const navigate = useNavigate();
  const { total, items, clearCart } = useCart();
  const tax = total * (5 / 105);
  const [method, setMethod] = useState("razorpay");
  const [success, setSuccess] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [loading, setLoading] = useState(false);
  const [razorpayPreparing, setRazorpayPreparing] = useState(false);
  const [razorpayDraftOrder, setRazorpayDraftOrder] = useState<any>(null);

  const isGuest = !localStorage.getItem("customerRole");

  const urlParams = new URLSearchParams(window.location.search);
  const tableId = urlParams.get("table_id") || sessionStorage.getItem("qr_table_id") || "Counter";

  const buildOrderPayload = () => ({
    table_id: tableId,
    order_status: "Paid",
    order_source: "QR Table Menu",
    payment_method: method,
    payment_mode: "Razorpay",
    customer_id: localStorage.getItem("customerId") || null,
    customer_phone: localStorage.getItem("customerPhone") || localStorage.getItem("employeePhone") || null,
    items: items.map(i => ({
      name: i.name,
      size: i.size,
      price: i.price,
      qty: i.qty,
      unit: i.unit || "pcs",
      note: i.note || "",
      product_id: i.product_id,
    })),
    tax_collected: total * 0.05,
  });

  const prepareRazorpayDraftOrder = async () => {
    const scriptReady = await loadRazorpayScript();
    if (!scriptReady || !window.Razorpay) {
      throw new Error("Razorpay checkout failed to load. Please try again.");
    }

    const draftOrder = buildOrderPayload();
    const createOrderRes = await apiFetch("/api/payments/razorpay/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draftOrder),
    });

    const createOrderData = await createOrderRes.json();
    if (!createOrderRes.ok) {
      throw new Error(
        createOrderData.items?.length
          ? `Not enough stock: ${createOrderData.items.join(", ")}`
          : (createOrderData.error || "Unable to start Razorpay payment.")
      );
    }

    return createOrderData;
  };

  useEffect(() => {
    let cancelled = false;

    if (method !== "razorpay" || items.length === 0 || success) {
      setRazorpayDraftOrder(null);
      setRazorpayPreparing(false);
      return;
    }

    const preload = async () => {
      setRazorpayPreparing(true);

      try {
        const draftOrder = await prepareRazorpayDraftOrder();
        if (cancelled) return;
        setRazorpayDraftOrder(draftOrder);
      } catch (error: any) {
        if (cancelled) return;
        setOrderError(error?.message || "Unable to prepare Razorpay checkout.");
        setRazorpayDraftOrder(null);
      } finally {
        if (!cancelled) setRazorpayPreparing(false);
      }
    };

    preload();

    return () => {
      cancelled = true;
    };
  }, [method, items, total, success]);

  const placeRazorpayOrder = async () => {
    try {
      const draftOrder = buildOrderPayload();
      const createOrderData = razorpayDraftOrder ?? await prepareRazorpayDraftOrder();
      setRazorpayDraftOrder(createOrderData);

      return await new Promise<boolean>(resolve => {
        const razorpay = new window.Razorpay({
          key: createOrderData.keyId,
          amount: createOrderData.amount,
          currency: createOrderData.currency,
          name: createOrderData.name,
          description: createOrderData.description,
          order_id: createOrderData.razorpayOrderId,
          prefill: {
            name: localStorage.getItem("customerName") || "Customer",
            contact: localStorage.getItem("employeePhone") || "",
          },
          theme: { color: "#6b1f1f" },
          modal: {
            ondismiss: () => {
              setLoading(false);
              resolve(false);
            },
          },
          handler: async (response: any) => {
            try {
              const verifyRes = await apiFetch("/api/payments/razorpay/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ...response,
                  orderData: draftOrder,
                }),
              });
              const verifyData = await verifyRes.json();
              if (!verifyRes.ok) {
                setOrderError(verifyData.error || "Payment succeeded, but order verification failed.");
                setLoading(false);
                resolve(false);
                return;
              }

              clearCart();
              setSuccess(true);
              setLoading(false);
              resolve(true);
            } catch {
              setOrderError("Payment verification failed. Please contact support if money was deducted.");
              setLoading(false);
              resolve(false);
            }
          },
        });

        razorpay.on("payment.failed", (response: any) => {
          setOrderError(response?.error?.description || "Payment failed. Please try again.");
          setLoading(false);
          resolve(false);
        });

        razorpay.open();
      });
    } catch (error: any) {
      setOrderError(error?.message || "Unable to start Razorpay payment.");
      setLoading(false);
      return false;
    }
  };

  if (isGuest) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-cream-light p-6 text-center pb-20">
        <p className="text-gray-600 mb-4 font-semibold">Please sign in with your phone number to place an order.</p>
        <button onClick={() => navigate("/login")} className="w-full bg-maroon text-cream font-bold py-4 rounded-xl hover:bg-maroon-light transition-colors shadow-md text-lg">
          Sign In
        </button>
      </div>
    );
  }

  const handlePlaceOrder = async () => {
    if (items.length === 0) return;
    setOrderError("");
    setLoading(true);

    try {
      await placeRazorpayOrder();
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-cream-light p-6 text-center pb-20">
        <CheckCircle2 size={80} className="text-green-500 mb-6" />
        <h2 className="font-serif text-3xl text-maroon font-bold mb-2">Order Placed!</h2>
        <p className="text-gray-600 mb-8">Your sweetness is being prepared. Track it from the orders menu.</p>
        <button onClick={() => navigate("/")} className="w-full bg-maroon text-cream font-bold py-4 rounded-xl hover:bg-maroon-light transition-colors shadow-md text-lg">
          Back to Home
        </button>
      </div>
    );
  }

  const methods = [{ id: "razorpay", name: "Razorpay" }];

  return (
    <div className="flex flex-col min-h-full bg-cream-light pb-40">
      <div className="bg-white p-4 flex items-center border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <button onClick={() => navigate(-1)} className="mr-4 text-maroon"><ChevronLeft size={24} /></button>
        <h2 className="font-serif text-xl text-gold font-bold uppercase tracking-wider">CHECKOUT</h2>
        {tableId !== "Counter" && <span className="ml-auto text-xs bg-maroon text-white px-2 py-1 rounded font-semibold">Table {tableId}</span>}
      </div>

      <div className="p-4">
        <h3 className="font-bold text-gray-800 mb-4 text-sm uppercase tracking-wider">Payment Method</h3>
        <div className="space-y-3">
          {methods.map(m => (
            <label key={m.id} onClick={() => setMethod(m.id)} className={`flex items-center p-4 rounded-xl border-2 transition-colors cursor-pointer ${method === m.id ? "border-maroon bg-maroon/5" : "border-gray-200 bg-white"}`}>
              <div className={`w-5 h-5 rounded-full border-2 mr-4 flex items-center justify-center shrink-0 ${method === m.id ? "border-maroon" : "border-gray-300"}`}>
                {method === m.id && <div className="w-2.5 h-2.5 rounded-full bg-maroon" />}
              </div>
              <span className="font-semibold text-gray-800">{m.name}</span>
              {m.id === "razorpay" && <span className="ml-auto text-xs text-blue-600 font-semibold">Secure</span>}
            </label>
          ))}
        </div>
      </div>

      <div className="fixed bottom-[64px] left-0 right-0 max-w-md mx-auto p-4 bg-white border-t border-gray-100 pb-safe shadow-[0_-5px_20px_rgba(0,0,0,0.05)] z-30">
        {orderError && (
          <p className="text-red-600 text-sm font-semibold mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{orderError}</p>
        )}
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs text-gray-500 uppercase font-bold tracking-wider">Total to pay</span>
            <span className="text-xl font-bold text-maroon">₹{total.toFixed(2)}</span>
            <span className="text-xs text-gray-400 mt-0.5">Incl. Tax 5%: ₹{tax.toFixed(2)}</span>
          </div>
          <button onClick={handlePlaceOrder} disabled={loading}
            className="bg-maroon text-cream font-bold px-8 py-3.5 rounded-xl hover:bg-maroon-light transition-colors shadow-md text-lg disabled:opacity-60">
            {loading ? (method === "razorpay" ? "Opening..." : "Placing...") : "Place Order"}
          </button>
        </div>
      </div>
    </div>
  );
}
