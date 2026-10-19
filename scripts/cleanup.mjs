// Trusted operator: retry durable jobs and remove unreachable/orphan proof objects.
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
const [projectId, bucket] = process.argv.slice(2);
if (!projectId || !bucket)
  throw Error("Usage: node scripts/cleanup.mjs PROJECT BUCKET");
initializeApp({
  projectId,
  storageBucket: bucket,
  credential: applicationDefault(),
});
const db = getFirestore(),
  storage = getStorage().bucket();
for (const job of (await db.collection("cleanup").get()).docs) {
  for (const path of job.data().paths || [job.data().path])
    await storage.file(path).delete({ ignoreNotFound: true });
  await job.ref.delete();
}
const [files] = await storage.getFiles({ prefix: "proofs/" });
for (const file of files) {
  const [, id, uid] = file.name.split("/");
  const [metadata] = await file.getMetadata();
  // Grace period protects uploads that have not yet committed their reference.
  if (Date.now() - Date.parse(metadata.timeCreated) < 86400000) continue;
  const [match, payment] = await Promise.all([
    db.doc(`matches/${id}`).get(),
    db.doc(`matches/${id}/payments/${uid}`).get(),
  ]);
  if (match.data()?.state !== "open" || payment.data()?.proofPath !== file.name)
    await file.delete({ ignoreNotFound: true });
}
console.log("Cleanup completed");
