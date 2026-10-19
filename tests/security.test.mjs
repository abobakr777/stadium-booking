import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
} from "firebase/auth";
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "firebase/functions";
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
} from "firebase/firestore";
import { ref, uploadBytes, getBytes } from "firebase/storage";
import {
  initializeApp as adminApp,
  deleteApp as deleteAdmin,
} from "firebase-admin/app";
import { getAuth as adminAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
const projectId = "demo-stadium-booking";
if (
  process.env.GCLOUD_PROJECT &&
  !process.env.GCLOUD_PROJECT.startsWith("demo-")
)
  throw Error("Refusing non-demo project");
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8085";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9199";
let env, server, db, owner, other, global, unverified, players;
const apps = [];
let serial = 0;
const data = () => ({
  title: "مباراة الاختبار",
  maxPlayers: 2,
  totalCost: 100,
  currency: "RM",
  location: "https://maps.google.com/",
  startsAt: Date.now() + 86400000,
  endsAt: Date.now() + 90000000,
  withdrawalDeadline: Date.now() + 7200000,
});
const profile = { name: "لاعب", position: "وسط", level: "متوسط" };
const call = (c, name, d) => httpsCallable(c.fn, name)(d).then((r) => r.data);
const denied = async (promise) =>
  assert.rejects(promise, (e) =>
    [
      "functions/permission-denied",
      "functions/unauthenticated",
      "functions/invalid-argument",
      "functions/already-exists",
      "functions/failed-precondition",
      "functions/not-found",
    ].includes(e.code),
  );
async function client(kind) {
  const app = initializeApp(
    {
      projectId,
      apiKey: "demo-key",
      authDomain: `${projectId}.firebaseapp.com`,
    },
    `test-${Date.now()}-${serial++}`,
  );
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  let credential;
  if (kind === "anonymous") credential = await signInAnonymously(auth);
  else {
    credential = await createUserWithEmailAndPassword(
      auth,
      `test${Date.now()}${serial}@example.com`,
      "TestPassword123!",
    );
    if (kind !== "unverified") {
      await adminAuth(server).updateUser(credential.user.uid, {
        emailVerified: true,
      });
      if (kind === "global")
        await adminAuth(server).setCustomUserClaims(credential.user.uid, {
          globalAdmin: true,
        });
      await credential.user.getIdToken(true);
    }
  }
  const fn = getFunctions(app);
  connectFunctionsEmulator(fn, "127.0.0.1", 5001);
  return { auth, fn, uid: credential.user.uid };
}
async function match(c = owner, overrides = {}) {
  return (
    await call(c, "createMatch", { settings: { ...data(), ...overrides } })
  ).id;
}
const join = (c, id) => call(c, "registerPlayer", { id, profile });
before(async () => {
  server = adminApp(
    { projectId, storageBucket: `${projectId}.firebasestorage.app` },
    "tests-admin",
  );
  db = getFirestore(server);
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 8085,
      rules: await readFile("firestore.rules", "utf8"),
    },
    storage: {
      host: "127.0.0.1",
      port: 9199,
      rules: await readFile("storage.rules", "utf8"),
    },
  });
  owner = await client("owner");
  other = await client("owner");
  global = await client("global");
  unverified = await client("unverified");
  players = await Promise.all(
    Array.from({ length: 6 }, () => client("anonymous")),
  );
});
after(async () => {
  await env?.cleanup();
  await Promise.all(apps.map(deleteApp));
  if (server) await deleteAdmin(server);
});
test("real Auth email registration/login/logout/reset/verification messages", async () => {
  const a = unverified.auth,
    email = a.currentUser.email;
  await sendEmailVerification(a.currentUser);
  await sendPasswordResetEmail(a, email);
  await signOut(a);
  assert.equal(a.currentUser, null);
  await signInWithEmailAndPassword(a, email, "TestPassword123!");
  assert.ok(a.currentUser);
  const r = await fetch(
    `http://127.0.0.1:9099/emulator/v1/projects/${projectId}/oobCodes`,
  );
  const codes = (await r.json()).oobCodes;
  assert.ok(
    codes.some((c) => c.email === email && c.requestType === "VERIFY_EMAIL"),
  );
  assert.ok(
    codes.some((c) => c.email === email && c.requestType === "PASSWORD_RESET"),
  );
});
test("verified owner creates match; anonymous and unverified owners rejected", async () => {
  await denied(call(players[0], "createMatch", { settings: data() }));
  await denied(call(unverified, "createMatch", { settings: data() }));
  const id = await match();
  assert.equal(
    (await db.doc(`matches/${id}`).get()).data().ownerUid,
    owner.uid,
  );
});
test("public metadata get only; roster requires auth; owner query satisfies rules", async () => {
  const id = await match();
  const publicDb = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(publicDb, "matches", id)));
  await assertFails(getDocs(collection(publicDb, "matches")));
  await assertFails(getDocs(collection(publicDb, "matches", id, "players")));
  const ownDb = env
    .authenticatedContext(owner.uid, { email_verified: true })
    .firestore();
  await assertSucceeds(
    getDocs(
      query(collection(ownDb, "matches"), where("ownerUid", "==", owner.uid)),
    ),
  );
});
test("Firestore denies direct settings/owner/payment/role writes and deletion", async () => {
  const id = await match();
  await join(players[0], id);
  const d = env.authenticatedContext(players[0].uid).firestore();
  for (const change of [
    { title: "hack" },
    { ownerUid: players[0].uid },
    { globalAdmin: true },
  ])
    await assertFails(updateDoc(doc(d, "matches", id), change));
  await assertFails(deleteDoc(doc(d, "matches", id)));
  await assertFails(
    updateDoc(doc(d, "matches", id, "payments", players[0].uid), {
      isPaid: true,
    }),
  );
  await assertFails(
    deleteDoc(doc(d, "matches", id, "players", players[0].uid)),
  );
  await assertFails(
    setDoc(doc(d, "roles", players[0].uid), { globalAdmin: true }),
  );
});
test("backend checks ownership independently and rejects injected fields", async () => {
  const id = await match();
  await denied(call(other, "updateMatch", { id, settings: data() }));
  await denied(call(players[0], "updateMatch", { id, settings: data() }));
  await denied(
    call(owner, "updateMatch", {
      id,
      settings: { ...data(), ownerUid: other.uid },
    }),
  );
  await denied(
    call(owner, "createMatch", { settings: data(), globalAdmin: true }),
  );
  await call(owner, "updateMatch", {
    id,
    settings: { ...data(), title: "updated" },
  });
  assert.equal((await db.doc(`matches/${id}`).get()).data().title, "updated");
  await call(global, "updateMatch", {
    id,
    settings: { ...data(), title: "global" },
  });
});
test("duplicate registration and client controlled queue/paid fields rejected", async () => {
  const id = await match();
  await join(players[0], id);
  await denied(join(players[0], id));
  await denied(
    call(players[1], "registerPlayer", { id, profile, sequence: 0 }),
  );
  await denied(
    call(players[1], "registerPlayer", {
      id,
      profile: { ...profile, isPaid: true },
    }),
  );
  await denied(
    call(players[1], "registerPlayer", { id, profile, manual: true }),
  );
});
test("simultaneous joins preserve capacity and strict sequence; simultaneous withdrawals promote oldest", async () => {
  const id = await match();
  await Promise.all(players.map((p) => join(p, id)));
  const rows = (
    await db.collection(`matches/${id}/players`).orderBy("sequence").get()
  ).docs;
  assert.equal(rows.length, 6);
  assert.deepEqual(
    rows.map((s) => s.data().sequence),
    [0, 1, 2, 3, 4, 5],
  );
  assert.deepEqual(
    rows.map((s) => s.data().status),
    ["active", "active", "waiting", "waiting", "waiting", "waiting"],
  );
  await Promise.all(
    rows.slice(0, 2).map((s) =>
      call(
        players.find((p) => p.uid === s.id),
        "withdrawPlayer",
        { id, uid: s.id },
      ),
    ),
  );
  const after = (
    await db.collection(`matches/${id}/players`).orderBy("sequence").get()
  ).docs;
  assert.deepEqual(
    after.filter((s) => s.data().status === "active").map((s) => s.id),
    rows.slice(2, 4).map((s) => s.id),
  );
});
test("players cannot delete another player; deadlines use server time; admin overrides", async () => {
  const id = await match();
  await join(players[0], id);
  await denied(call(players[1], "withdrawPlayer", { id, uid: players[0].uid }));
  await db
    .doc(`matches/${id}`)
    .update({ withdrawalDeadline: Timestamp.fromMillis(Date.now() - 1000) });
  await denied(call(players[0], "withdrawPlayer", { id, uid: players[0].uid }));
  await call(owner, "withdrawPlayer", { id, uid: players[0].uid });
  assert.equal(
    (await db.doc(`matches/${id}/players/${players[0].uid}`).get()).exists,
    false,
  );
});
test("capacity edits rebalance in order; self withdrawal before deadline works", async () => {
  const id = await match(owner, { maxPlayers: 3 });
  await Promise.all(players.slice(0, 4).map((p) => join(p, id)));
  await call(owner, "updateMatch", {
    id,
    settings: { ...data(), maxPlayers: 2 },
  });
  const rows = (
    await db.collection(`matches/${id}/players`).orderBy("sequence").get()
  ).docs;
  assert.equal(rows.filter((s) => s.data().status === "active").length, 2);
  await call(
    players.find((p) => p.uid === rows[0].id),
    "withdrawPlayer",
    { id, uid: rows[0].id },
  );
  assert.equal((await rows[2].ref.get()).data().status, "active");
});
test("private payment docs and instructions restricted; owner/global can mark paid", async () => {
  const id = await match();
  await join(players[0], id);
  await denied(
    call(players[0], "setPayment", { id, uid: players[0].uid, isPaid: true }),
  );
  await denied(
    call(other, "setPayment", { id, uid: players[0].uid, isPaid: true }),
  );
  await call(owner, "setPayment", { id, uid: players[0].uid, isPaid: true });
  await call(global, "setPayment", { id, uid: players[0].uid, isPaid: false });
  await call(owner, "setPaymentInfo", { id, instructions: "حساب خاص" });
  const a = env.authenticatedContext(players[0].uid).firestore(),
    b = env.authenticatedContext(players[1].uid).firestore();
  await assertSucceeds(
    getDoc(doc(a, "matches", id, "payments", players[0].uid)),
  );
  await assertFails(getDoc(doc(b, "matches", id, "payments", players[0].uid)));
  await assertSucceeds(getDoc(doc(a, "matches", id, "private", "paymentInfo")));
  await assertFails(getDoc(doc(b, "matches", id, "private", "paymentInfo")));
});
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6ioAAAAASUVORK5CYII=";
test("server image validation rejects invalid/oversized/spoofed uploads", async () => {
  const id = await match();
  await join(players[0], id);
  for (const payload of [
    {
      base64: Buffer.from("<svg/>").toString("base64"),
      contentType: "image/svg+xml",
    },
    {
      base64: Buffer.from("not png").toString("base64"),
      contentType: "image/png",
    },
    {
      base64: Buffer.alloc(701 * 1024).toString("base64"),
      contentType: "image/png",
    },
    { base64: png, contentType: "image/jpeg" },
  ])
    await denied(call(players[0], "uploadProof", { id, ...payload }));
  await denied(
    call(players[1], "uploadProof", {
      id,
      base64: png,
      contentType: "image/png",
    }),
  );
});
test("private proof roundtrip; Storage rules block other users and all raw uploads", async () => {
  const id = await match();
  await join(players[0], id);
  await call(players[0], "uploadProof", {
    id,
    base64: png,
    contentType: "image/png",
  });
  const pay = (
    await db.doc(`matches/${id}/payments/${players[0].uid}`).get()
  ).data();
  assert.match(pay.proofPath, /\.png$/);
  const [metadata] = await getStorage(server)
    .bucket()
    .file(pay.proofPath)
    .getMetadata();
  assert.equal(metadata.metadata?.firebaseStorageDownloadTokens, undefined);
  assert.ok(
    (await call(players[0], "readProof", { id, uid: players[0].uid })).base64,
  );
  await call(owner, "readProof", { id, uid: players[0].uid });
  await call(global, "readProof", { id, uid: players[0].uid });
  await denied(call(players[1], "readProof", { id, uid: players[0].uid }));
  const storage = env
    .authenticatedContext(players[1].uid)
    .storage(`${projectId}.firebasestorage.app`);
  await assertFails(getBytes(ref(storage, pay.proofPath)));
  const own = env
    .authenticatedContext(players[0].uid)
    .storage(`${projectId}.firebasestorage.app`);
  await assertSucceeds(getBytes(ref(own, pay.proofPath)));
  for (const [type, bytes] of [
    ["image/png", new Uint8Array(1)],
    ["text/html", new Uint8Array(1)],
    ["image/png", new Uint8Array(800 * 1024)],
  ])
    await assertFails(
      uploadBytes(ref(own, pay.proofPath), bytes, { contentType: type }),
    );
  await call(players[0], "withdrawPlayer", { id, uid: players[0].uid });
  await assertFails(getBytes(ref(own, pay.proofPath)));
});
test("owner manual management and roster reset preserve future queue consistency", async () => {
  const id = await match();
  const { uid } = await call(owner, "registerPlayer", {
    id,
    profile,
    manual: true,
  });
  assert.match(uid, /^manual-/);
  await join(players[0], id);
  await denied(call(other, "resetRoster", { id }));
  await call(owner, "resetRoster", { id });
  assert.equal((await db.collection(`matches/${id}/players`).get()).size, 0);
  await join(players[0], id);
  assert.equal(
    (await db.doc(`matches/${id}/players/${players[0].uid}`).get()).data()
      .status,
    "active",
  );
});
test("unauthorized deletion rejected; global deletion removes descendants and tombstones code", async () => {
  const id = await match();
  await join(players[0], id);
  await denied(call(players[0], "deleteMatch", { id }));
  await denied(call(other, "deleteMatch", { id }));
  await call(global, "deleteMatch", { id });
  assert.equal((await db.doc(`matches/${id}`).get()).data().state, "deleted");
  assert.equal((await db.collection(`matches/${id}/players`).get()).size, 0);
  assert.equal((await db.collection(`matches/${id}/payments`).get()).size, 0);
  await denied(join(players[1], id));
  await denied(call(owner, "createMatch", { id, settings: data() }));
});
