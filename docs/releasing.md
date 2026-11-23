# Releasing PopBar

Everything here runs from a working copy on the build Mac. `scripts/`, `package.json`,
`.signing/` and `.build/` are **not** in the public repository, so these steps live
here rather than in `README.md`.

The rule that shapes the whole pipeline: **a release is never published until the
artifacts have been proven.** A dmg, a zip and `latest-mac.yml` that disagree, or a
build that silently fell back to an ad-hoc signature, is exactly the failure this
pipeline exists to prevent.

## 1. Prerequisites (once per machine)

```sh
bash scripts/signing-setup.sh     # imports "PopBar Signing" and trusts it for code signing
node scripts/sign-mac.js --check  # proves the identity is present and trusted
```

`--check` exits non-zero if the identity is missing or untrusted, or if
`security find-identity` does not report it as valid. There is no silent fallback:
a build that cannot find the certificate fails. `POPBAR_ALLOW_ADHOC=1` is the only
override, and it exists for throwing away builds, not for releases — an ad-hoc build
loses the Accessibility grant on the next update.

Overridable knobs, if a machine needs them:

| Variable | Default | Meaning |
| --- | --- | --- |
| `POPBAR_SIGN_IDENTITY` | `PopBar Signing` | certificate common name |
| `POPBAR_SIGN_KEYCHAIN` | `~/Library/Keychains/popbar-signing.keychain-db` | keychain holding it |
| `POPBAR_SIGN_KEYCHAIN_SECRET` | — | only if that keychain has its own password |

Builds pass `--keychain` to every `codesign` call and remove that keychain from the
user's search list afterwards, so nothing prompts for a password mid-build.

The release signature key lives at `.signing/release-key` (ed25519, mode `0600`) and
its public half is committed as `docs/release-key.pub`. Losing the private key does
not invalidate past releases, but nobody can check a *new* `SHA256SUMS` against the
published key until a new one is published (see *Rotation*).

## 2. Build

```sh
npm version patch        # bump package.json + lockfile first: installers take the version from it
npm run dist:mac        # universal app, signed, dmg + zip + latest-mac.yml in .build/
npm run dist:win        # Windows installer, if this release has one
```

`dist:mac` checks the identity, builds universal, writes `latest-mac.yml` from the
**signed** app, signs the app bundle *and* the `popbar-ax` helper, then packages.
The two-step signing is deliberate: the outer bundle carries
`designated => identifier "com.popbar.app"`, while nested code keeps its own
requirement, so the Accessibility grant is remembered against the bundle id and not
against a code hash that changes on every build.

## 3. Verify and publish

```sh
node scripts/release.js                    # verify only — publishes nothing
node scripts/release.js --publish          # draft upload, size check, then publish
node scripts/release.js --publish --beta   # same, marked as a prerelease
```

The verifier mounts the dmg and unpacks the zip, and for each of them checks:

- `codesign --verify --deep --strict` passes,
- the recorded requirement is exactly `identifier "com.popbar.app"` — no certificate
  hash and no cdhash,
- the signature authority is the release certificate (not ad-hoc),
- the `popbar-ax` helper is present and certificate-signed with
  `identifier "com.popbar.app.ax"`,
- the app and the helper are both universal,
- the certificate is not near expiry.

Then it writes `SHA256SUMS` (dmg, zip, exe, `latest.yml`, `latest-mac.yml`), signs
it with `.signing/release-key`, uploads to a **draft** release, compares the remote
asset sizes with the local files, and only then publishes the draft. An already
published tag is refused — a new version gets a new tag, never replaced assets.
A Windows feed left in `.build` by an earlier version is skipped instead of
uploaded, so a macOS-only release cannot advertise an installer it does not
contain.

Useful flags: `--version <x>` (default: `package.json`) and `--notes <file>`
(default: `.build/notes-<version>.md`).

## 4. What a user checks

```sh
shasum -a 256 -c SHA256SUMS                          # expected: every line "OK"
ssh-keygen -Y verify -f docs/release-key.pub -I release@popbar \
  -n popbar-release -s SHA256SUMS.sig < SHA256SUMS    # expected: Good "popbar-release" signature
```

`SHA256SUMS.sig` failing while `shasum` passes means the checksum file itself was
replaced — treat that release as compromised. The same two commands are the
integrity statement in the release notes.

## 5. Beta and rollback

- **Beta:** `node scripts/release.js --publish --beta` uploads the same verified
  artifacts as a prerelease. The `latest-mac.yml` feed is *not* what beta users read,
  so a beta does not move anyone on stable.
- **Broken release:** edit the release body to say so and mark it as a prerelease
  (or delete the release, keeping the tag). Then ship a fixed patch version. Do not
  re-upload assets over a published tag: auto-updaters may already have the file, and
  a replaced asset with the same name is indistinguishable from tampering.
- **Bad certificate / lost grant:** bump the patch version and rebuild — the
  identifier-only requirement means the grant should survive; if it does not, users
  re-grant once (the app logs `trust missing` and shows the notice).

## 6. Notarization (prepared, not enabled)

Notarization needs an Apple Developer ID ($99/year) and an app-specific password or
API key. The pipeline is ready for it, but **nothing here can run without those
credentials**, so gatekeeper still warns on first launch.

When the credentials exist:

1. Export a *Developer ID Application* certificate and import it as a second
   identity; keep `POPBAR_SIGN_IDENTITY` pointing at it rather than at the
   self-signed certificate. The identifier-only requirement stays exactly the same.
2. Add `--options runtime` (hardened runtime) to the `codesign` calls in
   `scripts/sign-mac.js`; `package.json`'s `build.hardenedRuntime` must match.
   Test the helper first: hardened runtime can block the Accessibility API it uses.
3. Notarize and staple before packaging:

   ```sh
   xcrun notarytool submit PopBar.app.zip --keychain-profile popbar-notary --wait
   xcrun stapler staple .build/mac-universal/PopBar.app
   ```

   Stapling must happen **before** `electron-builder` packs the dmg/zip, otherwise the
   ticket is not inside the artifacts.
4. Add the notarization step to `scripts/release.js` and check
   `spctl -a -vvv -t install` on the mounted dmg. Until then the verifier does not
   claim the build is notarized.

## 7. Windows signing (needs a certificate this project does not have)

The `.exe` is unsigned, so SmartScreen warns. Signing needs an OV/EV code-signing
certificate (an EV one is a hardware token or a cloud HSM service — it cannot live in
this repository), then:

```powershell
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /a "PopBar-Setup-<version>.exe"
```

Sign the installer *after* `electron-builder` produces it and *before*
`node scripts/release.js --publish`; the verifier already refuses to publish a
mismatched set, and the version inside the installer must match `latest.yml`.
`docs/windows-smoke.md` is the manual test list that still has to be run on a real
Windows machine.

## 8. Identity backup and rotation

**Back up once, offline.** Both items are needed to reproduce the identifier-only
requirement on another machine:

```sh
security export -k "$HOME/Library/Keychains/popbar-signing.keychain-db" \
  -t identities -f pkcs12 -o ~/Desktop/popbar-signing.p12   # password-protected
cp .signing/release-key ~/Desktop/popbar-release-key        # chmod 600, never in git
```

Store both in a password manager or encrypted volume. `docs/release-key.pub` is
public; the private key is not, and `.signing/` is gitignored.

Keychain access control: the identity lives in its own keychain so that
`codesign` can use it with `--keychain` and nothing else on the machine can reach it
by default. If macOS starts prompting for the keychain password during builds, the
ACL was reset — fix it once with:

```sh
security set-key-partition-list -S apple-tool:,apple: -s -k \
  "$(security find-generic-password -s popbar-signing-keychain -w)" \
  "$HOME/Library/Keychains/popbar-signing.keychain-db"
```

(Run `bash scripts/signing-setup.sh` instead when that secret is not recorded.)

**Rotating the certificate** (expiry 2036-11-15, or a compromised machine): create a
new self-signed certificate with the same common name, re-run
`signing-setup.sh`, then `node scripts/sign-mac.js --check`. Because the requirement
is `identifier "com.popbar.app"`, a new certificate does **not** cost users their
Accessibility grant — that is the whole point of the identifier-only rule. Verify
with `codesign -d -r- .build/mac-universal/PopBar.app` and a fresh dmg before
publishing.

**Rotating the release key:** generate a new ed25519 key, replace
`.signing/release-key`, `ssh-keygen -y -f .signing/release-key` into
`docs/release-key.pub`, and commit that. Past releases keep verifying against the old
public key only if it stays published — so keep the previous `.pub` line under a new
principal (for example `release-2026@popbar …`) instead of deleting it, and say in
the release notes that the key changed.

## 9. What is still unproven

These are known gaps, not things the pipeline checks:

- **Update with an untrusted certificate.** The requirement comparison is no
  longer Squirrel's to make: PopBar swaps the bundle itself (Squirrel.Mac refused
  the self-signed download, which is why `update-mac.js` exists), so
  `src/main/update-signature.js` now does what Squirrel did — read the *running*
  app's designated requirement (`codesign -d -r-`) and refuse a download that does
  not satisfy it (`codesign --verify --strict -R=<requirement>`), before the swap
  is scheduled. It is a requirement check, not a trust check: the certificate is
  self-signed, so evaluating a trust anchor would refuse every update. `npm test`
  builds that case with real bundles and proves both halves — a download that
  fails the running app's requirement is refused with a message pointing at the
  download page, and a differently-built later version that satisfies an
  identifier-only requirement is accepted. What is still unproven is the macOS
  side: whether the Accessibility grant survives the replacement on a machine that
  never trusted the certificate, which needs the clean-Mac run in the test
  document. If it does not, updates need the Developer ID from §6.
- **Migration from pre-fix builds.** Proven locally: an ad-hoc signature gets no
  identifier in its requirement at all. Signing a copy of `/bin/echo` with
  `codesign -s - -i com.popbar.app.ax` records

  ```
  # designated => cdhash H"134a31e8…" or cdhash H"1fffb95e…" or cdhash H"d66dfbd6…"
  ```

  A cdhash never matches a different build, so installs built before the
  identifier-only change cannot auto-update to the first certificate-signed
  release: the update path compares the download against those hashes and refuses
  it (`npm test` re-checks both halves — no identifier clause in the ad-hoc
  requirement, and a different build with the same identifier failing it). Those
  users need **one manual download** of the first identifier-only release. From
  that build onwards the requirement is `identifier "com.popbar.app"` and later
  updates pass. Say so in the release notes for that version rather than letting
  them sit on a stale build that keeps reporting a failed update.
- **Which process owns the Accessibility grant.** `popbar-ax` is the process that
  calls `AXIsProcessTrusted`, so the grant may be attributed to the helper rather
  than the app. The helper is now certificate-signed with its own identifier-only
  requirement, which should make it stable either way, but only a clean-Mac test
  proves it (reading `TCC.db` needs Full Disk Access).
- **CI.** The build is not automated: `scripts/`, `package.json` and the certificate
  are not in the public repository, so a runner cannot build what it cannot see.
  Automating this needs a private build repository (or publishing the scripts) plus
  the certificate and `.signing/release-key` as secrets.
