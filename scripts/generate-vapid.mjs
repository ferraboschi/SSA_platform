#!/usr/bin/env node
// Generates a VAPID key pair for Web Push. Run once, then put the values in the
// environment (Render → Environment):
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY = <publicKey>
//   VAPID_PRIVATE_KEY            = <privateKey>   (secret — never commit)
//   VAPID_SUBJECT                = mailto:corsi@sakesommelierassociation.it
//
// Usage:  node scripts/generate-vapid.mjs
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();
console.log("\nVAPID keys generated — add these to your environment:\n");
console.log("NEXT_PUBLIC_VAPID_PUBLIC_KEY=" + keys.publicKey);
console.log("VAPID_PRIVATE_KEY=" + keys.privateKey);
console.log("VAPID_SUBJECT=mailto:corsi@sakesommelierassociation.it\n");
console.log("(The public key is safe to expose; keep the private key secret.)\n");
