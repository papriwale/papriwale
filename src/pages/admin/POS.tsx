import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, Trash2, Printer, ShoppingCart, X, FileDown, EyeOff } from "lucide-react";
import { useAccess } from "../../hooks/useAccess";
import { apiFetch } from "../../lib/apiFetch";
import { getCurrentBusinessDateString, toBusinessDateString } from "../../lib/businessTime";
import { usePrinter } from "../../hooks/usePrinter";

export default function POS() {
  const [products, setProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [discountFlat, setDiscountFlat] = useState(0);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [otherCharges, setOtherCharges] = useState(0);
  const [otherChargesDesc, setOtherChargesDesc] = useState("");
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [customerPhone, setCustomerPhone] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [analytics, setAnalytics] = useState({ totalRevenue: 0, totalSales: 0, totalOrders: 0, lowStock: 0, outOfStock: 0, totalProducts: 0 });
  const [allVariants, setAllVariants] = useState<any[]>([]);
  const [variantModal, setVariantModal] = useState<{ product: any; variants: any[] } | null>(null);
  const [variantSize, setVariantSize] = useState("");
  const [variantQty, setVariantQty] = useState(1);
  const [variantCustomPrice, setVariantCustomPrice] = useState<number | "">("");
  const [variantAmount, setVariantAmount] = useState<number | "">("");
  const [quickAddModal, setQuickAddModal] = useState<{ product: any } | null>(null);
  const [quickQty, setQuickQty] = useState<number | "">("");
  const [quickAmount, setQuickAmount] = useState<number | "">("");
  const [variantUnit, setVariantUnit] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [totalUnitsSold, setTotalUnitsSold] = useState(0);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [posTab, setPosTab] = useState<"billing" | "deleted">("billing");
  const [deletedOrders, setDeletedOrders] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const addActionLockRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const fetchDeletedOrders = () =>
    apiFetch("/api/deleted-bills").then(r => r.json()).then((d: any[]) =>
      setDeletedOrders(Array.isArray(d) ? d : [])
    );

  // Generate a stable invoice number once per billing session
  const generateInvoiceNo = () => {
    const ts = Date.now();
    setInvoiceNo(`INV-${new Date().getFullYear()}-${ts.toString().slice(-6)}`);
  };

  const access = useAccess("POS Billing");
  const isReadOnly = access === "Read-Only";
  const { printReceipt, openCashDrawer } = usePrinter();
  const isWeightBasedUnit = (unit?: string) => (unit || "pcs").toLowerCase() !== "pcs";

  const refreshAnalytics = () => {
    const today = getCurrentBusinessDateString();
    Promise.all([
      apiFetch("/api/analytics").then(res => res.json()),
      apiFetch("/api/orders").then(res => res.json()),
    ]).then(([a, orders]) => {
      setAnalytics(a || analytics);
      const units = (Array.isArray(orders) ? orders : [])
        .filter((o: any) => {
          if (o.order_status !== "Paid" || (!o.timestamp && !o.created_at)) return false;
          return toBusinessDateString(o.timestamp || o.created_at) === today;
        })
        .reduce((sum: number, o: any) => sum + (o.items?.reduce((s: number, it: any) => s + (it.qty || 1), 0) || 0), 0);
      setTotalUnitsSold(units);
    });
  };

  useEffect(() => {
    apiFetch("/api/products").then(res => res.json()).then(data => {
      const list = Array.isArray(data) ? data : [];
      setProducts(list);
    });
    refreshAnalytics();
    apiFetch("/api/product-variants").then(res => res.json()).then(data => setAllVariants(Array.isArray(data) ? data : []));
    fetchDeletedOrders();
    generateInvoiceNo();

    const onStockUpdated = () => {
      apiFetch("/api/products").then(res => res.json()).then(data => {
        const list = Array.isArray(data) ? data : [];
        setProducts(list);
      });
      refreshAnalytics();
    };
    window.addEventListener("stock-updated", onStockUpdated);
    return () => window.removeEventListener("stock-updated", onStockUpdated);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (posTab !== "billing") return;
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const isEditableTarget =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (isEditableTarget || searchInputRef.current === target) return;

      if (event.key === "Backspace") {
        event.preventDefault();
        setSearchQuery(prev => prev.slice(0, -1));
        searchInputRef.current?.focus();
        return;
      }

      if (event.key.length !== 1) return;

      event.preventDefault();
      let nextValue = "";
      setSearchQuery(prev => {
        nextValue = `${prev}${event.key}`;
        return nextValue;
      });
      searchInputRef.current?.focus();
      window.requestAnimationFrame(() => {
        const input = searchInputRef.current;
        if (!input) return;
        const end = input.value.length;
        input.setSelectionRange(end, end);
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [posTab]);

  const filteredProducts = useMemo(() => {
    let result = products;
    if (categoryFilter !== "All") result = result.filter(p => p.category === categoryFilter);
    if (deferredSearchQuery.trim()) {
      const q = deferredSearchQuery.toLowerCase();
      result = result.filter(p => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q));
    }
    return result;
  }, [categoryFilter, deferredSearchQuery, products]);

  const categories = useMemo(() => ["All", ...Array.from(new Set(products.map(p => p.category)))], [products]);

  const handleAddToBill = (product: any) => {
    if (addActionLockRef.current) return;
    addActionLockRef.current = true;
    window.setTimeout(() => {
      addActionLockRef.current = false;
    }, 250);

    if (product.current_stock_qty <= 0) return;
    const productVariants = allVariants.filter(v => v.product_id === product.id);
    if (productVariants.length > 0) {
      setVariantModal({ product, variants: productVariants });
      setVariantSize(productVariants[0].size_label);
      setVariantQty(1);
      const defaultPrice = product.price * productVariants[0].variant_price_modifier;
      setVariantCustomPrice(defaultPrice);
      setVariantAmount(defaultPrice);
      setVariantUnit(product.unit || "pcs");
    } else {
      setQuickAddModal({ product });
      setQuickQty("");
      setQuickAmount("");
    }
  };

  const confirmVariantAdd = () => {
    if (addActionLockRef.current) return;
    addActionLockRef.current = true;
    window.setTimeout(() => {
      addActionLockRef.current = false;
    }, 250);

    if (!variantModal) return;
    const selectedVariant = variantModal.variants.find(v => v.size_label === variantSize);
    const basePrice = selectedVariant ? variantModal.product.price * selectedVariant.variant_price_modifier : variantModal.product.price;
    const isWeightBased = isWeightBasedUnit(variantModal.product.unit);
    const finalPrice = isWeightBased && variantAmount !== "" && variantQty > 0
      ? Number((Number(variantAmount) / variantQty).toFixed(4))
      : (variantCustomPrice !== "" ? Number(variantCustomPrice) : basePrice);
    const key = `${variantModal.product.id}-${variantSize}`;
    const alreadyInCart = cart.find(item => item.id === key)?.qty || 0;
    if (alreadyInCart + variantQty > variantModal.product.current_stock_qty) {
      alert(`Only ${variantModal.product.current_stock_qty} ${variantUnit || "pcs"} available for "${variantModal.product.name}".`);
      return;
    }
    setCart(prev => {
      const existing = prev.find(item => item.id === key);
      if (existing) return prev.map(item => item.id === key ? { ...item, qty: item.qty + variantQty, price: finalPrice } : item);
      return [...prev, { ...variantModal.product, id: key, product_id: variantModal.product.id, size: variantSize, price: finalPrice, qty: variantQty, unit: variantUnit }];
    });
    setVariantModal(null);
    setSearchQuery("");
  };

  const confirmQuickAdd = () => {
    if (addActionLockRef.current) return;
    addActionLockRef.current = true;
    window.setTimeout(() => {
      addActionLockRef.current = false;
    }, 250);

    if (!quickAddModal) return;
    const p = quickAddModal.product;
    const unit = (p.unit || "pcs").toLowerCase();
    const isGm = unit === "gm";
    const isKg = unit === "kg";
    const isWeightBased = isGm || isKg;
    const finalQty = isWeightBased
      ? (quickQty !== "" ? Number(quickQty) : quickAmount !== "" ? parseFloat((Number(quickAmount) / p.price).toFixed(3)) : 0)
      : (quickQty !== "" ? Number(quickQty) : 0);
    if (!finalQty || finalQty <= 0) return;
    const alreadyInCart = cart.find(item => item.id === p.id)?.qty || 0;
    const totalRequested = alreadyInCart + finalQty;
    if (totalRequested > p.current_stock_qty) {
      alert(`Only ${p.current_stock_qty} ${p.unit || "pcs"} available for "${p.name}".`);
      return;
    }
    setCart(prev => {
      const existing = prev.find(item => item.id === p.id);
      if (existing) return prev.map(item => item.id === p.id ? { ...item, qty: item.qty + finalQty } : item);
      return [...prev, { ...p, price: p.price, qty: finalQty, unit: p.unit || "pcs" }];
    });
    setQuickAddModal(null);
    setQuickQty("");
    setQuickAmount("");
    setSearchQuery("");
  };

  const updateCartPrice = (id: string, price: number) => {
    setCart(prev => prev.map(item => item.id === id ? { ...item, price: Math.max(0, price) } : item));
  };

  const updateCartQty = (id: string, qty: number) => {
    setCart(prev => prev.map(item => {
      if (item.id !== id) return item;
      const productId = item.product_id || item.id;
      const product = products.find((p: any) => p.id === productId);
      const maxQty = product?.current_stock_qty ?? Infinity;
      const unit = (item.unit || product?.unit || "pcs").toLowerCase();
      const isWeightBased = unit === "gm" || unit === "kg";
      const clamped = isWeightBased
        ? Math.min(Math.max(0.01, qty), maxQty)
        : Math.min(Math.max(1, Math.round(qty)), Math.max(1, Math.floor(maxQty)));
      if (qty > maxQty) alert(`Only ${maxQty} ${item.unit || "pcs"} available for "${item.name}".`);
      return { ...item, qty: clamped };
    }));
  };

  const updateCartUnit = (id: string, unit: string) => {
    setCart(prev => prev.map(item => item.id === id ? { ...item, unit } : item));
  };

  const removeFromCart = (id: string) => setCart(prev => prev.filter(item => item.id !== id));

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + (item.price * item.qty), 0), [cart]);
  const clampedFlat = useMemo(() => Math.min(Math.max(0, discountFlat), subtotal), [discountFlat, subtotal]);
  const clampedPercent = useMemo(() => Math.min(Math.max(0, discountPercent), 100), [discountPercent]);
  const discountTotal = useMemo(() => (discountFlat > 0 ? clampedFlat : subtotal * (clampedPercent / 100)), [clampedFlat, clampedPercent, discountFlat, subtotal]);
  // Tax is informational only - NOT added to grand total
  const taxes = useMemo(() => (subtotal - discountTotal) * 0.05, [subtotal, discountTotal]);
  const grandTotal = useMemo(() => Math.max(0, (subtotal - discountTotal) + otherCharges), [subtotal, discountTotal, otherCharges]);


  const handleExportPDF = async () => {
    if (cart.length === 0) return;
    const { default: jsPDF } = await import("jspdf");
    // Thermal receipt: 80mm = ~226.77pt
    const pageW = 226.77;
    const doc = new jsPDF({ unit: "pt", format: [pageW, 800] });
    const cx = pageW / 2;
    const dash = "-".repeat(38);
    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2,"0")}/${String(now.getMonth()+1).padStart(2,"0")}/${String(now.getFullYear()).slice(-2)}`;
    const timeStr = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    const cashier = localStorage.getItem("adminName") || "ADMIN";
    const totalQty = cart.reduce((s, i) => s + i.qty, 0);

    let y = 18;
    const line = (txt: string, size: number, bold = false, align: "center"|"left"|"right" = "center", x = cx) => {
      doc.setFont("courier", bold ? "bold" : "normal");
      doc.setFontSize(size);
      doc.setTextColor(0);
      doc.text(txt, x, y, { align });
      y += size * 1.5;
    };
    const divider = () => { line(dash, 7, false, "center"); };

    // Header
    line("Shri Badrinarayan Papriwale", 11, true);
    line("Sweets | Namkeen | Bakery", 7.5, false);
    y += 2;
    line("Main Road, Buxar, Bihar - 802101", 7);
    line("Ph: +91 9876543210", 7);
    y += 2;
    line("GST No: 10AAAAA0000A1Z5", 7);
    line("FSSAI: 11225302002361", 7);
    divider();

    // Bill meta
    doc.setFont("courier", "normal"); doc.setFontSize(7); doc.setTextColor(0);
    const lx = 10, rx = pageW - 10;
    const metaRow = (left: string, right: string) => {
      doc.text(left, lx, y);
      doc.text(right, rx, y, { align: "right" });
      y += 10;
    };
    metaRow(`Date: ${dateStr}`, `Time: ${timeStr}`);
    metaRow(`Cashier: ${cashier.toUpperCase()}`, `Bill No: ${invoiceNo.slice(-5)}`);
    metaRow(`Payment: ${paymentMode}`, "");
    doc.setFont("courier", "normal"); doc.setFontSize(7);
    doc.text("Name: ___________________________", lx, y); y += 10;
    divider();

    // Table header
    doc.setFont("courier", "bold"); doc.setFontSize(7);
    doc.text("Item", lx, y);
    doc.text("Qty", 130, y, { align: "right" });
    doc.text("Rate", 168, y, { align: "right" });
    doc.text("Amt", rx, y, { align: "right" });
    y += 10;
    divider();

    // Items
    doc.setFont("courier", "normal"); doc.setFontSize(7);
    cart.forEach(item => {
      const isGm = (item.unit || "").toLowerCase() === "gm";
      const displayQty = isGm ? `${(item.qty / 1000).toFixed(3)}kg` : String(item.qty);
      const displayRate = isGm ? (item.price * 1000).toFixed(2) : item.price.toFixed(2);
      const name = (item.name + (item.size ? ` (${item.size})` : "")).slice(0, 22);
      const amt = (item.price * item.qty).toFixed(2);
      doc.text(name, lx, y);
      doc.text(displayQty, 130, y, { align: "right" });
      doc.text(displayRate, 168, y, { align: "right" });
      doc.text(amt, rx, y, { align: "right" });
      y += 10;
    });
    divider();

    // Totals
    doc.setFont("courier", "normal"); doc.setFontSize(7);
    doc.text(`Total Qty: ${totalQty}`, lx, y);
    doc.text(`Sub Total: Rs.${subtotal.toFixed(2)}`, rx, y, { align: "right" });
    y += 10;
    if (otherCharges > 0) { doc.text(`Other Charges:`, lx, y); doc.text(`Rs.${otherCharges.toFixed(2)}`, rx, y, { align: "right" }); y += 10; }
    doc.text(`Tax 5% (incl.):`, lx, y); doc.text(`Rs.${taxes.toFixed(2)}`, rx, y, { align: "right" }); y += 10;
    divider();

    // Grand Total
    doc.setFont("courier", "bold"); doc.setFontSize(11);
    doc.text("Grand Total", lx, y);
    doc.text(`Rs.${grandTotal.toFixed(2)}`, rx, y, { align: "right" });
    y += 16;
    doc.setFont("courier", "normal"); doc.setFontSize(7);
    doc.text(`Paid via: ${paymentMode}`, cx, y, { align: "center" }); y += 10;
    divider();

    // Footer
    line("Thank You & Visit Again..!!", 7.5, true);
    line("www.papriwale.com", 6.5, false);

    // Trim page height
    const finalH = y + 20;
    const doc2 = new jsPDF({ unit: "pt", format: [pageW, finalH] });
    doc2.setFont("courier", "normal");
    // Re-render into correctly sized doc
    doc.save(`receipt-${invoiceNo}.pdf`);
  };

  const printViaIframe = (html: string) => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 300);
  };

  const printSubBills = (billNo: string) => {
    const categoryMap: Record<string, any[]> = {};
    cart.forEach((item: any) => {
      const cat = item.category || "General";
      if (!categoryMap[cat]) categoryMap[cat] = [];
      categoryMap[cat].push(item);
    });
    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2,"0")}/${String(now.getMonth()+1).padStart(2,"0")}/${String(now.getFullYear()).slice(-2)}`;
    const timeStr = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    Object.entries(categoryMap).forEach(([category, items], idx) => {
      setTimeout(() => {
        const itemsHtml = items.map((item: any) => {
          const name = (item.name + (item.size ? ` (${item.size})` : "")).slice(0, 28);
          return `<div class="row"><span>${name}</span><span>x${item.qty}</span></div>`;
        }).join("");
        printViaIframe(`<html><head><style>
          *{margin:0;padding:0;box-sizing:border-box}
          body{font-family:'Courier New',Courier,monospace;font-size:11px;color:#000;background:#fff;width:300px;margin:0 auto;padding:10px 6px}
          .center{text-align:center}.bold{font-weight:bold}
          .title{font-size:14px;font-weight:bold;text-align:center}
          .div{text-align:center;font-size:10px;margin:4px 0}
          .row{display:flex;justify-content:space-between;font-size:10px;margin:2px 0}
          @page{size:80mm auto;margin:0}@media print{body{width:80mm;margin:0 auto}}
        </style></head><body>
          <div class="title">** KITCHEN / COUNTER SLIP **</div>
          <div class="title" style="font-size:12px;margin-top:2px">${category.toUpperCase()} COUNTER</div>
          <div class="div">--------------------------------</div>
          <div class="row"><span>Bill No: ${billNo.slice(-5)}</span><span>${dateStr} ${timeStr}</span></div>
          <div class="div">--------------------------------</div>
          <div class="row bold"><span><b>Item</b></span><span><b>Qty</b></span></div>
          <div class="div">--------------------------------</div>
          ${itemsHtml}
          <div class="div">--------------------------------</div>
          <div class="center">Total Items: ${items.reduce((s: number, i: any) => s + i.qty, 0)}</div>
        </body></html>`);
      }, idx * 400);
    });
  };

  const handlePrint = () => {
    if (cart.length === 0) return;
    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2,"0")}/${String(now.getMonth()+1).padStart(2,"0")}/${String(now.getFullYear()).slice(-2)}`;
    const timeStr = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    const cashier = (localStorage.getItem("adminName") || "ADMIN").toUpperCase();
    const totalQty = cart.reduce((s: number, i: any) => s + i.qty, 0);
    const dash = `<div class="div">----------------------------------------</div>`;
    const otherRow = otherCharges > 0 ? `<div class="row"><span>Other Charges</span><span>&#8377;${otherCharges.toFixed(2)}</span></div>` : "";
    const itemsHtml = cart.map((item: any) => {
      const isGm = (item.unit || "").toLowerCase() === "gm";
      const displayQty = isGm ? (item.qty >= 1000 ? `${(item.qty / 1000).toFixed(3)}kg` : `${item.qty}gm`) : String(item.qty);
      const displayRate = isGm ? (item.qty >= 1000 ? (item.price * 1000).toFixed(2) : item.price.toFixed(2)) : item.price.toFixed(2);
      const name = (item.name + (item.size ? ` (${item.size})` : "")).slice(0, 24);
      return `<div class="item-row"><span class="iname">${name}</span><span class="iqty">${displayQty}</span><span class="irate">${displayRate}</span><span class="iamt">${(item.price*item.qty).toFixed(2)}</span></div>`;
    }).join("");
    printViaIframe(`<html><head><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Courier New',Courier,monospace;font-size:11px;color:#000;background:#fff;width:300px;margin:0 auto;padding:10px 6px}
      .center{text-align:center}.bold{font-weight:bold}
      .brand{font-size:14px;font-weight:bold;text-align:center}
      .sub{font-size:10px;text-align:center}
      .div{text-align:center;font-size:10px;margin:4px 0}
      .row{display:flex;justify-content:space-between;font-size:10px;margin:1px 0}
      .col-header{display:flex;justify-content:space-between;font-weight:bold;font-size:10px;margin:2px 0}
      .item-row{display:flex;font-size:10px;margin:2px 0}
      .iname{flex:2;overflow:hidden}.iqty{flex:0.8;text-align:right}.irate{flex:0.9;text-align:right}.iamt{flex:0.8;text-align:right}
      .grand{display:flex;justify-content:space-between;font-size:14px;font-weight:bold;margin:4px 0}
      @page{size:80mm auto;margin:0}@media print{body{width:80mm;margin:0 auto}}
    </style></head><body>
      <div class="brand">Shri Badrinarayan Papriwale</div>
      <div class="sub">Sweets | Namkeen | Bakery</div>
      <div style="margin:3px 0"></div>
      <div class="sub">Main Road, Buxar, Bihar - 802101</div>
      <div class="sub">Ph: +91 9876543210</div>
      <div style="margin:3px 0"></div>
      <div class="sub">GST No: 10AAAAA0000A1Z5</div>
      <div class="sub">FSSAI: 11225302002361</div>
      ${dash}
      <div class="row"><span>Date: ${dateStr}</span><span>Time: ${timeStr}</span></div>
      <div class="row"><span>Cashier: ${cashier}</span><span>Bill No: ${invoiceNo.slice(-5)}</span></div>
      <div class="row"><span>Payment: ${paymentMode}</span></div>
      <div class="row"><span>Name: ___________________________</span></div>
      ${dash}
      <div class="col-header"><span style="flex:2">Item</span><span style="flex:0.8;text-align:right">Qty</span><span style="flex:0.9;text-align:right">Rate</span><span style="flex:0.8;text-align:right">Amt</span></div>
      ${dash}
      ${itemsHtml}
      ${dash}
      <div class="row"><span>Total Qty: ${totalQty}</span><span>Sub Total: ${subtotal.toFixed(2)}</span></div>
      ${otherRow}
      <div class="row"><span>Tax (5%) incl.</span><span>&#8377;${taxes.toFixed(2)}</span></div>
      ${dash}
      <div class="grand"><span>Grand Total</span><span>&#x20B9;${grandTotal.toFixed(2)}</span></div>
      <div class="sub" style="margin:2px 0">Paid via: ${paymentMode}</div>
      ${dash}
      <div class="bold center" style="margin-top:4px">Thank You &amp; Visit Again..!!</div>
      <div class="sub center">www.papriwale.com</div>
    </body></html>`);
  };

  const handleWhatsAppShare = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerPhone || customerPhone.length !== 10) return;
    const msg = encodeURIComponent(`Your invoice ${invoiceNo} total: ₹${grandTotal.toFixed(2)}. Thank you for visiting Papriwale!`);
    const url = `https://wa.me/91${customerPhone}?text=${msg}`;
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setShowWhatsAppModal(false);
    setCustomerPhone("");
  };

  const handlePlaceAndPrint = async () => {
    if (cart.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    await new Promise(requestAnimationFrame);
    try {
      const createdBy = localStorage.getItem("adminName") || "Admin";
      const nextInvoiceNo = `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
      const res = await apiFetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_source: "Direct POS", order_status: "Paid", payment_mode: paymentMode, items: cart, discount_applied: discountTotal, tax_collected: taxes, extraneous_charges: otherCharges, other_charges_desc: otherChargesDesc, created_by: createdBy })
      });
      if (!res.ok) {
        const data = await res.json();
        const msg = data.items?.length
          ? `Not enough stock:\n${data.items.join("\n")}`
          : (data.error || "Failed to place order.");
        alert(msg);
        return;
      }
      // Clear cart immediately after successful order — before print
      const cartSnapshot = [...cart];
      setCart([]); setDiscountFlat(0); setDiscountPercent(0); setOtherCharges(0); setOtherChargesDesc("");
      setInvoiceNo(nextInvoiceNo);
      refreshAnalytics();
      const isCash = paymentMode === "Cash";
      void (async () => {
        const result = await printReceipt(
          { invoiceNo: nextInvoiceNo, cashier: createdBy, paymentMode, items: cartSnapshot, subtotal, discountTotal, taxes, grandTotal, otherCharges },
          isCash
        );
        if (result.fallback) {
          handlePrint();
          if (isCash) openCashDrawer();
        }
      })();
    } finally {
      setIsSubmitting(false);
    }
  };

  const ribbonCards = [
    { label: "Total Products", val: String(analytics.totalProducts) },
    { label: "Low Stock",      val: String(analytics.lowStock), alert: analytics.lowStock > 0 },
    { label: "Out of Stock",   val: String(analytics.outOfStock), alert: analytics.outOfStock > 0 },
  ];

  return (
    <div className="flex flex-col space-y-4" style={{minHeight: "calc(100vh - 80px)"}}>
      {/* Tab switcher */}
      <div className="flex gap-2">
        <button onClick={() => setPosTab("billing")} className={`px-4 py-2 rounded text-sm font-semibold transition-colors ${posTab === "billing" ? "bg-maroon text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>POS Billing</button>
        <button onClick={() => { setPosTab("deleted"); fetchDeletedOrders(); }} className={`px-4 py-2 rounded text-sm font-semibold transition-colors ${posTab === "deleted" ? "bg-red-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Deleted Bills</button>
      </div>

      {posTab === "deleted" && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="py-3 px-4">Bill No</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Items</th>
                <th className="py-3 px-4">Total</th>
                <th className="py-3 px-4">Deleted By</th>
                <th className="py-3 px-4">Deleted At</th>
              </tr>
            </thead>
            <tbody>
              {deletedOrders.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-gray-400 italic">No deleted bills.</td></tr>}
              {deletedOrders.map(o => (
                <tr key={o.id} className="border-b border-gray-100 bg-red-50/40">
                  <td className="py-3 px-4 font-mono text-xs font-bold text-red-700">{o.id}</td>
                  <td className="py-3 px-4 text-xs text-gray-500">{o.timestamp ? new Date(o.timestamp).toLocaleString() : "—"}</td>
                  <td className="py-3 px-4 text-xs text-gray-600">{o.items?.map((i: any) => `${i.name} x${i.qty}`).join(", ") || "—"}</td>
                  <td className="py-3 px-4 font-bold text-gray-700">₹{Number(o.grand_total).toFixed(2)}</td>
                  <td className="py-3 px-4 text-xs text-gray-500">{o.deleted_by || "—"}</td>
                  <td className="py-3 px-4 text-xs text-gray-400">{o.deleted_at ? new Date(o.deleted_at).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {posTab === "billing" && (<>
      {/* §2.2.1 Live Analytics Ribbon */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {ribbonCards.map((m, i) => (
          <div key={i} className={`p-2 rounded border bg-white flex flex-col justify-center ${(m as any).alert ? "border-red-300 bg-red-50" : "border-gray-200"}`}>
            <span className="text-[10px] text-gray-500 uppercase font-semibold truncate">{m.label}</span>
            <span className={`text-lg font-bold ${(m as any).alert ? "text-red-600" : "text-gray-800"}`}>{m.val}</span>
          </div>
        ))}
      </div>

      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {/* Left: Product Catalog */}
        <div className="flex-[2] bg-white rounded-lg border border-gray-200 flex flex-col overflow-hidden shadow-sm">
          <div className="p-4 border-b border-gray-100 flex gap-4 items-center bg-gray-50">
            <select className="border border-gray-300 rounded px-3 py-2 text-sm bg-white min-w-[150px]" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
              {categories.map(c => <option key={c}>{c}</option>)}
            </select>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search products by name or SKU..."
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded text-sm"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="overflow-y-auto p-4" style={{maxHeight: "calc(12 * 52px + 48px)"}}>
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">Product</th>
                  <th className="py-3 px-4">SKU</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Stock</th>
                  <th className="py-3 px-4">Price</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map(p => (
                  <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4 font-medium text-gray-800">{p.name}</td>
                    <td className="py-3 px-4 font-mono text-xs text-gray-500">{p.sku || "—"}</td>
                    <td className="py-3 px-4 text-gray-500">{p.category}</td>
                    <td className="py-3 px-4">{p.unit === "gm" ? (p.current_stock_qty / 1000).toFixed(2) : p.current_stock_qty} <span className="text-xs text-gray-400">{p.unit === "gm" ? "kg" : (p.unit || "pcs")}</span></td>
                    <td className="py-3 px-4">₹{p.unit === "gm" ? (p.price * 1000).toFixed(0) : p.price}<span className="text-xs text-gray-400">/{p.unit === "gm" ? "kg" : (p.unit || "pc")}</span></td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                        p.current_stock_qty <= 0 ? "bg-red-100 text-red-700" :
                        p.current_stock_qty <= p.safety_low_threshold ? "bg-yellow-100 text-yellow-700" :
                        "bg-green-100 text-green-700"
                      }`}>
                        {p.current_stock_qty <= 0 ? "Out of Stock" : p.current_stock_qty <= p.safety_low_threshold ? "Low Stock" : "In Stock"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleAddToBill(p)}
                        disabled={p.current_stock_qty <= 0}
                        className="text-maroon hover:bg-maroon hover:text-white p-1.5 rounded transition-colors border border-maroon disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-maroon">
                        <Plus size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredProducts.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-gray-400 italic">No products match your filter.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Billing Summary */}
        <div className="flex-[1.2] min-w-[340px] bg-white rounded-lg border border-gray-200 flex flex-col shadow-sm">
          <div className="p-4 border-b border-gray-100 bg-maroon text-white font-serif font-semibold rounded-t-lg flex items-center justify-between">
            <span>Billing Summary</span>
            {isReadOnly && (
              <span className="flex items-center gap-1 text-xs bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded font-bold">
                <EyeOff size={11} /> READ-ONLY
              </span>
            )}
          </div>
          <div className="overflow-y-auto" style={{maxHeight: "calc(6 * 52px)"}}>
            {cart.length === 0 ? (
              <div className="text-center text-gray-400 py-16 flex flex-col items-center">
                <ShoppingCart size={48} className="mb-3 opacity-20" />
                <p className="text-sm">Cart is empty</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 border-b-2 border-gray-200 z-10">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs text-gray-500 font-semibold uppercase">Item</th>
                    <th className="text-center px-1 py-2 text-xs text-gray-500 font-semibold uppercase w-[14%]">Unit</th>
                    <th className="text-center px-1 py-2 text-xs text-gray-500 font-semibold uppercase w-[20%]">Price</th>
                    <th className="text-center px-1 py-2 text-xs text-gray-500 font-semibold uppercase w-[16%]">Qty</th>
                    <th className="text-right px-2 py-2 text-xs text-gray-500 font-semibold uppercase w-[18%]">Total</th>
                    <th className="w-[6%]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cart.map((item, idx) => (
                    <tr key={item.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/60"}>
                      <td className="px-3 py-2">
                        <p className="font-semibold text-gray-800 text-xs leading-tight">{item.name}</p>
                        {item.size && <p className="text-[10px] text-gray-400 mt-0.5">{item.size}</p>}
                      </td>
                      <td className="px-1 py-2 text-center text-xs text-gray-500 font-semibold">{item.unit === "gm" ? (item.qty >= 1000 ? "kg" : "gm") : (item.unit || "pcs")}</td>
                      <td className="px-1 py-2 text-center text-xs text-gray-700 font-semibold">{item.unit === "gm" ? (item.qty >= 1000 ? `₹${(item.price * 1000).toFixed(0)}` : `₹${item.price}`) : `₹${item.price}`}</td>
                      <td className="px-1 py-2">
                        <input
                          type="number"
                          min={item.unit === "gm" || item.unit === "kg" ? "0.01" : "1"}
                          step={item.unit === "gm" || item.unit === "kg" ? "0.01" : "1"}
                          inputMode={item.unit === "gm" || item.unit === "kg" ? "decimal" : "numeric"}
                          value={item.unit === "gm" ? (item.qty >= 1000 ? parseFloat((item.qty / 1000).toFixed(3)) : item.qty) : item.qty}
                          onChange={e => updateCartQty(item.id, item.unit === "gm" && item.qty >= 1000 ? Number(e.target.value) * 1000 : Number(e.target.value))}
                          className="w-full border border-gray-300 rounded px-1 py-1 text-xs text-center focus:border-maroon focus:outline-none" />
                      </td>
                      <td className="px-2 py-2 text-right font-bold text-maroon text-xs whitespace-nowrap">₹{(item.price * item.qty).toFixed(2)}</td>
                      <td className="pr-1 py-2">
                        <button onClick={() => removeFromCart(item.id)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1 rounded transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 space-y-2">
            {/* Discount + Other Charges inline */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-gray-400 uppercase font-semibold">Disc ₹</label>
                <input type="number" min="0" step="0.01" max={subtotal} value={discountFlat}
                  onChange={e => { const v = Math.min(Number(e.target.value), subtotal); setDiscountFlat(v); setDiscountPercent(subtotal > 0 ? parseFloat(((v / subtotal) * 100).toFixed(2)) : 0); }}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-xs" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 uppercase font-semibold">Disc %</label>
                <input type="number" min="0" step="0.01" max="100" value={discountPercent}
                  onChange={e => { const v = Math.min(100, Math.max(0, Number(e.target.value))); setDiscountPercent(v); setDiscountFlat(parseFloat(((subtotal * v) / 100).toFixed(2))); }}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-xs" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 uppercase font-semibold">Other ₹</label>
                <input type="number" min="0" step="0.01" value={otherCharges} onChange={e => setOtherCharges(Number(e.target.value))} className="w-full border border-gray-300 rounded px-2 py-1 text-xs" />
              </div>
            </div>
            {/* Summary row */}
            <div className="flex justify-between text-xs text-gray-500">
              <span>Subtotal: <span className="font-semibold text-gray-700">₹{subtotal.toFixed(2)}</span></span>
              <span>Tax 5%: <span className="font-semibold text-gray-700">₹{taxes.toFixed(2)}</span></span>
              {discountTotal > 0 && <span>Disc: <span className="font-semibold text-green-600">-₹{discountTotal.toFixed(2)}</span></span>}
            </div>
            {/* Grand Total */}
            <div className="flex justify-between items-center py-1 border-t border-gray-200">
              <span className="text-sm font-bold text-maroon">Grand Total</span>
              <span className="text-xl font-bold text-maroon">₹{grandTotal.toFixed(2)}</span>
            </div>
            {/* Other charges description — always visible */}
            <input type="text" placeholder="Other charges description (e.g. Packing)" value={otherChargesDesc}
              onChange={e => setOtherChargesDesc(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1 text-xs" />
            {/* Payment mode */}
            <div className="grid grid-cols-3 gap-2">
              {["Cash", "UPI", "Card"].map(mode => (
                <button key={mode} disabled={isReadOnly}
                  onClick={() => setPaymentMode(mode)}
                  className={`border-2 rounded py-2 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${paymentMode === mode ? "border-maroon bg-maroon text-white" : "bg-white border-gray-300 hover:border-maroon hover:text-maroon"}`}>
                  {mode}
                </button>
              ))}
            </div>
            {/* Place & Print — single combined button */}
            <button onClick={handlePlaceAndPrint} disabled={isReadOnly || cart.length === 0 || isSubmitting}
              className="w-full bg-maroon hover:bg-maroon-light text-white font-bold py-2.5 rounded text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              <Printer size={14} /> {isSubmitting ? "Processing..." : "Place & Print"}
            </button>
            <button onClick={async () => {
              if (cart.length === 0) return;
              if (!confirm("Delete this bill? Cart will be cleared.")) return;
              const createdBy = localStorage.getItem("adminName") || "Admin";
              await apiFetch("/api/deleted-bills", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ items: cart, discount_applied: discountTotal, tax_collected: taxes, extraneous_charges: otherCharges, other_charges_desc: otherChargesDesc, payment_mode: paymentMode, created_by: createdBy })
              });
              setCart([]); setDiscountFlat(0); setDiscountPercent(0); setOtherCharges(0); setOtherChargesDesc("");
              generateInvoiceNo();
              fetchDeletedOrders();
            }} disabled={cart.length === 0}
              className="w-full bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-semibold py-2.5 rounded text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              <Trash2 size={14} /> Delete Bill
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={handleExportPDF} className="bg-gold hover:bg-yellow-600 text-white font-semibold py-2 rounded flex items-center justify-center gap-1 text-sm">
                <FileDown size={13} /> PDF
              </button>
              <button onClick={() => setShowWhatsAppModal(true)} className="bg-[#25D366] hover:bg-[#128C7E] text-white font-semibold py-2 rounded flex items-center justify-center gap-1 text-sm">
                <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" alt="WhatsApp" className="w-3.5 h-3.5" /> WA
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* §2.2.2 Variant Size Selection Modal for POS */}
      {variantModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-cream-light flex items-center justify-between">
              <h3 className="font-serif text-lg text-maroon font-bold">CHOOSE ITEM SPECIFICATIONS</h3>
              <button onClick={() => setVariantModal(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-5">
              <p className="font-bold text-gray-800 text-sm mb-3">Select Serving Size Volume Option:</p>
              <div className="space-y-2 mb-4">
                {variantModal.variants.map(v => {
                  const price = variantModal.product.price * v.variant_price_modifier;
                  return (
                    <label
                      key={v.size_label}
                      onClick={() => {
                        setVariantSize(v.size_label);
                        if (isWeightBasedUnit(variantModal.product.unit)) {
                          setVariantAmount(Number((price * variantQty).toFixed(2)));
                        } else {
                          setVariantCustomPrice(price);
                        }
                      }}
                      className={`flex items-center justify-between p-3 rounded-lg border-2 cursor-pointer transition-colors ${variantSize === v.size_label ? "border-maroon bg-maroon/5" : "border-gray-200"}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${variantSize === v.size_label ? "border-maroon" : "border-gray-300"}`}>
                          {variantSize === v.size_label && <div className="w-2 h-2 rounded-full bg-maroon" />}
                        </div>
                        <span className="font-medium text-gray-800">{v.size_label}</span>
                      </div>
                      <span className="text-sm font-bold text-gray-600">₹{price.toFixed(2)}</span>
                    </label>
                  );
                })}
              </div>
              {isWeightBasedUnit(variantModal.product.unit) && (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase font-semibold">Quantity ({variantModal.product.unit || "gm"})</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={variantQty}
                      onChange={e => {
                        const qty = Math.max(1, Number(e.target.value));
                        setVariantQty(qty);
                        const selected = variantModal.variants.find(v => v.size_label === variantSize);
                        const unitPrice = selected ? variantModal.product.price * selected.variant_price_modifier : variantModal.product.price;
                        setVariantAmount(Number((qty * unitPrice).toFixed(2)));
                      }}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase font-semibold">Amount (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={variantAmount}
                      onChange={e => {
                        const amount = e.target.value === "" ? "" : Number(e.target.value);
                        setVariantAmount(amount);
                        const selected = variantModal.variants.find(v => v.size_label === variantSize);
                        const unitPrice = selected ? variantModal.product.price * selected.variant_price_modifier : variantModal.product.price;
                        if (amount !== "") setVariantQty(Math.max(1, Number((Number(amount) / unitPrice).toFixed(3))));
                      }}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              )}
              {!isWeightBasedUnit(variantModal.product.unit) && (
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div>
                  <label className="text-[10px] text-gray-500 uppercase font-semibold">Unit</label>
                  <input type="text" value={variantUnit} onChange={e => setVariantUnit(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" placeholder="pcs, kg..." />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 uppercase font-semibold">Price (₹)</label>
                  <input type="number" min="0" step="0.01" value={variantCustomPrice} onChange={e => setVariantCustomPrice(e.target.value === "" ? "" : Number(e.target.value))} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 uppercase font-semibold">Quantity</label>
                  <input type="number" min="1" value={variantQty} onChange={e => setVariantQty(Math.max(1, Number(e.target.value)))} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                </div>
              </div>
              )}
              <button onClick={confirmVariantAdd} className="w-full bg-maroon text-white font-bold py-3 rounded-lg hover:bg-maroon-light transition-colors uppercase tracking-wider text-sm">
                CONFIRM AND ADD TO CHECKOUT TRAY
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Modal for products without variants */}
      {quickAddModal && (() => {
        const p = quickAddModal.product;
        const unit = (p.unit || "pcs").toLowerCase();
        const isGm = unit === "gm";
        const isKg = unit === "kg";
        const isWeightBased = isGm || isKg;
        const summaryUnit = isGm ? "gm" : isKg ? "kg" : (p.unit || "pcs");
        const priceLabel = isWeightBased
          ? `₹${(isGm ? p.price * 1000 : p.price).toFixed(0)} / kg`
          : `₹${Number(p.price).toFixed(2)} / ${summaryUnit}`;
        const computedAmount = isWeightBased
          ? (quickQty !== "" ? parseFloat((Number(quickQty) * p.price).toFixed(2)) : quickAmount)
          : (quickQty !== "" ? parseFloat((Number(quickQty) * p.price).toFixed(2)) : "");
        const computedQty = isWeightBased && quickAmount !== "" && quickQty === ""
          ? parseFloat((Number(quickAmount) / p.price).toFixed(3))
          : quickQty;
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
            <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl overflow-hidden">
              <div className="p-4 border-b border-gray-100 bg-cream-light flex items-center justify-between">
                <h3 className="font-serif text-lg text-maroon font-bold">ADD TO BILL</h3>
                <button onClick={() => setQuickAddModal(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
              </div>
              <div className="p-5">
                <p className="font-semibold text-gray-800 mb-1">{p.name}</p>
                <div className="text-xs bg-maroon/10 text-maroon px-2 py-1 rounded font-semibold select-none inline-block mb-4">
                  {priceLabel}
                </div>
                <div className={`grid gap-3 mb-4 ${isWeightBased ? "grid-cols-2" : "grid-cols-1"}`}>
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase font-semibold">Quantity ({isGm ? "gm" : isKg ? "kg" : (p.unit || "pcs")})</label>
                    <input
                      type="number" min="0" step="1"
                      placeholder={isWeightBased ? `Enter ${isGm ? "grams" : "kg"}` : "Enter quantity"}
                      value={quickQty}
                      onChange={e => {
                        const v = e.target.value === "" ? "" : Number(e.target.value);
                        setQuickQty(v);
                        if (v !== "") setQuickAmount(parseFloat((Number(v) * p.price).toFixed(2)));
                        else setQuickAmount("");
                      }}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon"
                    />
                  </div>
                  {isWeightBased && (
                    <div>
                      <label className="text-[10px] text-gray-500 uppercase font-semibold">Amount (₹)</label>
                      <input
                        type="number" min="0" step="0.01"
                        placeholder="Enter amount"
                        value={quickAmount}
                        onChange={e => {
                          const v = e.target.value === "" ? "" : Number(e.target.value);
                          setQuickAmount(v);
                          if (v !== "") setQuickQty(parseFloat((Number(v) / p.price).toFixed(3)));
                          else setQuickQty("");
                        }}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon"
                      />
                    </div>
                  )}
                </div>
                <div className="bg-gray-50 rounded-lg p-3 mb-4 flex justify-between items-center">
                  <span className="text-xs text-gray-500">
                    {isWeightBased
                      ? `${computedQty || 0} ${summaryUnit}`
                      : `${quickQty || 0} ${summaryUnit}`}
                  </span>
                  <span className="text-base font-bold text-maroon">₹{computedAmount || "0.00"}</span>
                </div>
                <button onClick={confirmQuickAdd} disabled={!quickQty && !quickAmount}
                  className="w-full bg-maroon text-white font-bold py-3 rounded-lg hover:bg-maroon-light transition-colors uppercase tracking-wider text-sm disabled:opacity-40 disabled:cursor-not-allowed">
                  ADD TO BILL
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      </>)}

      {showWhatsAppModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm shadow-xl relative">
            <button onClick={() => setShowWhatsAppModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X size={20} /></button>
            <h3 className="text-lg font-bold text-maroon mb-2 flex items-center gap-2"><img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" alt="WhatsApp" className="w-5 h-5" /> Share Invoice via WhatsApp</h3>
            <p className="text-sm text-gray-500 mb-4">Enter customer phone number to send the invoice via WhatsApp.</p>
            <form onSubmit={handleWhatsAppShare}>
              <div className="flex bg-gray-50 border border-gray-300 rounded overflow-hidden focus-within:border-maroon focus-within:ring-1 focus-within:ring-maroon">
                <span className="px-3 py-2 bg-gray-100 border-r border-gray-300 text-gray-600 font-medium">+91</span>
                <input type="text" maxLength={10} pattern="\d{10}" placeholder="Enter 10-digit number" className="w-full px-3 py-2 bg-transparent focus:outline-none" value={customerPhone} onChange={e => setCustomerPhone(e.target.value.replace(/\D/g, ""))} required />
              </div>
              <button type="submit" className="w-full mt-4 bg-[#25D366] text-white font-semibold py-2 rounded shadow hover:bg-[#128C7E] transition-colors">Send to WhatsApp</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
