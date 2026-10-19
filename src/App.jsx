import React, { useState, useRef, useEffect } from "react";
import { collection, query, where } from "firebase/firestore";
import { db, emulated } from "./firebase/client";
import { useAuth } from "./contexts/Auth";
import { useLive } from "./hooks/useLive";
import { Account } from "./components/Account";
import { MatchForm } from "./components/MatchForm";
import { Match } from "./pages/Match";
import { call } from "./services/api";
export default function App() {
  const { user, claims, loading, error } = useAuth();
  const [id, setId] = useState(() =>
      new URLSearchParams(location.search).get("id"),
    ),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [create, setCreate] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    const pop = () => {
      setId(new URLSearchParams(location.search).get("id"));
      setCreate(false);
    };
    addEventListener("popstate", pop);
    return () => removeEventListener("popstate", pop);
  }, []);
  const navigate = (id) => {
    history.pushState(
      {},
      "",
      id ? `?id=${encodeURIComponent(id)}` : location.pathname,
    );
    setId(id);
    setCreate(false);
    setMessage("");
  };
  const run = async (fn) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await fn();
      setMessage("تمت العملية بنجاح");
    } catch (e) {
      setMessage(`تعذر إتمام العملية: ${e.message}`);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const admin = Boolean(claims.email_verified),
    global = admin && claims.globalAdmin;
  const matches = useLive(
    () =>
      admin
        ? global
          ? collection(db, "matches")
          : query(collection(db, "matches"), where("ownerUid", "==", user.uid))
        : null,
    user?.uid + ":" + admin + ":" + global,
  );
  if (loading) return <main>جارٍ التحقق من الهوية…</main>;
  return (
    <>
      <header>
        <button className="brand" onClick={() => navigate(null)}>
          ⚽ إدارة الملاعب
        </button>
        <span>Stadium Booking</span>
      </header>
      <main className="stack">
        {emulated && <p className="local">بيئة محلية — Firebase Emulator</p>}
        {(message || error) && (
          <p className="notice" role="status">
            {message || error}
          </p>
        )}
        {busy && <p role="status">جارٍ تنفيذ العملية…</p>}
        {id ? (
          /^[a-zA-Z0-9_-]{4,32}$/.test(id) ? (
            <Match
              key={id}
              id={id}
              run={run}
              busy={busy}
              home={() => navigate(null)}
            />
          ) : (
            <section className="card">رمز المباراة غير صالح</section>
          )
        ) : (
          <>
            <section className="card stack">
              <h1>إدارة الملاعب</h1>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const code = new FormData(e.currentTarget).get("code").trim();
                  navigate(code);
                }}
              >
                <label>
                  الانضمام لمباراة
                  <input
                    name="code"
                    required
                    pattern="[a-zA-Z0-9_-]{4,32}"
                    placeholder="أدخل رمز الحجز"
                    dir="ltr"
                  />
                </label>
                <button>دخول</button>
              </form>
              {admin && (
                <button onClick={() => setCreate(!create)}>
                  إنشاء حجز جديد
                </button>
              )}
            </section>
            {create && admin && (
              <MatchForm
                busy={busy}
                onSave={(data) =>
                  run(async () => {
                    const result = await call("createMatch", data);
                    navigate(result.id);
                  })
                }
              />
            )}
            {admin && (
              <section className="card stack">
                <h2>{global ? "لوحة التحكم الشاملة" : "مبارياتي"}</h2>
                {matches.error && <p role="alert">{matches.error}</p>}
                {(matches.data || []).map((m) => (
                  <article className="player" key={m.id}>
                    <span>
                      {m.title}
                      <small>
                        {m.id} · {m.state}
                      </small>
                    </span>
                    <div className="row">
                      <button onClick={() => navigate(m.id)}>زيارة</button>
                      {global &&
                        m.endsAt?.toMillis() < Date.now() &&
                        m.state !== "deleted" && (
                          <button
                            className="danger"
                            disabled={busy}
                            onClick={() => {
                              if (confirm("تنظيف هذه المباراة المنتهية؟"))
                                run(() => call("deleteMatch", { id: m.id }));
                            }}
                          >
                            تنظيف المنتهية
                          </button>
                        )}
                      {m.state === "deleting" && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            run(() => call("deleteMatch", { id: m.id }))
                          }
                        >
                          إعادة محاولة الحذف
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </section>
            )}
          </>
        )}
        <Account run={run} busy={busy} />
        <footer>my-stadium-app-v1 · إدارة المباريات والحجوزات</footer>
      </main>
    </>
  );
}
