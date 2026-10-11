# Phase 1 — Navigation and supervisor triage
Updated: 2026-10-11

## Implemented
- **Dashboard KPI drilldowns (SB-001):** All events, In progress, Complete and Overdue. Clicking a card switches to the matching event list, synchronizes the status dropdown and clears search. Applies to the production-oriented Cloudflare app and Vercel demo.
- **Steward workload drilldown (SB-007, event-only slice):** Supervisors can select a steward from the Stewards screen or By steward cards and see that steward's assigned banquet events for the chosen date. Back to team and Show all events reset the scope. Date and status filters work on that specific assignment list.
- **Supervisor attention queue (SB-002, event-only slice):** Prioritizes overdue setups, setups due within two hours, and any incomplete unassigned setups. Four counters drill down to matching lists. The total is a union (no double-counting); individual buckets may overlap. Work is sorted with overdue, then due-soon, then unassigned future work.
- **Responsive UI:** Large click targets, visible focus/selection states, keyboard activation of existing event cards and steward list items, and compact mobile layout. The demo has a similar supervisor queue and steward drill-down.
- **Accurate wording:** A steward with no banquet assignments is labeled "No banquet setups assigned," **not** "Available." Without a roster, shift availability cannot be inferred.

## How to try it
1. Sign in as a supervisor, choose the date, then click any dashboard number to see the matching event list. Click Overdue, then select another filter in the status dropdown to verify the counters and list remain consistent.
2. In the supervisor overview, check **What needs attention** and select Need attention / Overdue / Due within 2h / Unassigned. Each count filters the event list to that category; click an event to inspect the checklist or open **Details & assignments**.
3. Open **Stewards** or **By steward**, click a steward header / View assignments, inspect the scoped event list, change its date, and use **Back to team** or **Show all events**.
4. In the Vercel demo, switch to Supervisor view, try the priority tiles and choose **View assignments** on any team member.

## Timing and status rules
- Setup deadline is currently fixed at **one hour before event start**.
- Overdue: incomplete, setup deadline strictly in the past.
- Due within 2h: incomplete, setup deadline between now and two hours ahead (inclusive).
- Unassigned: incomplete and no assigned stewards, even when the deadline is farther away.
- Completed: requires saved completion confirmation. Completed setups are excluded from every attention category.
- "In progress" includes incomplete setups with partially ready equipment or all equipment ready but pending the completion photo.
- The chosen date refers to the **event date in the venue timezone**; a day-boundary deadline can occur on the prior calendar day.

## Validation and limits
- The production JS and demo JS parse successfully under a JavaScript syntax check.
- Five Node-compatible filter unit tests were executed in an isolated JavaScript harness: all passed. This is **not** a full `npm test`, login, mobile-browser, or device end-to-end run.
- The latest Vercel preview deployment for the feature branch reports **READY**. This is not a production deployment.
- Queue currently includes *banquet events only*. Blocker tickets, employee call-offs, shift rosters and area-cleaning tasks have no corresponding persisted workflow yet, so they are **not** represented. They remain later backlog items.
- This implementation is on a PR branch, not yet merged to `main` or deployed to Cloudflare production.
