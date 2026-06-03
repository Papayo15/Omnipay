"use client";

// AES-256-GCM + HMAC-SHA256 usando Web Crypto API nativa del browser
const ALGO = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12;

function str2buf(str: string): ArrayBuffer {
  return new TextEncoder().encode(str).buffer as ArrayBuffer;
}

function buf2b64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function b64url2buf(b64: string): ArrayBuffer {
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + "=".repeat(padding));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer as ArrayBuffer;
}

async function deriveKey(secret: string, salt: ArrayBuffer): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey("raw", str2buf(secret), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    { name: ALGO, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encrypt(data: Uint8Array, secret: string): Promise<string> {
  const saltArr = crypto.getRandomValues(new Uint8Array(16));
  const ivArr = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const salt = saltArr.buffer as ArrayBuffer;
  const iv = ivArr.buffer as ArrayBuffer;
  const key = await deriveKey(secret, salt);

  const ciphertext = await crypto.subtle.encrypt({ name: ALGO, iv }, key, data.buffer as ArrayBuffer);

  const combined = new Uint8Array(saltArr.byteLength + ivArr.byteLength + ciphertext.byteLength);
  combined.set(saltArr, 0);
  combined.set(ivArr, saltArr.byteLength);
  combined.set(new Uint8Array(ciphertext), saltArr.byteLength + ivArr.byteLength);

  return buf2b64url(combined.buffer as ArrayBuffer);
}

export async function decrypt(encoded: string, secret: string): Promise<Uint8Array> {
  const combined = new Uint8Array(b64url2buf(encoded));
  const salt = combined.slice(0, 16).buffer as ArrayBuffer;
  const iv = combined.slice(16, 28).buffer as ArrayBuffer;
  const ciphertext = combined.slice(28).buffer as ArrayBuffer;

  const key = await deriveKey(secret, salt);
  const plaintext = await crypto.subtle.decrypt({ name: ALGO, iv }, key, ciphertext);
  return new Uint8Array(plaintext);
}

export async function hmacSign(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", str2buf(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, str2buf(data));
  return buf2b64url(sig);
}

export async function hmacVerify(data: string, secret: string, sig: string): Promise<boolean> {
  const expected = await hmacSign(data, secret);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}
