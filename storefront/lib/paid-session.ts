export function parseCookieValue(cookieString: string, name: string) {
  const cookie = cookieString
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`));

  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

export function isPaidTrafficCookieValue(value: string | null | undefined) {
  return value === "1";
}

export function isPaidTrafficSession() {
  if (typeof document === "undefined") {
    return false;
  }

  return isPaidTrafficCookieValue(parseCookieValue(document.cookie, "bric_paid_click"));
}
