# Branch verification — 19 October 2026

Repository: https://github.com/abobakr777/stadium-booking

Branch: `security-upgrade`, based on `main` at
`4ac67d119e3bbaa9b68ca7fd06c4dcf3ee14d70f`.

Executed against this clone after integration:

- `node --test tests/unit.test.mjs`: **3 passed, 0 failed**.
- Firebase `emulators:exec --project demo-stadium-booking --only auth,firestore,storage,functions` running `tests/security.test.mjs`: **14 passed, 0 failed, 0 skipped**, exit 0. Emulators shut down afterward. See `security.txt` for the extracted test results; operational logs and local Auth action links are not committed.
- `vite build --configLoader native`: **passed**, with a non-blocking large-bundle warning. See `build.txt`.
- 26 application/backend/test/configuration files compared byte-for-byte with the previously generated project: **no differences**.
- `git fsck --full`: passed. Clone is not shallow; all 13 original commits retained.
- Ignore checks confirm real `.env` files, service-account credentials, private keys, dependencies and build output are excluded. The sanitized demo configuration example is `config/firebase.local.example`.
- Targeted scan of staged current contents: no private-key blocks, service-account key fields, GitHub/AWS/Slack token patterns, embedded URL credentials or hardcoded administrative literals. Synthetic emulator test passwords are not production credentials.

Runtime used: Node 24.19.0, Java 25.0.2. Production functions target Node 22 and require runtime verification before deployment. Browser core flows were verified during the earlier local milestone, not rerun during this Git-only integration.

See `../SECURITY-HISTORY.md` for exposed administrative literals in the preserved public history. New source removal does not revoke historical values or secure the unchanged live legacy deployment.

No deployment workflow was added. GitHub Pages settings, Firebase and remote branches were not modified. No push has been performed.
