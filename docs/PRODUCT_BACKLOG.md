# StewardBuddy — Steward Operations Product Backlog
**Review date:** October 11, 2026  
**Source:** `margaritauk/steward` — inspected the production-oriented `web/`, `src/`, and `test/` source (not a logged-in production walkthrough).  
**Personas:** Executive steward/manager, AM/PM supervisors, banquet/utility stewards, night-cleaning team.  
**North star:** A steward starts a shift, immediately sees what to do, completes or escalates it in seconds, and the manager knows what is covered and what needs help without chasing people.

## Already in the codebase
- Individual supervisor/steward accounts and role-scoped data.
- Single BEO PDF import (up to 40 pages) with browser-side text extraction/OCR and manual review.
- Event, guest count, room, team assignment, rule-driven equipment requirements, and revisions.
- Shared live progress, equipment quantities, one required completion photo, audit history, and in-app updates.
- Day picker, event list, search, status select, by-steward cards, and mobile layout.
- **This branch adds:** clickable dashboard status counters, matching event filters (including In progress), selected styles, and shared status tests.

## Gaps observed from source
The primary workflow is **banquet setups**, not full departmental stewardship. There is no recurring area checklist, shift roster or call-off coverage, regular supply count, equipment checkout/return ledger, delivery receiving, handoff log, maintenance ticket queue, or offline queue. Setup deadline is fixed at one hour before event start. Team cards are informational rather than assignable workload planning. Alerts are in-app, not push notifications.

## Priority definitions
- **P0:** Start here — directly reduces daily managerial calls, walking, repeat typing or missed work.
- **P1:** Next release — operational planning and accountability after core shift execution works.
- **P2:** Optimize — forecasting, systems integration and analytics, after reliable operational data exists.
- **Effort:** S = small UI/state change; M = new workflow and persistence; L = cross-workflow engine or integration. Effort is relative, not a calendar estimate.

## P0 — Essential shift workflow
| ID | Feature / role | Effort | Acceptance criteria |
| --- | --- | --- | --- |
| SB-001 | **Dashboard tiles filter events** · All | S | Tapping Events today/all, In progress, Setup complete, or Overdue displays matching event list for selected date; moves out of By steward; search resets; filter dropdown and pressed state sync; completed events aren't overdue; unit coverage for overlap and photo-required. **Implemented on this branch; review before deployment.** |
| SB-002 | **Action-first overview / urgent queue** · Manager | M | Show unassigned events, due in 2h, late setups, unresolved blockers and today's staffing gaps; sort by setup deadline; clicking any count goes to exactly those records; distinguish 0 truly outstanding from 0 due today. |
| SB-003 | **My Shift page** · Steward | M | Personal ordered list of assigned banquet setups plus routine tasks by deadline/area; one-tap Start, Complete, Can't complete; always show location, supplies, supervisor notes and what's next; hide unrelated event details. |
| SB-004 | **Daily AM/PM supervisor checklist templates** · Supervisor | M | Repeatable tasks by area and shift (Main Kitchen, Lockwood, café, Potter's, yard, banquet storage); include dispensers/soap/napkin rolls, BEO review, deliveries, sidework, station stock and closing; each has assignee, due time, timestamp, notes and exception reason. |
| SB-005 | **One-tap blocker / Need help / Missing supply** · Steward | M | On a task or BEO, report missing equipment, shortage, broken item, access problem or staffing help with optional photo; supervisor receives a queue alert; assigned owner/resolution tracked; blocked doesn't count as complete. |
| SB-006 | **AM-to-PM handoff** · Supervisors | M | Carry forward incomplete tasks, supply shortages, equipment not returned, maintenance issues, call-offs and upcoming critical BEOs; outgoing submits; incoming acknowledges; nothing disappears between shifts. |
| SB-007 | **Steward workload drill-down** · Supervisor | S | Tap a steward card to show just that person's tasks/events and blockers; add date/AM-PM filter, totals and unassigned view; click a task to reassign. Avoid showing a steward as "available" merely because they have no banquet event. |
| SB-008 | **Task ownership & shift signoff** · All | M | Claim/assign/reassign a task, record who completed it and when; supervisor can reject/reopen with reason; maintain history; required signoff for critical daily safety tasks. |
| SB-009 | **Configurable deadlines and task reminders** · Supervisor | S-M | Per task/event set lead time, e.g. 60 minutes by default for setup but 30/90 for approved exceptions; distinguish event start from ready-by; reminders at configurable thresholds; no silent missed deadlines. |

## P1 — Staffing, inventory, quality and mobility
| ID | Feature / role | Effort | Acceptance criteria |
| --- | --- | --- | --- |
| SB-010 | **Roster & staffing coverage board** · Manager | L | Import weekly schedule/CSV; show planned vs present by AM/PM/overnight/banquet and area. Configurable targets rather than hardcoding one hotel's pattern; record RO, LOA, call-offs and late arrivals. |
| SB-011 | **Coverage suggestions with OT/seniority guardrails** · Manager | L | Identify unfilled positions; suggest eligible team members by role, qualifications, posted days off, hours toward 40 and seniority rules; flag OT/unapproved RO conflicts; manager explicitly approves overrides with audit trail. Never silently violate labor agreements. |
| SB-012 | **Event timeline and room-turn coordination** · Manager | M | Hourly day/week view with multiple events per room, pre-set, live setup and breakdown windows; detect overlapping crews, tight flips, and double-booked staff. |
| SB-013 | **Bulk BEO intake and revision difference view** · Supervisor | L | Import multiple BEOs without one-at-a-time re-entry; match existing BEO numbers; highlight changed guests/room/time/requirements; supervisor reviews before publishing; affected team must acknowledge critical changes. |
| SB-014 | **Equipment kits and room/service presets** · Supervisor | M | Build reusable kits by buffet/coffee/plated/room, including counts, placement instructions, pictures and storage locations; apply and manually override; reconcile dishes/guests against required chafers and serviceware. |
| SB-015 | **Equipment inventory and check-out/return** · Manager + Steward | L | Par levels by storage area, available/reserved/in-use/damaged counts, cart assignments, check-out and return logs; alert on shortages and no-return. Handle china, glassware, urns, chafers, Queen Marys and hot boxes. |
| SB-016 | **Consumables replenishment & reorder queue** · Steward + Manager | M | Daily count or low-stock tap for soap, sanitizer, paper/napkins and other supplies; per-area par thresholds, reorder quantities and owner; close the loop when restocked. |
| SB-017 | **Deep-cleaning schedule & proof** · Night + Supervisors | M | Rotating area/asset cleaning calendar (walk-ins, walls, floors, carts, coolers, kitchen, Lockwood); frequency, chemical/SOP checklist, completion photo for critical items, supervisor inspection and overdue alerts. |
| SB-018 | **Maintenance, pest and sanitation work orders** · Supervisor | M | Photo, precise location, urgency, issue category, temporary mitigation, named facilities/vendor handoff, due date, resolution evidence; escalate recurring leaks/pests and never mark a pest/sanitation issue closed simply because a cleaning task was checked. |
| SB-019 | **Receiving and deliveries workflow** · Steward | M | Check in deliveries, verify quantity/condition, mark stored in coolers/dry storage/candy room, note discrepancies and notify manager of missing items. |
| SB-020 | **Push notifications with quiet rules** · All | M-L | Opt-in device push for new assignments, urgent changed BEOs, blockers, handoffs and imminent deadlines; avoid alert spam; notification deep links to action, acknowledgments for critical updates. |
| SB-021 | **Offline-first steward task execution** · Steward | L | Cached current shift and checklists work in spotty basement/service areas; actions queue locally, visibly sync later and surface conflicts rather than lose updates; never claim server confirmation while offline. |
| SB-022 | **Room maps, stations and QR labels** · Steward | M | Open each task for floor/room/storage location and equipment pickup instructions; scan QR at station/cart to jump to right checklist or inventory; no location tracking of staff. |
| SB-023 | **Fast multilingual mobile interface** · Steward | M | English and Spanish, large glove-friendly controls, minimal typing/scrolling, use one thumb; consistent iPhone/Android behavior; translated standard tasks and clear untranslated free-text flags. |
| SB-024 | **Photo evidence, QA and rejection workflow** · Supervisor | M | Optional before/after photos by task type, mandatory photo only for configured critical tasks; supervisors can inspect and reject, with reasons; retain attribution/version history; prevent using photos as a substitute for safety signoff. |

## P2 — Optimize and expand
| ID | Feature / role | Effort | Acceptance criteria |
| --- | --- | --- | --- |
| SB-025 | **Operational reporting** · Manager | M | Trends: on-time setups, unassigned work, reopen rate, unresolved blockers, equipment shortages, deep-clean compliance, overtime risk; group by shift/area, not invasive employee ranking. |
| SB-026 | **Staffing demand forecast** · Manager | L | Project needed labor by covers, event mix, buffet stations, expected turnover and available staff; show assumptions and confidence; manager controls final assignments. |
| SB-027 | **Smart BEO parsing & validation assistant** · Supervisor | L | Extract event details, hot dishes, service style and unusual requirements from PDF; compare to template; cite source page/snippet for every extracted field; never auto-commit uncertain quantities. |
| SB-028 | **Daily auto-generated operations brief** · Manager | M | One shareable morning/afternoon briefing: arrivals, room flips, top risk BEOs, staffing gaps, supplies needed, open work orders and prior-shift handoff. |
| SB-029 | **Vendor/system integrations** · Manager | L | After confirming approved interfaces: event/BEO system, scheduling/timeclock, maintenance/work orders, purchasing/inventory and optional calendar; bidirectional sync only with clear ownership and reconciliation. |
| SB-030 | **QR visual SOP & micro-training** · Steward | M | By equipment and task: brief illustrated set-up steps, cleaning safety reminders, correct storage and quick new-hire training; version controlled and multilingual. |
| SB-031 | **Reliable backups, retention and audit export** · Admin | M-L | Scheduled encrypted export/restore path for operational DB and photos, retention policies, data privacy and access reviews; configurable photo retention and verified restore runbook; no reliance on Durable Object as sole backup. |
| SB-032 | **Shift and task templates by outlet** · Supervisor | M | Create template packs for Lockwood, Lockwood Express, Potter's, main kitchen, banquet, yard and night team; configure due time/role/evidence without code; holidays/weekends can use different required staffing. |

## Operational guardrails / definition of done
1. **No fabricated completion:** Every action stores actor/time, and supervisor reopens/rejections leave an audit trail; don't silently infer that work was performed.
2. **Union/HR compliance:** Scheduling suggestions must be configurable for collective bargaining rules, seniority and approved RO, and require human confirmation for exceptions. Separate planned labor from actual clock-in/out; do not guess payroll.
3. **Steward experience:** A routine task should take 1–2 taps, with defaults and optional voice/photo notes. Do not require a photograph for every trivial refill.
4. **Offline accuracy:** Explicit pending/synced/conflict states and idempotent retries for field use.
5. **Permissions:** Stewards only see their assigned/authorized records; only supervisors can view aggregate personnel information. Avoid location surveillance or unnecessary employee scoring.
6. **Accessibility and devices:** Keyboard/accessibility labels, touch targets, iPhone responsive layout, poor signal behavior, and high contrast.
7. **Reliability:** Automated domain/API tests; mobile browser scenario tests; audit regression; restore drills before using for core staffing.
8. **Security:** No credentials in repo, secure access to photos and BEOs, safe handling of personally identifying event notes and file retention.

## Proposed build sequence
**Release 0: Click through everything.** SB-001, SB-007 and core dashboard fixes. Do a supervisor/steward mobile usability pass.  
**Release 1: Run today's shift.** SB-002 through SB-006, SB-008 and SB-009 (action queues, daily checklists, blockers, handoff).  
**Release 2: Make the whole team productive.** SB-010 through SB-016 and SB-020 (coverage and equipment), with rules/permissions validation.  
**Release 3: Close operational gaps.** SB-017 through SB-024, then reporting/AI/integrations after adoption.

## Pilot success measures (baselines to measure, not promised savings)
- Time from BEO arrival to assigned, reviewable setup.
- Share of stewards able to find their next task in under 10 seconds.
- Time to report a supply shortage and time to resolve it.
- Percentage of outstanding work carried forward and acknowledged at shift change.
- Number of unstaffed area/shift slots discovered before start.
- Re-entries into paper, texts or spreadsheets per shift.
- Percentage of tasks completed on time, with accurate exceptions.

## Suggested pilot scenarios
1. Morning: one steward calls off, Lockwood opens at 6 AM, manager finds under-40-hour eligible backfill without unapproved overtime.
2. Revised BEO: guest count rises, add a hot dish, deadline changes; affected team sees exactly what changed and confirms re-staging.
3. Running out of clean wine glasses or chafers: steward taps Missing supply, manager locates reserve stock and closes the issue.
4. Late-night cleaning: a pest problem and leak are logged with photos, transferred to the next shift and escalated rather than forgotten.
5. No signal in a basement store room: steward records pickup, later syncs and resolves a conflicting quantity.
