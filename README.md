# Mainsail + KAPAT

This is a personal fork of [Mainsail](https://github.com/mainsail-crew/mainsail)
(based on v2.18.2), with a native **KAPAT** tab added to the sidebar for
running and reviewing [KAPAT](https://github.com/vzagranichnyy/KAPAT)
pressure-advance calibration sweeps directly from the printer's web UI.

Not affiliated with the mainsail-crew project. All credit for the base
UI goes to them — see [LICENSE](LICENSE) (AGPL-3.0, unchanged) and their
own docs at [docs.mainsail.xyz](https://docs.mainsail.xyz).

## What's added on top of stock Mainsail

- A **КАРАТ / KAPAT** sidebar entry (route `/kapat-tab`): sweep form,
  filament profile picker (with a saved calibration X/Y/Z position),
  a history table of past sweeps, and an expert-mode analysis view
  (raw segment browser, per-metric K trend grid, fitted-line results).
- Talks to the same Klipper webhook backend as the standalone KAPAT
  web UI — both are just front-ends over the [KAPAT Klipper
  extra](https://github.com/vzagranichnyy/KAPAT).
- A fix to the shared `NumberInput.vue` component: typed values used to
  be silently reverted on blur unless Enter was pressed. Fixed via an
  opt-in `commit-on-blur` prop, used only by KAPAT's own inputs — every
  other call site keeps its original behavior.

## Install

This is a custom fork, so the usual Mainsail installers (KIAUH,
mainsail-crew's release zip) won't pull it in — build and deploy it
manually.

**1. Klipper backend** (needed for the KAPAT tab to actually do
anything — without it the tab loads but every request fails):

```bash
git clone https://github.com/vzagranichnyy/KAPAT.git
cd KAPAT
./install.sh
```

Then add a `[kapat]` section to `printer.cfg` (see
`docs/printer.cfg.example` in that repo) and restart Klipper.

**2. This UI:**

Requires Node `^20.19.0` or `>=22.12.0` — check `node --version` first;
most Klipper hosts ship an older system Node, in which case install a
separate matching Node build rather than relying on the system one.

```bash
git clone https://github.com/vzagranichnyy/Mainsail-Kapat.git
cd Mainsail-Kapat
npm install
npm run build
rsync -a --delete dist/ ~/mainsail/
```

`npm run build`'s own `build.zip` sub-step packages `dist/` into
`mainsail.zip` and will fail harmlessly with `zip: not found` on hosts
without the `zip` binary installed — safe to ignore, since the rsync
step above deploys the raw `dist/` folder directly, never the zip.

`~/mainsail/` should match whatever directory your nginx config serves
Mainsail from (`root` in the relevant `location` block) — if a stock
Mainsail was previously installed via KIAUH, that's already the path
in use, so no nginx changes are needed; this just replaces its
contents.

## Development

```bash
npm install
npm run serve
```

See [agent_docs/ARCHITECTURE.md](agent_docs/ARCHITECTURE.md) and the
other files under [agent_docs/](agent_docs/) for a tour of the
codebase conventions this fork still follows from upstream.
