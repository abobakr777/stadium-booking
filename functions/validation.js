import { HttpsError } from "firebase-functions/v2/https";
export const fail = (code, message) => {
  throw new HttpsError(code, message);
};
export function exact(data, keys) {
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    Object.keys(data).some((k) => !keys.includes(k))
  )
    fail("invalid-argument", "حقول غير صالحة");
}
export function text(v, max = 100) {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    fail("invalid-argument", "نص غير صالح");
  return v.trim();
}
export function code(v) {
  if (typeof v !== "string" || !/^[a-zA-Z0-9_-]{4,32}$/.test(v))
    fail("invalid-argument", "رمز غير صالح (4–32)");
  return v;
}
export function integer(v, min, max) {
  if (!Number.isInteger(v) || v < min || v > max)
    fail("invalid-argument", "عدد غير صالح");
  return v;
}
export function settings(d) {
  exact(d, [
    "title",
    "maxPlayers",
    "totalCost",
    "currency",
    "location",
    "startsAt",
    "endsAt",
    "withdrawalDeadline",
  ]);
  const title = text(d.title),
    maxPlayers = integer(d.maxPlayers, 2, 100),
    totalCost = d.totalCost;
  if (
    typeof totalCost !== "number" ||
    !Number.isFinite(totalCost) ||
    totalCost < 0 ||
    totalCost > 100000
  )
    fail("invalid-argument", "تكلفة غير صالحة");
  const currency = text(d.currency, 8);
  let location = d.location || "";
  if (typeof location !== "string" || location.length > 1000)
    fail("invalid-argument", "رابط غير صالح");
  if (location) {
    let u;
    try {
      u = new URL(location);
    } catch {
      fail("invalid-argument", "رابط غير صالح");
    }
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      ![
        "maps.google.com",
        "www.google.com",
        "google.com",
        "maps.app.goo.gl",
        "goo.gl",
      ].includes(u.hostname)
    )
      fail("invalid-argument", "استخدم رابط Google Maps HTTPS");
  }
  for (const k of ["startsAt", "endsAt", "withdrawalDeadline"])
    if (!Number.isSafeInteger(d[k]) || d[k] < 0 || d[k] > 8640000000000000)
      fail("invalid-argument", "تاريخ غير صالح");
  if (
    d.endsAt <= d.startsAt ||
    d.endsAt - d.startsAt > 86400000 ||
    d.withdrawalDeadline > d.startsAt
  )
    fail("invalid-argument", "تحقق من ترتيب الأوقات");
  return {
    title,
    maxPlayers,
    totalCost,
    currency,
    location,
    startsAt: d.startsAt,
    endsAt: d.endsAt,
    withdrawalDeadline: d.withdrawalDeadline,
  };
}
export function profile(d) {
  exact(d, ["name", "position", "level"]);
  if (
    !["حارس", "دفاع", "وسط", "هجوم"].includes(d.position) ||
    !["مبتدئ", "متوسط", "محترف"].includes(d.level)
  )
    fail("invalid-argument", "المركز أو المستوى غير صالح");
  return { name: text(d.name, 60), position: d.position, level: d.level };
}
