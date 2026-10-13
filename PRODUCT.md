# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Duty managers, security and the control room at a hotel property, looking at a wall TV to know whether the emergency teams are covered right now.
- Managers and team leads opening the same link on their phones to see who is on site and call them.
- Both are used equally; the live dashboard must work on a TV read from across the room and on a phone held in one hand.

## Product Purpose

ERT Live shows which Emergency Response Team members are on site right now, driven by HONO HR attendance punches. It replaces the manual "who's available" list. Success: anyone can tell in a couple of seconds whether every team has its minimum on site, who is missing, and reach the right person by phone.

## Operating Context

- Staff punch in/out in HONO; the screen updates within seconds over Socket.IO.
- Three teams on the dashboard: ERT Team (fire warden, evacuation marshal, security, engineering), Crisis Management (incident controller), First Aid Team (first aider). The mapping lives in `client/src/teams.js`.
- Each ERT role has a minimum on duty (Admin → Roles). A role below minimum makes the property not ready.
- Emergency mode turns every screen red and starts a muster headcount.
- A QR on the wall screen lets people punch in from their phone during demos.

## Capabilities and Constraints

- States: on site (available), punch-out missing (stale, not counted toward coverage), not available (off or overridden unavailable, with a reason).
- Properties can carry an assembly point and emergency contact numbers (Admin → Properties).
- Wall screens run unattended (wake lock, hidden cursor), must not depend on scrolling or tapping, and must stay correct when the connection drops.

## Brand Commitments

- Team colours chosen by the user: ERT green, Crisis Management orange, First Aid light red.
- Light theme on the wall display and phone layout.

## Product Principles

- Readiness first: the answer to "are we covered?" is the first thing anyone sees.
- Everything on one page: no rotating or hidden team views.
- Every person is one tap from a phone call.
- Never let status rely on colour alone: words and icons carry it too.
