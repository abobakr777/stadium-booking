import React from "react";
const local = (ms) => {
  const d = new Date(ms);
  return new Date(ms - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
export function MatchForm({ match, onSave, busy }) {
  const start = match?.startsAt?.toMillis() || Date.now() + 86400000;
  function submit(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    onSave({
      id: match?.id || f.get("id"),
      settings: {
        title: f.get("title"),
        maxPlayers: Number(f.get("maxPlayers")),
        totalCost: Number(f.get("totalCost")),
        currency: f.get("currency"),
        location: f.get("location"),
        startsAt: Date.parse(f.get("startsAt")),
        endsAt: Date.parse(f.get("endsAt")),
        withdrawalDeadline: Date.parse(f.get("withdrawalDeadline")),
      },
    });
  }
  return (
    <form onSubmit={submit} className="card stack">
      <h2>{match ? "تعديل المباراة" : "إنشاء حجز جديد"}</h2>
      {!match && (
        <label>
          رمز الحجز (اختياري)
          <input
            name="id"
            pattern="[a-zA-Z0-9_-]{4,32}"
            placeholder="تلقائي"
            dir="ltr"
          />
        </label>
      )}
      <label>
        اسم المباراة
        <input
          name="title"
          required
          maxLength={100}
          defaultValue={match?.title || "مباراة ودية"}
        />
      </label>
      <p className="muted">
        الأوقات حسب جهازك: {Intl.DateTimeFormat().resolvedOptions().timeZone}
      </p>
      <div className="grid">
        <label>
          بداية المباراة
          <input
            name="startsAt"
            type="datetime-local"
            required
            defaultValue={local(start)}
          />
        </label>
        <label>
          نهاية المباراة
          <input
            name="endsAt"
            type="datetime-local"
            required
            defaultValue={local(match?.endsAt?.toMillis() || start + 3600000)}
          />
        </label>
      </div>
      <label>
        آخر موعد للانسحاب
        <input
          name="withdrawalDeadline"
          type="datetime-local"
          required
          defaultValue={local(
            match?.withdrawalDeadline?.toMillis() || start - 7200000,
          )}
        />
      </label>
      <div className="grid">
        <label>
          عدد المقاعد
          <input
            name="maxPlayers"
            type="number"
            min="2"
            max="100"
            required
            defaultValue={match?.maxPlayers || 12}
          />
        </label>
        <label>
          التكلفة الإجمالية
          <input
            name="totalCost"
            type="number"
            min="0"
            max="100000"
            step="0.01"
            required
            defaultValue={match?.totalCost ?? 100}
          />
        </label>
      </div>
      <label>
        العملة
        <input
          name="currency"
          required
          maxLength={8}
          defaultValue={match?.currency || "RM"}
        />
      </label>
      <label>
        موقع الملعب (Google Maps)
        <input
          name="location"
          type="url"
          dir="ltr"
          defaultValue={match?.location || ""}
        />
      </label>
      <button disabled={busy}>حفظ المباراة</button>
    </form>
  );
}
