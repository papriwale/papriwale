/**
 * Central fetch wrapper — keeps requests same-origin so the cookie-backed
 * session remains the source of truth on the server.
 */
export async function apiFetch(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
  const path = typeof input === "string" ? input : input.toString();
  const isAdminRoute = typeof window !== "undefined" && window.location.pathname.startsWith("/admin");
  const hasCustomerSession = !!localStorage.getItem("customerRole");
  const hasAdminSession = !!localStorage.getItem("adminRole") && localStorage.getItem("adminRole") !== "Customer";

  // Prefer the customer role on mobile/customer pages so a stale admin login
  // cannot hijack the request and trigger a 403 on customer-only screens.
  const useAdminSession = isAdminRoute && hasAdminSession && !path.startsWith("/api/auth/logout");
  const role = useAdminSession
    ? localStorage.getItem("adminRole") || ""
    : (hasCustomerSession ? localStorage.getItem("customerRole") || "Customer" : "");

  const headers = new Headers(init.headers ?? {});
  if (role)  headers.set("X-User-Role",     role);

  let response: Response;
  try {
    response = await fetch(input, { ...init, headers, credentials: "same-origin" });
  } catch {
    throw new Error("Network error — please check your connection.");
  }

  // Session invalidated — redirect to appropriate login
  if (response.status === 401) {
    if (isAdminRoute) {
      ["adminRole","adminName","sessionToken","employeeId","adminAvatar","accessPermissions"].forEach(k => localStorage.removeItem(k));
      window.location.replace("/admin/login");
    } else {
      ["customerRole","customerName","customerToken","customerId","customerPhone","customerAvatar","employeePhone","isNewCustomer"].forEach(k => localStorage.removeItem(k));
      window.location.replace("/login");
    }
  }

  return response;
}
