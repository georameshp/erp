/* global window, crypto */
(function () {
  const ITERATIONS = 150000;
  const HASH = "SHA-256";

  function bytesToBase64(bytes) {
    let binary = "";
    bytes.forEach(b => { binary += String.fromCharCode(b); });
    return btoa(binary);
  }

  function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function derive(password, saltBytes) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: saltBytes, iterations: ITERATIONS, hash: HASH }, key, 256);
    return new Uint8Array(bits);
  }

  async function hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await derive(password, salt);
    return {
      algorithm: "PBKDF2",
      hash: HASH,
      iterations: ITERATIONS,
      salt: bytesToBase64(salt),
      encodedHash: bytesToBase64(hash)
    };
  }

  async function verifyPassword(password, passwordHash) {
    if (!passwordHash || !passwordHash.salt || !passwordHash.encodedHash) return false;
    const salt = base64ToBytes(passwordHash.salt);
    const hash = await derive(password, salt);
    return bytesToBase64(hash) === passwordHash.encodedHash;
  }

  function uuid(prefix) {
    const id = crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
    return prefix ? prefix + id : id;
  }

  window.CryptoManager = { hashPassword, verifyPassword, uuid };
})();
