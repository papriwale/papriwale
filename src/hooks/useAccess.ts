import { useAuthSession } from "./useAuthSession";

// Returns the access level for the current user's role on a given module.
// "Full Access" | "Read-Only" | "Hidden"
export function useAccess(module: string): "Full Access" | "Read-Only" | "Hidden" {
  const { status, session } = useAuthSession();
  if (status !== "authenticated" || !session) return "Hidden";
  const role = session.role || "";
  if (role === "Admin") return "Full Access";
  const permissions = session.permissions || {};
  // Default to Hidden if module not explicitly granted — fail-safe
  return (permissions[module] as "Full Access" | "Read-Only" | "Hidden") || "Hidden";
}
