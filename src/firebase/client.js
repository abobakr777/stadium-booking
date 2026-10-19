import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
const env = import.meta.env;
export const emulated = env.VITE_USE_EMULATORS !== "false";
const projectId = env.VITE_FIREBASE_PROJECT_ID || "demo-stadium-booking";
if (emulated && !projectId.startsWith("demo-"))
  throw Error("Emulators require a demo project ID");
if (!emulated && (!env.VITE_FIREBASE_API_KEY || projectId.startsWith("demo-")))
  throw Error("Configure Firebase production environment explicitly");
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY || "demo-key",
  projectId,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
  storageBucket:
    env.VITE_FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`,
  appId: env.VITE_FIREBASE_APP_ID || "demo-stadium-booking",
});
export const auth = getAuth(app),
  db = getFirestore(app),
  functions = getFunctions(app, "us-central1");
if (emulated) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8085);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
