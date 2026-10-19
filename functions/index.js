import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onCall } from "firebase-functions/v2/https";
import { randomUUID, randomBytes } from "node:crypto";
import sharp from "sharp";
import { fail, exact, text, code, settings, profile } from "./validation.js";

initializeApp(
  process.env.FUNCTIONS_EMULATOR === "true"
    ? { storageBucket: "demo-stadium-booking.firebasestorage.app" }
    : undefined,
);
const db = getFirestore();
const stamp = () => FieldValue.serverTimestamp();
const wrap = (handler) =>
  onCall(
    { region: "us-central1", maxInstances: 10, memory: "512MiB" },
    handler,
  );
function identity(r) {
  if (!r.auth) fail("unauthenticated", "سجل الدخول أولاً");
  return r.auth;
}
function verified(a) {
  return (
    a.token.email_verified === true &&
    a.token.firebase?.sign_in_provider !== "anonymous"
  );
}
function global(a) {
  return verified(a) && a.token.globalAdmin === true;
}
function manager(a, m) {
  return verified(a) && (m.ownerUid === a.uid || global(a));
}
function requireManager(a, m) {
  if (!manager(a, m))
    fail("permission-denied", "لا تملك صلاحية إدارة هذه المباراة");
}
function active(s) {
  if (!s.exists || s.data().state !== "open")
    fail("not-found", "المباراة غير متاحة");
  return s.data();
}
const mref = (id) => db.doc(`matches/${code(id)}`);
const ordered = (ref) => ref.collection("players").orderBy("sequence");
function rebalance(tx, rows, capacity) {
  rows.forEach((s, i) => {
    const status = i < capacity ? "active" : "waiting";
    if (s.data().status !== status) tx.update(s.ref, { status });
  });
}
function timestampSettings(s) {
  return {
    ...s,
    startsAt: Timestamp.fromMillis(s.startsAt),
    endsAt: Timestamp.fromMillis(s.endsAt),
    withdrawalDeadline: Timestamp.fromMillis(s.withdrawalDeadline),
  };
}

export const createMatch = wrap(async (r) => {
  const a = identity(r);
  if (!verified(a)) fail("permission-denied", "أكد بريدك الإلكتروني أولاً");
  exact(r.data, ["id", "settings"]);
  const id = r.data.id ? code(r.data.id) : randomBytes(8).toString("hex");
  const ref = mref(id);
  const s = settings(r.data.settings);
  if (s.startsAt <= Date.now())
    fail("invalid-argument", "اختر موعداً مستقبلياً");
  await db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) fail("already-exists", "الرمز مستخدم");
    tx.create(ref, {
      ...timestampSettings(s),
      ownerUid: a.uid,
      state: "open",
      nextSequence: 0,
      createdAt: stamp(),
      updatedAt: stamp(),
    });
  });
  return { id };
});
export const updateMatch = wrap(async (r) => {
  const a = identity(r);
  exact(r.data, ["id", "settings"]);
  const ref = mref(r.data.id),
    s = settings(r.data.settings);
  await db.runTransaction(async (tx) => {
    const m = active(await tx.get(ref));
    requireManager(a, m);
    const rows = await tx.get(ordered(ref));
    tx.update(ref, { ...timestampSettings(s), updatedAt: stamp() });
    rebalance(tx, rows.docs, s.maxPlayers);
  });
  return { ok: true };
});
export const registerPlayer = wrap(async (r) => {
  const a = identity(r);
  exact(r.data, ["id", "profile", "manual"]);
  const ref = mref(r.data.id),
    p = profile(r.data.profile);
  if (r.data.manual !== undefined && typeof r.data.manual !== "boolean")
    fail("invalid-argument", "manual");
  const uid = r.data.manual ? `manual-${randomUUID()}` : a.uid;
  await db.runTransaction(async (tx) => {
    const m = active(await tx.get(ref));
    if (r.data.manual) requireManager(a, m);
    if (Date.now() >= m.startsAt.toMillis())
      fail("failed-precondition", "بدأت المباراة");
    const rows = await tx.get(ordered(ref));
    if (rows.docs.some((s) => s.id === uid))
      fail("already-exists", "أنت مسجل بالفعل");
    if (rows.size >= 200) fail("resource-exhausted", "قائمة الانتظار ممتلئة");
    tx.create(ref.collection("players").doc(uid), {
      ...p,
      createdBy: a.uid,
      registrationId: randomUUID(),
      sequence: m.nextSequence,
      status: rows.size < m.maxPlayers ? "active" : "waiting",
      createdAt: stamp(),
    });
    tx.create(ref.collection("payments").doc(uid), {
      isPaid: false,
      proofPath: null,
      updatedAt: stamp(),
    });
    tx.update(ref, { nextSequence: m.nextSequence + 1, updatedAt: stamp() });
  });
  return { uid };
});
export const withdrawPlayer = wrap(async (r) => {
  const a = identity(r);
  exact(r.data, ["id", "uid"]);
  const ref = mref(r.data.id),
    uid = text(r.data.uid, 128);
  if (uid.includes("/")) fail("invalid-argument", "uid");
  await db.runTransaction(async (tx) => {
    const m = active(await tx.get(ref));
    if (
      !manager(a, m) &&
      (uid !== a.uid || Date.now() >= m.withdrawalDeadline.toMillis())
    )
      fail("permission-denied", "انتهت مهلة الانسحاب أو لا تملك التسجيل");
    const rows = await tx.get(ordered(ref));
    if (!rows.docs.some((s) => s.id === uid))
      fail("not-found", "التسجيل غير موجود");
    const pay = await tx.get(ref.collection("payments").doc(uid));
    // A durable cleanup job survives a failed Storage delete. Paths are never reused.
    if (pay.data()?.proofPath)
      tx.create(db.collection("cleanup").doc(), { path: pay.data().proofPath });
    tx.delete(ref.collection("players").doc(uid));
    tx.delete(ref.collection("payments").doc(uid));
    rebalance(
      tx,
      rows.docs.filter((s) => s.id !== uid),
      m.maxPlayers,
    );
    tx.update(ref, { updatedAt: stamp() });
  });
  return { ok: true };
});
export const setPayment = wrap(async (r) => {
  const a = identity(r);
  exact(r.data, ["id", "uid", "isPaid"]);
  const ref = mref(r.data.id),
    uid = text(r.data.uid, 128);
  if (uid.includes("/") || typeof r.data.isPaid !== "boolean")
    fail("invalid-argument", "بيانات غير صالحة");
  await db.runTransaction(async (tx) => {
    const m = active(await tx.get(ref));
    requireManager(a, m);
    if (!(await tx.get(ref.collection("players").doc(uid))).exists)
      fail("not-found", "التسجيل غير موجود");
    tx.update(ref.collection("payments").doc(uid), {
      isPaid: r.data.isPaid,
      updatedAt: stamp(),
    });
  });
  return { ok: true };
});
export const setPaymentInfo = wrap(async (r) => {
  const a = identity(r);
  exact(r.data, ["id", "instructions"]);
  const ref = mref(r.data.id);
  const instructions = text(r.data.instructions, 2000);
  await db.runTransaction(async (tx) => {
    const m = active(await tx.get(ref));
    requireManager(a, m);
    tx.set(ref.collection("private").doc("paymentInfo"), {
      instructions,
      updatedAt: stamp(),
    });
  });
  return { ok: true };
});
export const uploadProof = wrap(async (r) => {
  const a = identity(r);
  exact(r.data, ["id", "base64", "contentType"]);
  const ref = mref(r.data.id);
  active(await ref.get());
  const pr = ref.collection("players").doc(a.uid),
    before = await pr.get();
  if (!before.exists) fail("permission-denied", "سجل في المباراة أولاً");
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(r.data.contentType) ||
    typeof r.data.base64 !== "string" ||
    r.data.base64.length > 960000 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(r.data.base64)
  )
    fail("invalid-argument", "صورة غير صالحة؛ الحد 700 كيلوبايت");
  const bytes = Buffer.from(r.data.base64, "base64");
  if (!bytes.length || bytes.length > 700 * 1024)
    fail("invalid-argument", "حجم الصورة غير صالح");
  let clean;
  try {
    const decoder = sharp(bytes, {
      limitInputPixels: 16000000,
      animated: false,
    });
    const meta = await decoder.metadata();
    if (
      !["png", "jpeg", "webp"].includes(meta.format) ||
      `image/${meta.format}` !== r.data.contentType
    )
      fail("invalid-argument", "نوع الصورة غير مطابق");
    clean = await decoder
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
  } catch {
    fail("invalid-argument", "تعذر قراءة الصورة");
  }
  const path = `proofs/${ref.id}/${a.uid}/${randomUUID()}.png`,
    file = getStorage().bucket().file(path);
  await file.save(clean, {
    resumable: false,
    metadata: { contentType: "image/png", cacheControl: "private, no-store" },
  });
  try {
    await db.runTransaction(async (tx) => {
      active(await tx.get(ref));
      const current = await tx.get(pr);
      const pay = await tx.get(ref.collection("payments").doc(a.uid));
      if (
        !current.exists ||
        current.data().registrationId !== before.data().registrationId
      )
        fail("failed-precondition", "التسجيل تغير؛ أعد المحاولة");
      if (pay.data()?.proofPath)
        tx.create(db.collection("cleanup").doc(), {
          path: pay.data().proofPath,
        });
      tx.update(pay.ref, { proofPath: path, updatedAt: stamp() });
    });
  } catch (e) {
    await file.delete({ ignoreNotFound: true });
    throw e;
  }
  return { ok: true };
});
// Callable authenticated download avoids permanent bearer URLs and Storage CORS setup.
export const readProof = wrap(async (r) => {
  const a = identity(r);
  exact(r.data, ["id", "uid"]);
  const ref = mref(r.data.id),
    uid = text(r.data.uid, 128);
  if (uid.includes("/")) fail("invalid-argument", "uid");
  const m = active(await ref.get());
  if (a.uid !== uid) requireManager(a, m);
  const p = await ref.collection("payments").doc(uid).get();
  if (!p.data()?.proofPath) fail("not-found", "لا يوجد إيصال");
  const [bytes] = await getStorage()
    .bucket()
    .file(p.data().proofPath)
    .download();
  return { base64: bytes.toString("base64") };
});
export const deleteMatch = wrap(async (r) => {
  const a = identity(r);
  exact(r.data, ["id"]);
  const ref = mref(r.data.id);
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) fail("not-found", "المباراة غير موجودة");
    requireManager(a, s.data());
    tx.update(ref, { state: "deleting", updatedAt: stamp() });
  });
  // Tombstone prevents code reuse while retries clean up descendants and files.
  await getStorage()
    .bucket()
    .deleteFiles({ prefix: `proofs/${ref.id}/` });
  for (const col of ["players", "payments", "private"])
    await db.recursiveDelete(ref.collection(col));
  await ref.update({ state: "deleted", updatedAt: stamp() });
  return { ok: true };
});
export const resetRoster = wrap(async (r) => {
  const a = identity(r);
  exact(r.data, ["id"]);
  const ref = mref(r.data.id);
  await db.runTransaction(async (tx) => {
    const m = active(await tx.get(ref));
    requireManager(a, m);
    const players = await tx.get(ordered(ref)),
      payments = await tx.get(ref.collection("payments"));
    // At most 200 players + 200 payments; proof cleanup is a single prefix job.
    const paths = payments.docs.map((s) => s.data().proofPath).filter(Boolean);
    if (paths.length) tx.create(db.collection("cleanup").doc(), { paths });
    players.docs.forEach((s) => tx.delete(s.ref));
    payments.docs.forEach((s) => tx.delete(s.ref));
    tx.update(ref, { updatedAt: stamp() });
  });
  return { ok: true };
});
