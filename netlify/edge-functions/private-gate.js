const COOKIE_NAME = "forelior_gate";
const COOKIE_DAYS = 180;
const LOGIN_PATH = "/gate.html";
const LOGIN_ACTION = "/__gate_login";
const LOGOUT_ACTION = "/__gate_logout";

const textEncoder = new TextEncoder();

function getEnv(name) {
  return globalThis.Netlify?.env?.get(name) || "";
}

function base64UrlEncode(value) {
  const bytes = typeof value === "string" ? textEncoder.encode(value) : value;
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmacSha256(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, textEncoder.encode(data)));
}

async function signPayload(secret, payload) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmacSha256(secret, encodedPayload);
  return `${encodedPayload}.${base64UrlEncode(signature)}`;
}

async function verifyToken(secret, token) {
  const [encodedPayload, encodedSignature] = String(token || "").split(".");
  if (!encodedPayload || !encodedSignature) return false;

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload)));
  } catch (_error) {
    return false;
  }

  if (!payload?.exp || Number(payload.exp) < Date.now()) return false;

  const expected = await hmacSha256(secret, encodedPayload);
  const received = base64UrlDecode(encodedSignature);
  if (expected.length !== received.length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected[i] ^ received[i];
  }
  return diff === 0;
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get("cookie") || "";
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) || "";
}

function redirectToLogin(url) {
  const loginUrl = new URL(LOGIN_PATH, url.origin);
  loginUrl.searchParams.set("return_to", `${url.pathname}${url.search}`);
  return Response.redirect(loginUrl, 302);
}

function clearCookie(url) {
  return new Response(null, {
    status: 303,
    headers: {
      location: LOGIN_PATH,
      "set-cookie": `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
      "cache-control": "no-store"
    }
  });
}

function isPublicPath(pathname) {
  return pathname === LOGIN_PATH
    || pathname === LOGIN_ACTION
    || pathname === LOGOUT_ACTION
    || pathname === "/favicon.ico"
    || pathname === "/icon-32.png"
    || pathname === "/icon-180.png"
    || pathname === "/site.webmanifest";
}

export default async function privateGate(request, context) {
  const url = new URL(request.url);
  const password = getEnv("SITE_GATE_PASSWORD");
  const secret = getEnv("SITE_GATE_SECRET");

  // Keep the site reachable until Netlify environment variables are configured.
  if (!password || !secret) {
    return context.next();
  }

  if (url.pathname === LOGOUT_ACTION) {
    return clearCookie(url);
  }

  if (url.pathname === LOGIN_ACTION && request.method === "POST") {
    const form = await request.formData();
    const submittedPassword = String(form.get("password") || "");
    const returnTo = String(form.get("return_to") || "/");

    if (submittedPassword !== password) {
      const failedUrl = new URL(LOGIN_PATH, url.origin);
      failedUrl.searchParams.set("error", "1");
      failedUrl.searchParams.set("return_to", returnTo.startsWith("/") ? returnTo : "/");
      return Response.redirect(failedUrl, 303);
    }

    const token = await signPayload(secret, {
      v: 1,
      exp: Date.now() + COOKIE_DAYS * 24 * 60 * 60 * 1000
    });
    const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";

    return new Response(null, {
      status: 303,
      headers: {
        location: safeReturnTo,
        "set-cookie": `${COOKIE_NAME}=${token}; Path=/; Max-Age=${COOKIE_DAYS * 24 * 60 * 60}; HttpOnly; Secure; SameSite=Lax`,
        "cache-control": "no-store"
      }
    });
  }

  if (isPublicPath(url.pathname)) {
    return context.next();
  }

  const token = getCookie(request, COOKIE_NAME);
  if (await verifyToken(secret, token)) {
    return context.next();
  }

  return redirectToLogin(url);
}

export const config = {
  path: "/*"
};
