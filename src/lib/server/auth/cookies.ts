import "server-only";

export interface SessionCookieOptions { name: string; secure: boolean }

function base(options: SessionCookieOptions): string {
  return `${options.name}=`;
}

export function sessionCookie(options: SessionCookieOptions, value: string, maxAgeSeconds: number): string {
  return `${base(options)}${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${options.secure ? "; Secure" : ""}`;
}

export function clearedSessionCookie(options: SessionCookieOptions): string {
  return `${base(options)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${options.secure ? "; Secure" : ""}`;
}
