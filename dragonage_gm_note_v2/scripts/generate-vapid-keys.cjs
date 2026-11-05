// Run locally once. Private keys belong in Supabase Secrets, never VUE_APP_*.
const { createECDH, randomBytes } = require("node:crypto");
const key = createECDH("prime256v1");
key.generateKeys();
console.log(`VAPID_PUBLIC_KEY=${key.getPublicKey().toString("base64url")}`);
console.log(`VAPID_PRIVATE_KEY=${key.getPrivateKey().toString("base64url")}`);
console.log(`PUSH_WEBHOOK_SECRET=${randomBytes(32).toString("hex")}`);
