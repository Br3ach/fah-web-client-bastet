Folding@home Bastet Web Control
===============================

This is the frontend Web app for the Folding@home v8 client, codenamed Bastet.
See Also: https://github.com/FoldingAtHome/fah-client-bastet

# Debian Linux Quick Start

## Get the code

    git clone https://github.com/foldingathome/fah-web-client-bastet

## Start the development web server

    cd fah-web-client-bastet
    npm install
    npm run dev

## Open the Browser

With the development server running visit http://localhost:5173/

## v6 CPU and GPU settings

Use this interface with a client that advertises the v6 capabilities. Controls
follow the connected client's metadata; the frontend does not allocate CPUs or
apply OS affinity itself.

General mode selects a worker count. General-only groups without active exclusive
GPU reservations may save counts whose combined total exceeds machine capacity.
On supported homogeneous CPUs, managed allocation can reduce running workers
without changing those saved counts. Hybrid General-only configurations retain
OS scheduling unless performance-class demand or exclusive reservations require
managed allocation.

Performance-class settings retain the selected levels during runtime shortages.
Workers may be reduced or wait; they do not move to another level. The UI shows
prospective capacity warnings while preserving unchanged saved intent after
topology loss. Class-mode and exclusive-reservation configurations retain aggregate
validation and slider limits. Process affinity restricts the FahCore process;
it does not pin individual workers.

GPU reservations apply per enabled, supported GPU in an eligible resource group,
even while that GPU is waiting for work. Paused or otherwise ineligible groups
release runtime demand while preserving saved settings. Each GPU receives separate whole physical cores,
including their SMT siblings. These reservations exclude CPU folding from those
cores; they do not reserve the cores against other applications or OS tasks.
Zero uses shared helper resources. Saved reservations remain removable when GPUs
are undetected. Helper accounting does not consume the CPU-folding worker budget.

GPU folding CPU priority is configured per resource group when supported:

- Windows offers Idle through High, excluding Realtime. Edits apply live during
  core monitoring, including startup.
- Linux offers SCHED_OTHER Low (nice 10) and Normal (nice 0); edits take effect on
  the next core launch. Actual behavior depends on the core and account permissions.
- No override preserves the usual launch behavior. Saved overrides remain removable
  when GPUs are undetected.

Affinity, GPU priority and launch-environment failures appear in WU status tooltips
and details. The details view labels priority as requested; it is not a measurement
of actual OS priority. Full-SMT advisories appear as help icons beside CPU counts.
They suggest comparing performance, not assuming that more workers are faster.

## Saving and reconnecting

Save confirms normalized configuration against client readback, with capped
backoff for up to 30 seconds. Confirmation retains the capabilities used for the
submitted payload while continuing to refresh GPU discovery. A timeout means
confirmation did not arrive; check current settings before retrying, since the
client may already have saved them.

Save keeps Settings open. Route-leave Save continues to the requested destination
only after success; Cancel returns to the previous page. Unsaved drafts survive
disconnects but must be reloaded before saving after reconnect. Machine rename and
configuration are separate writes, so one can succeed while the other fails.

## Development and tests

CI uses Node 20. Use Node 20.19 or newer within that release line for the Vite 7
build/test toolchain. This does not change browser runtime requirements. The
`npm test` directory entry point is intended for Node 20; newer Node versions can
require explicit test filenames.

```sh
npm install
npm test
npx playwright install chromium
npm run test:layout
npm run build
```

The unit suite covers prospective policy, runtime display, normalization, save
confirmation, reconnect and protocol behavior. Chromium tests render production
SettingsView, GroupSettings and UnitDetailsView components. They check CPU/GPU
controls at mobile widths and narrow desktop panels, help-balloon cleanup using
real scroll utilities, and warning text, removal and requested-priority labeling
using the production Unit adapter. External font requests are blocked.

Fixtures use synthetic machine data and stub transport/services. They do not prove
live remote-client behavior or native affinity; those checks belong to the client
repository's tests and hardware testing.

`src/CPUPolicy.js` validates prospective settings and calculates draft limits.
`src/CPUStatus.js` interprets authoritative runtime allocations and SMT advisories.
`src/SettingsNormalization.js` shares normalization between editing, saving and
confirmation. `src/unit.js` supplies the common WU warning list. Reuse these helpers;
keep runtime ownership out of draft-policy calculations.

The generated local lockfile is ignored by Git, following upstream practice.
CI caches npm downloads rather than an installed module tree.

The `cpu-affinity-v8-tests` branch contains the v8 implementation and its full regression suites. The production `cpu-affinity-v8` branch keeps upstream tests and build CI only.
