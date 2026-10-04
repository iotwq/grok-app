# First-run setup gate

Product rules for the **full-screen initialization wizard** before the workbench home.

## Goals and runtime gate

Desktop packages include their own pinned Grok Build runtime. See
[bundled-runtime.md](./bundled-runtime.md) for packaging, update and license rules.

```
boot → probe bundled runtime (≤3s --version)
  ├─ missing/unrunnable → recovery step: download/reinstall App or retry
  ├─ ready + !setupWizardCompleted → Account step (skippable)
  └─ ready + setupWizardCompleted → home
```

No external binary picker, PATH scan, WSL CLI selection or separate CLI installer.
An old `manualCliPath` setting cannot override the bundled binary. Account remains
optional; the runtime readiness gate cannot be skipped.

### Step 2 — Account (skippable)

OAuth, official key, relay, import CLI / grok-go. No `window.prompt`.

Relay setup requires an explicit upstream model ID (the same field as Settings
→ Account → Custom providers). Never synthesize `default`. Saving replaces the
wizard relay's model catalog with that chosen ID. Existing installs created by
the old wizard can correct `relay` in Custom providers; do not guess a migration
model or overwrite a service that genuinely offers a model named `default`.

Saving a relay first runs the existing per-model inference probe using the
selected protocol. Only a successful probe followed by a successful config
write marks the account ready. Rejected credentials, unavailable models and
network errors keep the editable form and do not activate the failed draft;
the account step can still be explicitly skipped. A catalog ping is not an
authentication or inference success check.

### Step 3 — Ready → Enter

Persists `setupWizardCompleted: true`. If account skipped: `authSetupDeferred: true`.

## Settings fields

| Field | Role |
|-------|------|
| `setupWizardCompleted` | Wizard finished with CLI ready |
| `authSetupDeferred` | User skipped account step |
| `onboardingDone` / `setupSkipped` | Legacy; migrated when CLI present |

## UI

- Component: `src/components/SetupWizard.tsx`
- Styles: `src/styles/setup-wizard.css` (overflow hidden, no scrollbars)
- i18n: `setup.*` keys in `src/i18n/messages.ts`

## Honesty (SETUP-GATE-PRO)

Pure helpers: `src/lib/setupGatePro.ts` (+ tests).

| Rule | Behavior |
|------|----------|
| Hard CLI | `canEnterHome` / boot `resolveSetupGateBoot` never mark **ready** without `cliFound` |
| Soft account | Account step is always skippable; `buildAuthDeferredFlags` never sets deferred when auth is ok |
| Errors | Install/probe/account failures classified (`checksum_missing`, `mirror`, `network`, …) with stable `setup.error.*` titles + recovery hints |
| Ready checklist | Never soft-ok CLI; auth row is soft when skipped |
| Legacy migrate | Older `onboardingDone` / `setupSkipped` + CLI → write `setupWizardCompleted` once |

## Runtime probing and recovery

`probe_cli` resolves only the bundled executable; `--version` must succeed within
the existing timeout. A missing or failed executable cannot fall back to a terminal
installation. Packaging verifies the pinned artifact SHA-256 before it is included.

Legacy install/update/picker/sidecar-repair commands are disabled in the backend.
Recovery offers reinstalling Grok App and retrying the probe, not CLI installation.

## Managed configuration (enterprise, optional)

Settings → Runtime → **Managed setup** (`ManagedSetupPanel`):

1. **CLI ready** (hard dependency; same as first-run Runtime).
2. **Team login / `GROK_DEPLOYMENT_KEY`** (or `[endpoints].deployment_key`).
3. **Preview** — `grok setup --json` (writes nothing; secrets redacted).
4. **Install** — `grok setup` with in-app confirm (no `window.confirm`); soft-respawns agent.
5. **Verify local status** — host `managed_setup_status` soft-probes:
   - `managed_config.toml` / `requirements.toml` / `managed_config.sig.json` / `managed_identity.sig.json` under active `GROK_HOME`
   - system `/etc/grok/managed_config.toml` when present (Unix)
   - `grok inspect` flags `managedSettingsActive` / `Exists` / `Path` when CLI works
   - **explicit** inspect/doctor signature verification fields when present (`signatureVerified` etc.) → `signatureVerified` + `signatureVerifySource`; otherwise `presenceOnly: true`

Signature UI status (pure `deriveSignatureStatus` / `buildSignatureView`):

| Status | Meaning |
|--------|---------|
| `absent` | No managed artifacts |
| `present_unverified` | Files / inspect flags present; App did **not** crypto-verify |
| `verify_ok` | **Only** when host/CLI/doctor explicitly reported verification success |
| `verify_failed` | CLI rejected signature / envelope, or host reported verified=false |
| `soft_fail` | Probe/inspect unavailable or status unknown |

The App **does not re-verify cryptographic signatures**; path presence and `managedSettingsActive` never invent `verify_ok`. CLI rejects bad signatures before writing. Soft-fail when CLI/inspect is missing.

## OS install caveats (before the wizard)

The setup gate assumes the **desktop package already launches**. OS blocks and update-channel honesty are documented for users in the README — do not invent signature / SmartScreen status in the wizard:

| Topic | Source of truth |
|-------|-----------------|
| macOS Gatekeeper / “damaged” / `xattr -cr` | README → *macOS “damaged” / Gatekeeper* (中文：*macOS 无法打开 / 提示已损坏*) |
| Windows SmartScreen (unsigned / unknown publisher) | README → *Install* → Windows SmartScreen |
| In-app auto-update needs **signed** production builds | [desktop-auto-update.md](../desktop-auto-update.md); unsigned / dev stay on GitHub manual download |

Doctor / Windows day-use checklist may surface related rows but **must not invent** notarization or SmartScreen state.

## Non-goals

- Forcing project selection before home.
- App-side re-implementation of managed-config crypto verification.
- Claiming silent auto-update for unsigned / local builds (see [desktop-auto-update.md](../desktop-auto-update.md)).

### CLI execution readiness

Executable permission alone is insufficient. The bundled executable must spawn and finish successfully within the timeout.
A successful `--version` without a banner remains compatible. If it fails, Setup
stays in the App recovery step.
