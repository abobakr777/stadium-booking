// Run manually with Application Default Credentials, never from the browser.
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
const [projectId, uid, action] = process.argv.slice(2);
if (!projectId || !uid || !["grant", "revoke"].includes(action))
  throw Error("Usage: node scripts/admin.mjs PROJECT UID grant|revoke");
initializeApp({ projectId, credential: applicationDefault() });
const auth = getAuth(),
  user = await auth.getUser(uid);
if (!user.emailVerified || !user.email)
  throw Error("Verified email account required");
const claims = { ...user.customClaims };
if (action === "grant") claims.globalAdmin = true;
else delete claims.globalAdmin;
await auth.setCustomUserClaims(uid, claims);
if (action === "revoke") await auth.revokeRefreshTokens(uid);
console.log(
  "Claims updated. Refresh ID token / sign in again. Existing ID tokens may remain valid up to one hour.",
);
