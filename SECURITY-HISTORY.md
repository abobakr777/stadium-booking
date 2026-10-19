# Public history review

Reviewed all 13 commits reachable through the branches/tags fetched from
`https://github.com/abobakr777/stadium-booking.git` on 19 October 2026.
The clone is complete (not shallow). Base `main`:
`4ac67d119e3bbaa9b68ca7fd06c4dcf3ee14d70f`.

## Findings (values deliberately omitted)

- **Exposed administrative master key:** a nonempty hardcoded `MASTER_KEY`
  appears in `index.html` in all 13 commits, including current `main` at line 107.
- **Exposed default administrator password:** the initial commit
  `0fe435fd9e04e7a0507e45412c1e81bc703df501` also contains a nonempty literal
  `adminPassword` at line 130.
- The legacy implementation writes match administrator passwords to Firestore
  and compares them in browser JavaScript. This review does not inspect those
  database records and cannot establish whether live passwords are present.
- Firebase Web configuration is published in the old HTML. A Firebase Web API
  key is a public client identifier, not an administrative credential or a
  replacement for authorization. Actual cloud API restrictions and database
  rules have not been reviewed in the live console.
- No private-key blocks, service-account private-key fields, GitHub/AWS/Slack
  token patterns, or sensitive credential filenames were found by the targeted
  scan of fetched history. This is not a guarantee that every possible secret
  format is absent.

## Handling

Treat the published administrative literals as compromised. Retire their use
and rotate any password reused elsewhere. Deleting them from the new source
does not erase public Git history, existing clones, forks, caches, or the
currently deployed legacy application.

The new source uses verified Firebase Auth identities and trusted custom claims;
it does not contain or accept these legacy credentials. No history rewrite,
force push, live credential change, GitHub Pages update, or Firebase deployment
has been performed. Historical commits are intentionally preserved as requested.
Any live remediation or separate history-removal operation needs explicit scope
and approval; a branch-only change does not secure the existing deployment.

The scan covers reachable source snapshots, not unreachable/deleted objects,
GitHub issues, Actions logs/artifacts, forks, deployed databases, or cloud secret
stores. Test fixture passwords in the emulator tests are synthetic, local-only
values; the test clients target `demo-stadium-booking`.
