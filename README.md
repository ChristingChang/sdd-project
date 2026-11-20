# 浪乘 Surfpool

**Carpooling for surfers driving from Taipei to Yilan.** A mobile web app where drivers post trips with structured fields, passengers filter and request a seat, and both sides get LINE push notifications.

> 給台北到宜蘭衝浪的人用的共乘平台：司機用固定欄位發行程，乘客篩選、申請，雙方透過 LINE 推播即時知道結果。介面全中文。

---

## The problem

Today, northern Taiwan surfers find rides in a Facebook group: free-form posts plus DMs. I tracked **103 real posts (2026-08-30 to 11-05)** to set a baseline:

- **67%** of driver posts don't say whether there's room for a surfboard; **45%** don't say how many seats.
- Median time from post to departure is **18.7 hours**, and **52%** of trips are on weekends. Most trips get posted the day before and leave at dawn, so a slow reply means a missed ride.
- Posts get buried and can't be filtered.

The raw tracking sheet contains real names, so it stays outside this repo.

## What 浪乘 does

- **Drivers** post a trip with required fields: date, surf spot, pickup points, seats, board limits, cost share. A second trip pre-fills from the last one.
- **Passengers** browse trips (no login needed), filter by date, and request a seat. Requests that don't fit the board limit are blocked before they're sent.
- **Drivers** accept or decline; both sides get a **LINE push** at each step.
- **Contact info stays private** until a request is accepted. Drivers can add an exact meetup point (e.g. "Exit 3, in front of FamilyMart, white RAV4") that only accepted passengers see.
- Drivers can copy a ready-made post to share the trip link back into the FB group or LINE.

Success metric: **completed trips per week** (`npm run stats`), counting trips that departed, weren't cancelled, and had at least one accepted passenger.

## Status

| | |
|---|---|
| MVP | Built and merged ([#1](../../issues/1) spec → [#2](../../pull/2)). LINE login + LINE push verified end-to-end with real accounts locally |
| Merged PRs | 7 ([#2](../../pull/2)–[#7](../../pull/7), [#9](../../pull/9)) |
| Automated UAT | Headless browser, real clicks, 53 cases: **49 pass, 4 partial, 0 fail**. The 4 partials need a real phone to check the LINE push. [Report with screenshots](docs/uat/report-2026-11-19-run-A.md) |
| Deployed | **Not yet.** No public HTTPS host yet |
| Validated with users | **Not yet.** Whether people will leave the FB group, and the real match rate, still need launch data or interviews |

## What's next

- [#10](../../issues/10) **Before opening to strangers:** privacy page, terms of use, support / delete-account contact, and a reminder to add the LINE official account (without it, push notifications silently fail).
- [#8](../../issues/8) **Less friction for drivers:** pre-fill, precise meetup points and copy-to-FB post are built and merged. The LINE share flow still needs a run on a real phone before the issue closes.
- Real-LINE test runs (B/C in [`docs/uat-cases.md`](docs/uat-cases.md)): push notifications, login, and sharing on an actual phone.
- Deploy to HTTPS and get the first real trips running before the winter swell.

Launch-readiness plan: [`docs/launch-readiness-plan.md`](docs/launch-readiness-plan.md) · Full UAT case list: [`docs/uat-cases.md`](docs/uat-cases.md)

## Tech

- **Zero third-party packages.** Node 22 built-ins only: `node:http`, `node:sqlite`, `node:test`. The frontend is plain HTML/CSS/JS in `public/` with no build step. Clone and run, nothing to install, nothing to `npm audit`. Trade-offs are in [ADR 0001](docs/adr/0001-zero-dependency-node.md).
- Single SQLite file; seat booking stays consistent because writes run synchronously in one process.
- LINE Login for sign-in, LINE Messaging API for push.

```
src/      server, routes, service logic, LINE client, stats
public/   mobile web frontend
test/     node:test suites
scripts/uat/  automated UAT runner (headless Edge/Chrome via DevTools Protocol)
docs/     specs, user stories, UAT cases and reports, ADRs
```

## Run it locally

Requires Node.js **22.5+**.

```bash
cp .env.example .env    # DEV_LOGIN=1 lets you log in without LINE credentials
npm start               # http://localhost:3001
npm test
```

With `DEV_LOGIN=1`, push messages are printed to the terminal instead of sent. To connect real LINE channels, see [`docs/line-setup.md`](docs/line-setup.md). **Never enable `DEV_LOGIN` in production.**

---

## Built with

This repo started from the `agent-skills-starter` template from an SDD (spec-driven development) class: shared Claude Code / Codex skills in `.claude/skills/`, agent guard hooks in `.claude/hooks/`, and Git hooks in `.githooks/`. To turn on the Git hooks after cloning:

```bash
git config core.hooksPath .githooks
```

The skills are derived from [luca-skills](https://github.com/Luca0x5755/luca-skills) (MIT), as modified by [SDD-agent-coding-beginner](https://github.com/Zenobia000/SDD-agent-coding-beginner). See [`THIRD-PARTY-NOTICES.md`](./THIRD-PARTY-NOTICES.md) and [`LICENSE`](./LICENSE).
