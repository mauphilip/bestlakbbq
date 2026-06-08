// Simple PIN-based admin auth.
// Token = base64(pin + ":" + secret). Stateless — no KV needed.

const SECRET = process.env.ADMIN_PIN ?? "0000";
export const ADMIN_TOKEN = Buffer.from(`admin:${SECRET}`).toString("base64");

export function verifyAdminToken(req: Request): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace("Bearer ", "");
  return token === ADMIN_TOKEN;
}
