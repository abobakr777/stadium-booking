# Stadium Booking

Security milestone first; stop at its verification checkpoint. Do not deploy without explicit permission. Preserve the original Arabic RTL sports identity and feature inventory in TASKS.md.

Vite/React client uses Firebase Auth. All mutations pass through callable Cloud Functions; Firestore denies every client write. Backend validates exact input schemas, verified email ownership/custom claims and transaction invariants. Never infer authority from local storage, display names, client flags or request-supplied owner IDs. Admin SDK bypasses rules: every handler needs independent authorization.

Public match metadata is separate from private payment records. Proof images are decoded/re-encoded by the backend and saved without download tokens. No service account keys or hardcoded admin secrets. Use demo-stadium-booking for local emulators; never test against production. Keep timestamps UTC and display local timezone explicitly.

Run production build, unit tests, actual Auth/Firestore/Storage/Functions emulator integration tests before claiming acceptance. Track failures honestly. Retain lockfile. Backend changes require authorization/integrity regression coverage. Never use permissive temporary rules.
