import React from "react";

// QZ Tray integration for direct thermal printing (no browser popup)
// Requires QZ Tray installed on the billing PC: https://qz.io
// Set PRINTER_NAME below to match your exact Windows printer name (Devices & Printers)

const PRINTER_NAME = "POS-80C (copy 1)";

const QZ_CERT = `-----BEGIN CERTIFICATE-----
MIIECzCCAvOgAwIBAgIGAaAPtyV8MA0GCSqGSIb3DQEBCwUAMIGiMQswCQYDVQQG
EwJVUzELMAkGA1UECAwCTlkxEjAQBgNVBAcMCUNhbmFzdG90YTEbMBkGA1UECgwS
UVogSW5kdXN0cmllcywgTExDMRswGQYDVQQLDBJRWiBJbmR1c3RyaWVzLCBMTEMx
HDAaBgkqhkiG9w0BCQEWDXN1cHBvcnRAcXouaW8xGjAYBgNVBAMMEVFaIFRyYXkg
RGVtbyBDZXJ0MB4XDTI2MDgxNjEyMzQxNloXDTQ2MDgxNjEyMzQxNlowgaIxCzAJ
BgNVBAYTAlVTMQswCQYDVQQIDAJOWTESMBAGA1UEBwwJQ2FuYXN0b3RhMRswGQYD
VQQKDBJRWiBJbmR1c3RyaWVzLCBMTEMxGzAZBgNVBAsMElFaIEluZHVzdHJpZXMs
IExMQzEcMBoGCSqGSIb3DQEJARYNc3VwcG9ydEBxei5pbzEaMBgGA1UEAwwRUVog
VHJheSBEZW1vIENlcnQwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCs
Ogrel7ojpXZ8h1pzzB10WM658fiyLWldSzgV12dn5tfi/agxlszxLX8gzFFdXAR5
ITUcNz1OVx92F3nCR6B57O+6EnWb8z7wQC6QM5gf2jrMq9l+xPG0nKKDGBMvMBsS
bMst3Xu/qmzFTv+pFxzWxwkZQ/KWFF/fei8OvxVCPtPwihY3kH8cECxZ8jPkKLb/
2w2JTCLzSTn/gWT0VV9V2ifn1Fvb1Bo1Tg/yw88AdVAVRivap1Bu6cpzkP4urv6y
9SlacmCYDn+XSd7C03Rz62S0+w0TDWYQ4gxIOQ1+XPLrKzSbHukoK6PtMXvfS0VR
BV/NDots+8UyWnv6vfarAgMBAAGjRTBDMBIGA1UdEwEB/wQIMAYBAf8CAQEwDgYD
VR0PAQH/BAQDAgEGMB0GA1UdDgQWBBTUHwnC2ZHscR+/SII7uxo7Hf+3VzANBgkq
hkiG9w0BAQsFAAOCAQEALLDUYd2+4OhpZ9zgAFtZhYDkCdI5LrMSqYGFcDp8E9q9
7LJwpIfpbYx7uuR2qyJrHCiOmxr1S1R9BoExJlgIwVevj1+WZU3+ftHzUQGEatyD
rOslVliu1LhhCCIRue2jln48k2STmSOX6UqZXX917fnMDX8zeT1uGyXQH+PH90sz
8chAeGBeWCRqMXDMEqunw5xKpymKH+Gd0maPuSnnhHUYb2tgmJRq5dSL9r34AJS1
Jb5r5FlbJ9/7bgBqRrXxuN+J2sZTJtVMXXQ1JiTrqsfTh0RkJEGo6walPcl+yqLx
ejLLWP8Uc7MELsES7/nuY3kaRjLJYvYC8QTmab/uLQ==
-----END CERTIFICATE-----`;

const QZ_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEuwIBADANBgkqhkiG9w0BAQEFAASCBKUwggShAgEAAoIBAQCsOgrel7ojpXZ8
h1pzzB10WM658fiyLWldSzgV12dn5tfi/agxlszxLX8gzFFdXAR5ITUcNz1OVx92
F3nCR6B57O+6EnWb8z7wQC6QM5gf2jrMq9l+xPG0nKKDGBMvMBsSbMst3Xu/qmzF
Tv+pFxzWxwkZQ/KWFF/fei8OvxVCPtPwihY3kH8cECxZ8jPkKLb/2w2JTCLzSTn/
gWT0VV9V2ifn1Fvb1Bo1Tg/yw88AdVAVRivap1Bu6cpzkP4urv6y9SlacmCYDn+X
Sd7C03Rz62S0+w0TDWYQ4gxIOQ1+XPLrKzSbHukoK6PtMXvfS0VRBV/NDots+8Uy
Wnv6vfarAgMBAAECgf8fRvYNf0x1pkjeVKlvYn+GEm9V4GNW4rRM3Z1E3FdtUw4e
l4F+7HM17Qjw8Dt3FBOQf3deHZRbaQ7uKu0dOImz14wZ2uDkv5HimpWUykwS8fKu
tqDev/KAbfHDDLqakc9/24vjgwd8vqqiyxVu5UF6OVjNH3QrfyhJlJAm8gqgjByw
ILNLrFB7PLJd90Vk1cbmiKXjB/53BTse6ABQ5cWuSw9ZO0u0KwfEKqG88+dp6XlL
ujVhGw9B+JR1/sV65okk57ASZy8o5MALLqK/V6JUsUJj4yZHUx3b1hZqhySNQ0ze
9HpNWPEb1ITww5pQIzshDUMnEcOR6xME4CaNmLECgYEA1F/LaRrIkO1R2vmspObc
Vwyt2hgFroYbK+l7tJ5OMUVYRdef0Ub3D3odgT2nz5XYqGBy61WFacCYfZSOIgLX
nPPABLbww4R2vzxfpC597i2nQ+CF3rDiorT2vIgQcOJMipSygdOb5ZK/vhtWisDi
UMbGCrOln2SdUY+XDKHlSPkCgYEAz5r/RH5OUw9VvgslrEX6DTk8MWgHXhhzlFrj
ytSsEoVeKmfSW85pwIXvXmv81ks9hPa6K2Z4bSBKKwqCL/nxnQtc/IqN1E7NKilz
OiCKfMgPscfkEfAfKRqRi5WSWu8h7Yb/IaM8g6N2iELPFY8WQdct9uzWwy48qmQ6
tTkDqcMCgYBnWm9NqUEudrA9VwCUB933Zy48UzCArLcQecJANkJrbAn3g2Y9nMGj
gJRXT0AZoB0eZEHJEYep3ZbYlrFNEAEKWv15zeYB4LdBfgo1hoK2pPUf7WZ457CD
6nmhar5FkXwafR8aW3clFHPH+tn1EMWS9glvL9pMZdTB2pVyCl/hUQKBgDTuGqkW
3tdUcJLseqVqje8zKYKbOE2oREeNyMgc4uYx9KkxITPg85tvSnEzbRohwsSUtzB7
hraj5eUFX93lhtF4ZTPKC5EWqj5WpRcr1sMrqryz7xUXuIodSQBimRbwIyFRKtkj
qjkRwxXIms2vVohg2Uo8ZiELN9JljYZIzANLAoGBANDElDKWTJz1cpydsKum/f5Y
zq9BcO9dRECRjlEoMGQhkOMUQG/ApZXqvWMQI1myjD2kMe1Dcg6KAAoBHX+Dan/F
Nh2lLUARvceHpbBzb2H82eEcrhcmwhNQ/TwNDbcb1Xl1vXDDXygQjKL9QPcM6sRx
DuWHBlSTxgY62AI/TkUD
-----END PRIVATE KEY-----`;

let qzModulePromise: Promise<any> | null = null;
let qzConnecting = false;
const isDev = process.env.NODE_ENV !== "production";

async function getQz() {
  if (!qzModulePromise) {
    qzModulePromise = import("qz-tray");
  }
  const mod = await qzModulePromise;
  return mod.default ?? mod;
}

async function connectQz(): Promise<boolean> {
  try {
    const qz = await getQz();
    if (!qz.security.getCertificatePromise?.()) {
      qz.security.setCertificatePromise((resolve: any) => resolve(QZ_CERT));
    }
    qz.security.setSignaturePromise((toSign: any) => {
      return (resolve: any, reject: any) => {
        const keyData = QZ_PRIVATE_KEY
          .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, "")
          .replace(/\s+/g, "");
        const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
        crypto.subtle.importKey(
          "pkcs8",
          binaryKey.buffer,
          { name: "RSASSA-PKCS1-v1_5", hash: "SHA-1" },
          false,
          ["sign"]
        ).then(key => {
          const encoder = new TextEncoder();
          return crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(toSign));
        }).then(sig => {
          resolve(btoa(String.fromCharCode(...new Uint8Array(sig))));
        }).catch(reject);
      };
    });

    if (qz.websocket.isActive()) return true;
    if (qzConnecting) {
      for (let i = 0; i < 50; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (qz.websocket.isActive()) return true;
      }
      return false;
    }

    qzConnecting = true;
    try {
      await qz.websocket.connect({ retries: 3, delay: 1 });
      return true;
    } finally {
      qzConnecting = false;
    }
  } catch (e: any) {
    qzConnecting = false;
    if (isDev) console.warn("[QZ] Not connected:", e?.message);
    return false;
  }
}

function buildReceiptData(params: {
  invoiceNo: string;
  cashier: string;
  paymentMode: string;
  items: { name: string; size?: string; unit?: string; qty: number; price: number }[];
  subtotal: number;
  discountTotal: number;
  taxes: number;
  grandTotal: number;
  otherCharges?: number;
}): string[] {
  const { invoiceNo, cashier, paymentMode, items, subtotal, discountTotal, taxes, grandTotal, otherCharges } = params;
  const now = new Date();
  const date = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const ESC = "\x1B";
  const GS = "\x1D";
  const INIT = ESC + "\x40";
  const CENTER = ESC + "\x61\x01";
  const LEFT = ESC + "\x61\x00";
  const BOLD_ON = ESC + "\x45\x01";
  const BOLD_OFF = ESC + "\x45\x00";
  const DOUBLE_ON = GS + "\x21\x11";
  const DOUBLE_OFF = GS + "\x21\x00";
  const CUT = GS + "\x56\x41\x10";
  const LW = 42;

  const pad = (left: string, right: string, width = LW) => {
    const gap = width - left.length - right.length;
    return left + " ".repeat(Math.max(1, gap)) + right;
  };

  const divider = "-".repeat(LW) + "\n";

  let itemLines = "";
  items.forEach(item => {
    const isGm = (item.unit || "").toLowerCase() === "gm";
    const displayQty = isGm
      ? (item.qty >= 1000 ? `${(item.qty / 1000).toFixed(3)}kg` : `${item.qty}gm`)
      : String(item.qty);
    const name = (item.name + (item.size ? ` (${item.size})` : "")).slice(0, 22);
    const amt = `${(item.price * item.qty).toFixed(2)}`;
    itemLines += pad(`${name} x${displayQty}`, `Rs.${amt}`) + "\n";
  });

  return [
    INIT,
    CENTER, BOLD_ON, DOUBLE_ON,
    "BADRINARAYAN PAPRIWALE\n",
    DOUBLE_OFF, BOLD_OFF,
    "Sweets | Papri | Namkeen | Dosa\n",
    "Main Road Golambar Buxar,\n",
    "Bihar - 802103\n",
    "GST: 10DLRPG9097N1ZB\n",
    LEFT,
    divider,
    pad(`Date: ${date}`, `Time: ${time}`) + "\n",
    pad(`Cashier: ${cashier.toUpperCase()}`, `Bill: ${invoiceNo.slice(-6)}`) + "\n",
    `Payment: ${paymentMode}\n`,
    divider,
    BOLD_ON,
    pad("Item", "Amount") + "\n",
    BOLD_OFF,
    divider,
    itemLines,
    divider,
    pad("Subtotal:", `Rs.${subtotal.toFixed(2)}`) + "\n",
    ...((otherCharges ?? 0) > 0 ? [pad("Other Charges:", `Rs.${(otherCharges ?? 0).toFixed(2)}`) + "\n"] : []),
    pad("Tax 5% (incl.):", `Rs.${taxes.toFixed(2)}`) + "\n",
    divider,
    CENTER, BOLD_ON, DOUBLE_ON,
    `TOTAL: Rs.${grandTotal.toFixed(2)}\n`,
    DOUBLE_OFF, BOLD_OFF,
    divider,
    CENTER,
    "Thank You & Visit Again!\n",
    "www.papriwale.com\n",
    "\n\n\n",
    CUT,
  ];
}

export function usePrinter() {
  React.useEffect(() => {
    connectQz().then(ok => {
      if (isDev && ok) console.log("[QZ] Connected and ready.");
      if (isDev && !ok) console.warn("[QZ] Not available - will use browser print fallback.");
    });
  }, []);

  const printReceipt = async (
    params: Parameters<typeof buildReceiptData>[0],
    openDrawer = false
  ): Promise<{ ok: boolean; fallback?: boolean }> => {
    const connected = await connectQz();
    if (!connected) return { ok: false, fallback: true };

    try {
      const qz = await getQz();
      const printerName = PRINTER_NAME || await qz.printers.getDefault();
      const config = qz.configs.create(printerName);
      const data = buildReceiptData(params);

      if (openDrawer) {
        data.push("\x1B\x70\x00\x19\xFA");
      }

      const rawStr = data.join("");
      const b64 = btoa(unescape(encodeURIComponent(rawStr)));
      await qz.print(config, [{ type: "raw", format: "base64", data: b64 }]);
      return { ok: true };
    } catch (e: any) {
      if (isDev) console.error("[usePrinter] QZ print error:", e?.message);
      return { ok: false, fallback: true };
    }
  };

  const openCashDrawer = async (): Promise<void> => {
    const connected = await connectQz();
    if (!connected) return;
    try {
      const qz = await getQz();
      const printerName = PRINTER_NAME || await qz.printers.getDefault();
      const config = qz.configs.create(printerName);
      await qz.print(config, [{ type: "raw", format: "base64", data: btoa("\x1B\x70\x00\x19\xFA") }]);
    } catch {}
  };

  return { printReceipt, openCashDrawer };
}
