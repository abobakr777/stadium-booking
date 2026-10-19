import React, { useState, useEffect } from "react";
import { doc, collection, query, orderBy } from "firebase/firestore";
import { db } from "../firebase/client";
import { useAuth } from "../contexts/Auth";
import { useLive } from "../hooks/useLive";
import { call, upload, copy } from "../services/api";
import { MatchForm } from "../components/MatchForm";
import { generateTeams } from "../utils/teams";
export function Match({ id, run, busy, home }) {
  const { user, claims, guest } = useAuth();
  const [edit, setEdit] = useState(false),
    [manual, setManual] = useState(false),
    [proof, setProof] = useState(""),
    [teams, setTeams] = useState(""),
    [count, setCount] = useState(2),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    setProof("");
  }, [user?.uid]);
  const mstate = useLive(() => doc(db, "matches", id), id + user?.uid);
  const m = mstate.data;
  const admin = Boolean(
    claims.email_verified && (m?.ownerUid === user?.uid || claims.globalAdmin),
  );
  const roster = useLive(
    () =>
      user
        ? query(collection(db, "matches", id, "players"), orderBy("sequence"))
        : null,
    id + user?.uid,
  );
  const players = roster.data || [],
    me = players.find((p) => p.id === user?.uid);
  const payment = useLive(
    () =>
      user
        ? admin
          ? collection(db, "matches", id, "payments")
          : doc(db, "matches", id, "payments", user.uid)
        : null,
    id + user?.uid + admin,
  );
  const payRows = admin
    ? payment.data || []
    : payment.data
      ? [payment.data]
      : [];
  const info = useLive(
    () =>
      admin || me ? doc(db, "matches", id, "private", "paymentInfo") : null,
    id + user?.uid + admin + Boolean(me),
  );
  if (mstate.error)
    return (
      <div className="card" role="alert">
        المباراة غير متاحة: {mstate.error}
      </div>
    );
  if (mstate.loading) return <p>جارٍ تحميل المباراة…</p>;
  if (!m || m.state !== "open")
    return <div className="card">المباراة غير موجودة أو تم حذفها</div>;
  const active = players.filter((p) => p.status === "active"),
    waiting = players.filter((p) => p.status === "waiting");
  const share = `⚽ ${m.title}\n${new Date(m.startsAt.toMillis()).toLocaleString("ar")}\n${window.location.href}`;
  async function register(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(async () => {
      await guest();
      await call("registerPlayer", {
        id,
        profile: {
          name: f.get("name"),
          position: f.get("position"),
          level: f.get("level"),
        },
        ...(admin && manual ? { manual: true } : {}),
      });
    });
  }
  const remove = (uid) => {
    if (confirm("تأكيد الانسحاب / حذف اللاعب؟"))
      run(() => call("withdrawPlayer", { id, uid }));
  };
  const show = (uid) =>
    run(async () => {
      const p = await call("readProof", { id, uid });
      setProof(`data:image/png;base64,${p.base64}`);
    });
  function list(rows) {
    return rows.map((p, i) => {
      const pay = payRows.find((x) => x.id === p.id);
      return (
        <article className="player" key={p.id}>
          <div>
            <strong>
              {i + 1}. {p.name}
            </strong>
            <small>
              {p.position} | {p.level}
            </small>
            {pay && <span>{pay.isPaid ? "✓ مدفوع" : "غير مدفوع"}</span>}
          </div>
          <div className="row">
            {admin && (
              <button
                disabled={busy}
                onClick={() =>
                  run(() =>
                    call("setPayment", { id, uid: p.id, isPaid: !pay?.isPaid }),
                  )
                }
              >
                {pay?.isPaid ? "إلغاء الدفع" : "تأكيد الدفع"}
              </button>
            )}
            {pay?.proofPath && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => show(p.id)}
              >
                الإيصال
              </button>
            )}
            {(admin ||
              (p.id === user?.uid &&
                now < m.withdrawalDeadline.toMillis())) && (
              <button
                className="danger"
                disabled={busy}
                onClick={() => remove(p.id)}
              >
                انسحاب
              </button>
            )}
          </div>
        </article>
      );
    });
  }
  return (
    <div className="stack">
      <section className="card stack">
        <h1>⚽ {m.title}</h1>
        <div className="row">
          <button className="secondary" onClick={() => run(() => copy(id))}>
            نسخ الرمز: {id}
          </button>
          <button onClick={() => run(() => copy(window.location.href))}>
            نسخ الرابط
          </button>
          <a
            className="button whatsapp"
            href={`https://wa.me/?text=${encodeURIComponent(share)}`}
            target="_blank"
            rel="noreferrer"
          >
            واتساب
          </a>
        </div>
        <p>
          {new Date(m.startsAt.toMillis()).toLocaleString("ar")} –{" "}
          {new Date(m.endsAt.toMillis()).toLocaleTimeString("ar")}
          <small>{Intl.DateTimeFormat().resolvedOptions().timeZone}</small>
        </p>
        <p>
          {now >= m.startsAt.toMillis()
            ? "المباراة بدأت ⚽"
            : `الوقت المتبقي: ${Math.floor((m.startsAt.toMillis() - now) / 3600000)} س ${Math.floor((m.startsAt.toMillis() - now) / 60000) % 60} د ${Math.floor((m.startsAt.toMillis() - now) / 1000) % 60} ث`}
        </p>
        {m.location && (
          <a href={m.location} target="_blank" rel="noreferrer">
            📍 موقع الملعب
          </a>
        )}
        <div className="stats">
          <span>
            المقاعد{" "}
            <b>
              {active.length}/{m.maxPlayers}
            </b>
          </span>
          <span>
            للشخص{" "}
            <b>
              {(m.totalCost / m.maxPlayers).toFixed(2)} {m.currency}
            </b>
          </span>
          <span>
            المجموع{" "}
            <b>
              {m.totalCost} {m.currency}
            </b>
          </span>
        </div>
        <small>
          آخر موعد للانسحاب:{" "}
          {new Date(m.withdrawalDeadline.toMillis()).toLocaleString("ar")}
        </small>
      </section>
      {!user && (
        <section className="card">
          <button disabled={busy} onClick={() => run(guest)}>
            متابعة كلاعب وعرض القائمة
          </button>
        </section>
      )}
      {admin && (
        <section className="card admin stack">
          <h2>⚙️ تحكم المشرف</h2>
          <div className="row">
            <button disabled={busy} onClick={() => setEdit(!edit)}>
              تعديل التفاصيل
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={() => {
                if (confirm("حذف المباراة نهائياً؟"))
                  run(async () => {
                    await call("deleteMatch", { id });
                    home();
                  });
              }}
            >
              حذف المباراة
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={() => {
                if (confirm("مسح جميع اللاعبين؟"))
                  run(() => call("resetRoster", { id }));
              }}
            >
              مسح اللاعبين
            </button>
          </div>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              run(() =>
                call("setPaymentInfo", {
                  id,
                  instructions: new FormData(e.currentTarget).get(
                    "instructions",
                  ),
                }),
              );
            }}
          >
            <label>
              بيانات الدفع الخاصة بالمشاركين
              <textarea
                name="instructions"
                maxLength={2000}
                required
                defaultValue={info.data?.instructions || ""}
                key={info.data?.instructions}
              />
            </label>
            <button disabled={busy}>حفظ بيانات الدفع</button>
          </form>
          <label className="check">
            <input
              type="checkbox"
              checked={manual}
              onChange={(e) => setManual(e.target.checked)}
            />
            إضافة لاعب يدوياً (يديره المشرف)
          </label>
        </section>
      )}
      {edit && admin && (
        <MatchForm
          match={m}
          busy={busy}
          onSave={(data) =>
            run(async () => {
              await call("updateMatch", data);
              setEdit(false);
            })
          }
        />
      )}
      {info.data?.instructions && (
        <section className="card">
          <h2>بيانات الدفع</h2>
          <p className="pre">{info.data.instructions}</p>
        </section>
      )}
      {user && (!me || (admin && manual)) && (
        <form className="card stack" onSubmit={register}>
          <h2>
            {active.length >= m.maxPlayers
              ? "التسجيل في الاحتياط"
              : "انضمام للمباراة"}
          </h2>
          <label>
            اسم اللاعب
            <input name="name" required maxLength={60} />
          </label>
          <div className="grid">
            <label>
              المركز
              <select name="position">
                {["هجوم", "وسط", "دفاع", "حارس"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              المستوى
              <select name="level">
                {["متوسط", "مبتدئ", "محترف"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </div>
          <button disabled={busy}>تسجيل اللاعب</button>
          <small>
            الاسم للعرض فقط. هوية اللاعب مرتبطة بهذا المتصفح؛ مسح بياناته أو
            تبديل الجهاز قد يفقد إمكانية إدارة التسجيل. يمكنك ربطها بحساب من قسم
            المشرف.
          </small>
        </form>
      )}
      {me && (
        <section className="card stack">
          <h2>✓ أنت مسجل: {me.name}</h2>
          <label>
            إرفاق / تغيير إيصال الدفع (700 كيلوبايت)
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files[0];
                if (f) run(() => upload(id, f));
                e.target.value = "";
              }}
            />
          </label>
        </section>
      )}
      {roster.error && <p role="alert">{roster.error}</p>}
      <section className="card stack">
        <h2>اللاعبون الأساسيون</h2>
        {list(active)}
        {!active.length && <p>لا يوجد لاعبون بعد</p>}
      </section>
      {waiting.length > 0 && (
        <section className="card waiting stack">
          <h2>قائمة الاحتياط</h2>
          {list(waiting)}
        </section>
      )}
      {admin && (
        <section className="card stack">
          <h2>تقسيم الفرق</h2>
          <label>
            عدد الفرق
            <input
              type="number"
              min="2"
              max={Math.max(2, active.length)}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </label>
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                const result = generateTeams(active, count);
                setTeams(result.text);
                await copy(result.text);
              })
            }
          >
            تقسيم ونسخ النتيجة
          </button>
          {teams && <pre>{teams}</pre>}
        </section>
      )}
      {proof && (
        <div className="modal" role="dialog" aria-label="إيصال الدفع">
          <button onClick={() => setProof("")}>إغلاق</button>
          <img src={proof} alt="إيصال الدفع الخاص" />
        </div>
      )}
    </div>
  );
}
