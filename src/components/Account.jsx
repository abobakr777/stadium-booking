import React, { useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
  EmailAuthProvider,
  linkWithCredential,
} from "firebase/auth";
import { auth } from "../firebase/client";
import { useAuth } from "../contexts/Auth";
export function Account({ run, busy }) {
  const { user, claims } = useAuth();
  const [mode, setMode] = useState("login");
  const member = user && !user.isAnonymous;
  async function submit(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      email = f.get("email"),
      password = f.get("password");
    await run(async () => {
      if (mode === "reset") {
        await sendPasswordResetEmail(auth, email);
        return;
      }
      if (mode === "register") {
        const result = auth.currentUser?.isAnonymous
          ? await linkWithCredential(
              auth.currentUser,
              EmailAuthProvider.credential(email, password),
            )
          : await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(result.user);
      } else await signInWithEmailAndPassword(auth, email, password);
    });
  }
  return (
    <section className="card stack">
      <h2>حساب المشرف</h2>
      {member ? (
        <>
          <p dir="ltr">{user.email}</p>
          <p>
            {claims.email_verified
              ? "✓ البريد مؤكد"
              : "أكد بريدك لتتمكن من إدارة المباريات"}
          </p>
          <div className="row">
            {!claims.email_verified && (
              <>
                <button
                  disabled={busy}
                  onClick={() => run(() => sendEmailVerification(user))}
                >
                  إرسال رسالة التأكيد
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await user.reload();
                      await user.getIdToken(true);
                    })
                  }
                >
                  تحققت من البريد
                </button>
              </>
            )}
            <button
              className="secondary"
              disabled={busy}
              onClick={() => run(() => signOut(auth))}
            >
              تسجيل الخروج
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="row">
            {[
              ["login", "دخول"],
              ["register", "حساب جديد"],
              ["reset", "نسيت كلمة المرور"],
            ].map(([k, label]) => (
              <button
                className={mode === k ? "" : "secondary"}
                key={k}
                onClick={() => setMode(k)}
              >
                {label}
              </button>
            ))}
          </div>
          <form className="stack" onSubmit={submit}>
            <label>
              البريد الإلكتروني
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                dir="ltr"
              />
            </label>
            {mode !== "reset" && (
              <label>
                كلمة المرور
                <input
                  name="password"
                  type="password"
                  minLength={8}
                  required
                  dir="ltr"
                  autoComplete={
                    mode === "register" ? "new-password" : "current-password"
                  }
                />
              </label>
            )}
            <button disabled={busy}>
              {mode === "reset"
                ? "إرسال رابط الاستعادة"
                : mode === "register"
                  ? "إنشاء الحساب"
                  : "تسجيل الدخول"}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
