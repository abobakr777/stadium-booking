import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/client";
export const call = async (name, data) =>
  (await httpsCallable(functions, name)(data)).data;
export async function upload(id, file) {
  if (
    !file ||
    file.size > 700 * 1024 ||
    !["image/png", "image/jpeg", "image/webp"].includes(file.type)
  )
    throw Error("اختر صورة PNG أو JPEG أو WebP أصغر من 700 كيلوبايت");
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.readAsDataURL(file);
  });
  return call("uploadProof", { id, base64, contentType: file.type });
}
export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    window.prompt("انسخ النص:", text);
  }
}
