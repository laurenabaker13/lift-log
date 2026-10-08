# Lift Log implementation plan

## Product outcome

Lift Log is a focused, mobile-first strength log for people who want to record completed weighted sets, retain history, understand estimated strength, and use that history to select a sensible next working weight. The v1 product is deliberately limited to weighted strength training. Running and cycling are not part of this release.

## Architecture

- **Client:** Preserve the fixed Expo Router / React Native / TypeScript / NativeWind starter. Add a portrait-first tab experience for Today, Templates, Progress, and Settings, plus focused routes for account access, exercise selection, workout editing, and exercise detail.
- **Server:** Extend the existing Express + tRPC service on port 3000. It will expose typed account, workout, template, and progress procedures; all user-owned reads and writes will be scoped to the authenticated account.
- **Database:** Use the managed MySQL-compatible database through Drizzle. Migrations will add the Lift Log tables and remain additive.
- **Account model:** The requested email/password account system will be implemented explicitly (rather than relying on the starter’s default OAuth flow). Passwords will be salted and derived with Node’s `scrypt`; the server will issue signed application sessions. Web uses the existing secure cookie helpers; native stores its session token with the existing SecureStore adapter and sends it as a bearer token.
- **Serving and caching:** The client is a browser-rendered Expo application for Web preview and a native Expo bundle for device builds. The published Web release uses one Express container: a multi-stage image exports the Expo Web output and packages a self-contained server bundle, then serves the app shell/assets and `/api/*` on the platform-provided port. The authenticated API is dynamic and private; API responses and session endpoints use `private, no-store`. There is no SSR or public content cache requirement. Native releases will be prepared for the Dashboard’s Android/iOS build flow rather than built inside the sandbox.

## Data model

| Area | Stored records | Notes |
| --- | --- | --- |
| Account and preferences | `users`, `user_settings` | Email, password hash, display name, selected unit (`lb`/`kg`), and account-scoped settings. |
| Exercise catalog | `exercises` | A shared starter catalog of common weighted lifts and equipment variants (including Back Squat and Romanian Deadlift with Barbell, Dumbbell, and Kettlebell), plus account-owned custom exercises. |
| Templates | `workout_templates`, `template_exercises`, `template_sets` | Template exercise order, equipment, target reps, percent of estimated 1RM, and set count/structure. Templates do not contain completed set data. |
| Completed workouts | `workouts`, `workout_exercises`, `workout_sets` | Workout date/title/notes, ordered exercises, and fresh actual set data: load stored canonically in kilograms, reps, optional RPE, and status. |

Every table that contains user data will have a user owner or be accessed through an owned parent record. Server queries will enforce ownership; the client never receives another account’s records.

## Strength calculations

- For every completed weighted set with a positive load and rep count, calculate **estimated 1RM (e1RM)** using Epley: `weight × (1 + reps / 30)`.
- The exercise/variant’s current estimate is the highest e1RM among its completed logged sets. The detail screen will also calculate **estimated 3RM** as `e1RM / (1 + 3 / 30)`.
- A planned set combines a target rep count with a selected percentage of the current e1RM. Suggested starting load is `e1RM × percentage`, rounded to the nearest **2.5 lb** or **1 kg** according to account preference. Users can always replace the suggestion with the actual load they complete.
- Actual weights are converted to canonical kilograms when saved and converted back only for presentation. Switching between pounds and kilograms therefore keeps historical loads, Epley estimates, and suggested loads equivalent rather than relabelling the same raw number.
- A new user without history can still set targets and actual data; the app will label the suggested load as unavailable until enough completed data exists.

## Main flows

1. **Account access:** A concise landing/auth screen lets a user create an email/password account or sign in. After success, the client persists the appropriate session and loads that account’s data.
2. **Start a workout:** Today offers an empty workout or a saved template. The exercise picker has common lifts, clear equipment variants, search, and a custom-exercise fallback.
3. **Log completed sets:** A workout holds ordered exercise cards. Each set row provides target reps, planned percentage/suggested load where available, actual weight, actual reps, and optional RPE (1–10). Users can add/remove rows and complete the workout; saving records fresh performance data and preserves every earlier session.
4. **Templates and copying:** Templates preserve exercises, equipment variants, set rows, target reps, and planning percentage. “Copy a prior workout” carries that same plan into today but never copies prior actual loads or RPE. New suggestions are recalculated from current max data.
5. **Progress:** Exercise detail and the Progress tab show logged set history plus current estimated 1RM and 3RM by exercise/equipment variant. The user’s unit preference applies throughout entries, suggestions, history, and estimates.

## Screen and module structure

| Path / module | Responsibility |
| --- | --- |
| `app/(tabs)/index.tsx` | Today dashboard, recent activity, start/copy actions. |
| `app/(tabs)/templates.tsx` | Template list and template creation/edit entry. |
| `app/(tabs)/progress.tsx` | Exercise-specific history and estimated-max summaries. |
| `app/(tabs)/settings.tsx` | Unit preference, account info, and sign-out. |
| `app/auth.tsx` | Email/password sign-in and account creation. |
| `app/workout/[id].tsx` | Workout editor with fresh set entry and completion. |
| `app/exercise/[id].tsx` | Exercise/variant history and strength-estimate detail. |
| `components/lift-log/*` | Reusable set rows, metric cards, pickers, template cards, and account UI. |
| `shared/strength.ts` | Pure Epley, 3RM, rounding, and suggestion helpers used by server/client tests. |
| `server/routers.ts` and `server/db.ts` | Typed account, catalog, workout, template, and progress operations. |
| `drizzle/schema.ts` | Account extensions and all persistent Lift Log tables. |

## UX and visual direction

See `ideas.md` for the committed direction. The interface will use dense but readable workout cards, single-action entry points, clear number hierarchy, and comfortable tap targets. The workout screen will expose planning information without blocking fast manual entry.

## Route declaration

`public/manus-routes.json` will declare the current Expo Web routes before the development server starts and will be kept aligned with route additions.

## Verification plan

- Synchronize the additive schema with `pnpm db:push` before exercising user-dependent API paths.
- Run the existing TypeScript check, lint, and targeted unit tests for strength math and copy/template transformations.
- Confirm both Mobile listeners (Metro 8081 and API 3000) are available, and confirm `/manus-routes.json` returns the expected JSON rather than an application fallback.
- Run a code-based independent validation pass against the accepted plan and completed ToDo outcomes, then fix confirmed findings before delivery.
- Prepare a project-specific square launcher icon and its durable project logo metadata before the first saved checkpoint containing application work.

## Iteration: templates, session recovery, and rep-max planning

- **Named templates:** Saving from a workout opens a focused modal with a prefilled, editable template name and explicit Cancel/Save actions. Existing templates gain a confirmed Delete control that removes only the template structure, never a saved workout.
- **Canceling a workout:** A draft workout gains an explicit Cancel action with a cross-platform confirmation modal. Confirming permanently deletes that in-progress workout and its set records, then returns to Today; keeping it dismisses the modal without changing data.
- **Grouped exercise history:** The exercise progress detail groups completed set rows by calendar date, displaying the date once followed by its individual sets and calculated estimated 1RM values in set order.
- **Rep-max planner matrix:** The Progress tab gains a selected-exercise planning matrix. Rows are estimated 8RM, 5RM, 4RM, 3RM, and 1RM; columns are 60%–90% of the selected rep max. Each cell is calculated from the exercise’s current Epley estimate and rounded to the account unit. The UI explicitly distinguishes this **percentage of rep max** planner from RPE, which remains a 1–10 post-set effort score.

## Iteration: program-first weekly planning

Lift Log will add a primary **Follow a plan** façade while preserving **Solo log** as a secondary, unstructured entry point. A program belongs to one account and contains ordered editable weeks; each week contains any chosen day-of-week workouts. The Monday/Wednesday/Thursday/Saturday pattern is an example, not a restriction.

| Record | Purpose |
| --- | --- |
| `training_programs` | Account-owned named program and its current active state. |
| `program_weeks` | Immutable-by-history planning versions: Week 1, Week 2, and future copies. |
| `program_workouts` | Named workout assigned to a selected day of week within one plan week. |
| `program_exercises`, `program_sets` | Ordered exercise prescription, goal reps, optional target RPE, and either a manual target load or an intensity percentage of the estimated rep max. |

Creating a program starts an empty Week 1. Users add any number of day-specific workouts, add exercises and set rows, choose the prescription style (**% of rep max** or **manual target load**), and set an optional target RPE. Duplicating a week copies its entire planned structure with no completed performance data; the copied week is independently editable and can also receive newly added workouts. Editing a future week never changes a completed workout or earlier weeks.

Starting a planned workout creates a fresh ordinary workout log from that plan. It carries planned exercises, goal reps, and planning percentages but never prior actual load, reps, or RPE. It is therefore collected by the existing account-wide Progress view alongside solo logs, aggregated by exercise/equipment variant.

For a percentage prescription, the planned load uses the current estimated rep max for each goal-rep count: `estimated nRM = e1RM / (1 + n / 30)` (with 1RM equal to current e1RM), then `target load = nRM × intensity percentage`, rounded by the selected unit. Thus, changing a plan from 12 to 10 reps updates the derived target weight. Guided suggestions use the most recent completed set: when the target reps are achieved below the target RPE, suggested intensity rises by 2.5 percentage points; when RPE is more than one point over target, it drops 2.5 points; otherwise it remains stable. Suggestions are always presented for the user to apply, never applied automatically.

The mobile home screen prioritizes the active program and current selected week, with clear actions to build/manage a plan, duplicate its week, start a planned day, or start a separate solo log. New `/plan` and `/plan/workout/:id` routes will be declared in the route manifest. The existing browser-rendered Expo frontend plus private Express/tRPC API architecture remains unchanged; all program APIs remain dynamic, authenticated, and `private, no-store`.

## Iteration: athlete-first trainer-plan import

This release adds **athlete-first plan import**, not trainer/client account sharing. Athletes can upload a clear PDF, photo, screenshot, or other supported image of a weekly trainer plan. The original private source file is stored under the athlete’s account and remains linked to the imported program for later viewing.

The server sends a temporary signed copy of the uploaded PDF/image to the server-side multimodal model (`gemini-3-flash-preview`) and requests strict structured extraction of workout names, day of week, exercise, equipment, set/reps, target weight, target RPE, and trainer notes. The reader must not invent unclear data: it returns a plain-language uncertainty list. The client then presents an editable review before creating any program; an athlete can correct every extracted workout, day, exercise, equipment, target, RPE, and set-rep value. Saving creates an ordinary independently editable program and leaves the original source attached.

AI coaching guidance in this release stays within general fitness education: plan-load suggestions explain the available e1RM/RPE data, and later exercise guidance can link to instruction videos and include concise safety reminders. It will not offer medical advice; pain, injury, or health concerns are referred to a qualified coach or clinician.

**Deferred trainer release:** sign-up roles (athlete/trainer/both), trainer-mode switch, email invitations requiring athlete acceptance, trainer-only accepted-client progress views, shared program versions, and non-forced trainer suggestions. A trainer’s future-plan edits must never overwrite a client’s completed workout logs.

### Import safeguards applied during delivery

Trainer-plan source objects are account-private: the generic storage proxy verifies the signed-in account owns a requested `lift-log/plans/...` object before it can redirect to storage. Native and web clients open the original source only through a protected program download procedure that issues a short-lived signed URL after the program ownership check. Percentage plans created because an uploaded plan had no written target weight are always listed as a review uncertainty; the athlete must confirm or edit the 80% placeholder before saving. The review surface supports adding, removing, and editing the imported week name, workouts, exercises, set rows, days, equipment, prescriptions, source weight units, target weights, target RPEs, and reps.

### In-plan next-week imports

An active program exposes one clear **Upload next week (PDF or photo)** action alongside week duplication. This opens the same private photo/PDF reader and editable review flow, but the review explicitly identifies the active plan that will receive the upload. Saving appends each reviewed imported week after the program’s current highest week number; it does not rename the plan, replace earlier weeks, or change any completed workout log. Generic imported labels such as “Week 1” are relabeled to the next consecutive plan week before review so an upload after Week 1 becomes Week 2 by default. The append API requires that the requesting athlete owns the currently active program, which prevents a direct request from adding weeks to another account’s or archived plan.

## Iteration: Flow State interface refresh

This release modernizes the existing product without changing training data, formulas, or user workflows. Lift Log will move from a dense, utility-card appearance to the **Flow State** visual direction documented in `ideas.md`: deep graphite focal surfaces, soft mineral canvas, white elevated cards, and signal lime used sparingly for momentum and completion. The existing approved app icon remains unchanged; no substitute logo or brand asset is introduced.

- **Shared system:** Rework the app screen, cards, inputs, buttons, chips, metrics, and modal surfaces for softer geometry, more intentional contrast, compact label hierarchy, responsive centered Web content, and thumb-friendly touch targets. The persistent navigation becomes a floating dock with a distinct active destination.
- **Today and Plans:** Make the next training action visually dominant. Reduce the active program management controls to a single primary action plus a progressive “plan options” reveal; retain all existing plan capabilities, archived history, duplicate-week behavior, and solo logging.
- **Workout logging:** Present the workout as one focused session with a calm summary surface, readable set-entry rhythm, clear suggested-load quick fills, and grouped optional controls. Keep all existing fields, calculations, bodyweight support, equipment choice, RPE, templates, form guidance, save, and finish behavior unchanged.
- **Progress and supporting screens:** Simplify hierarchy around each lift’s latest result, estimate, trend, and planning action. Templates and account settings inherit the shared visual system so the application feels one product rather than a collection of forms.


## Iteration: low-friction launch, safety, and coach access

### Product principle

This release optimizes Lift Log for a tired person between sets: each screen has one obvious next action, uses ordinary language, remembers useful defaults, and keeps optional details out of the way. The app must never require a user to understand 1RM, RPE, program structure, or trainer sharing before they can log a set.

### Delivery scope

1. **Guided first use and fast logging**
   - A signed-in athlete who has not selected a preferred workflow sees two large, plain-language choices: **Follow a workout plan** and **Just log today’s workout**. A short explanation makes it clear that either choice can be changed later.
   - The planned-week screen becomes a seven-day calendar/list hybrid with unmistakable status cues: upcoming, in progress, complete, and no workout planned. It keeps the current chosen week and supports any number of days per week.
   - Workout entry adds per-exercise **Use last time**, **apply load to all sets**, and a compact post-set RPE picker. The form keeps target reps, completed reps, and load understandable without exposing math unless the athlete asks.
   - The progression suggestion explicitly says why a planned load changed when reps, last set performance, target RPE, or the user’s max estimate changes.

2. **Progress visualization and reliable planning**
   - Progress will show a simple per-exercise line trend for estimated 1RM and a compact summary of latest load, best estimated max, completed sets, and RPE trend. The existing rep-max percentage matrix remains available beneath the relevant lift as an advanced planning tool.
   - All math continues to use canonical kg storage and the documented Epley formulas. Bodyweight records remain excluded from invented strength-max estimates.

3. **Accounts, privacy, and data control**
   - Add in-app privacy and data-control screens: a plain-language privacy explanation, downloadable JSON data export, and a deliberate account-deletion flow that lists the data permanently removed and requires explicit confirmation.
   - Add password-reset and email-verification token flows. Token values are random, stored only as hashes, single-use, and expire quickly. Reset requests remain non-enumerating.
   - Real delivery of password-reset, verification, and coach invitation emails uses Resend’s API through protected runtime secrets (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`). No credential is stored in source. Until those secrets and an approved sender domain are provided through the secure configuration card, the application will clearly say that outgoing email is not enabled rather than pretending that email was sent.

4. **Trainer and athlete collaboration**
   - Accounts can enable a coach role while retaining athlete access. A clear **Athlete / Coach** switch changes the workspace without changing data ownership.
   - A coach can invite an athlete by email. An invitation becomes a relationship only when the invited athlete accepts; a pending invitation reveals no workout data. Invitation tokens are hashed, expire, and are single-use.
   - Coach mode shows accepted athletes, their recent adherence and exercise progress, and a dedicated client detail view. Coaches can leave a non-forced next-workout suggestion.
   - A coach can create a future program for an accepted athlete. The athlete owns their completed workout logs. Coach changes affect only future program structure and cannot overwrite logged sessions or their historical performance data.

5. **Launch readiness**
   - Keep the existing Expo Web/Expo Go architecture: browser-rendered Expo client plus authenticated Express/tRPC API. All account, coach, plan, export, and progress responses are private and `no-store`; no personalized content enters shared caching.
   - Preserve the managed database with additive schema changes. The shared development/published database is never overwritten by seed data or a release operation.
   - Prepare publication configuration and Expo Go verification. A public publish itself remains a separate confirmation because it creates a broadly accessible deployment.

### Planned modules

| Module | Responsibility |
| --- | --- |
| `shared/strength.ts`, `shared/progress.ts` | Pure max, guidance, and chart-series calculations. |
| `server/_core/email.ts` | Optional Resend delivery; fails clearly when delivery is not configured. |
| `server/_core/local-auth.ts` | Verification/reset token issuance and secure password reset endpoints. |
| `server/db.ts`, `server/routers.ts` | Account control, export, coach invitation/acceptance, trainer permissions, and data ownership checks. |
| `app/onboarding.tsx` | One-screen workflow choice for a new athlete. |
| `app/privacy.tsx`, `app/reset-password.tsx`, `app/verify-email.tsx` | Privacy, recovery, and verification routes. |
| `app/coach/*` | Coach workspace, accepted-client view, shared future-plan creation, and suggestions. |
| `app/(tabs)/plans.tsx`, `app/workout/[id].tsx`, `app/(tabs)/progress.tsx` | Simple planning calendar, rapid entry controls, and visual progress trend. |

### Verification approach

- Add deterministic unit coverage for math, rep/RPE guidance, token expiration/one-time use, and privacy export shaping.
- Synchronize schema additively and test account/coach ownership paths with real API/database responses.
- Run TypeScript, lint, existing/full targeted tests, API health, and route-manifest checks.
- Run the required read-only independent validator against the updated plan and ToDo. Address confirmed findings before the final checkpoint.
- Do not claim external email delivery or a published public URL until the secret/provider and publication receipts respectively confirm those steps.


### Launch-hardening corrections after independent review

- Account reset/verification tokens now transition from unused to used with a conditional affected-row check; a second concurrent consumer receives an already-used error rather than changing a password or email state.
- Invitation response changes the pending invitation status inside the same database transaction that creates an accepted trainer-client relationship. Exactly one accept/decline response can win.
- Planned sessions now use a nullable, unique `activeProgramWorkoutId`: a plan day can have at most one unfinished log, while completed sessions clear that key and leave historical records intact.
- The Express `/api/trpc` mount now applies `Cache-Control: private, no-store` to personalized API traffic.
- Reset messaging is deliberately generic and non-enumerating. It never promises delivery; it tells the person to check the inbox shortly and retry later if no link arrives. Actual provider/sender delivery remains a launch verification task, not a simulated claim.
- The Athlete/Coach switch now routes directly to the selected workspace and changes the persistent navigation. The Privacy screen accurately distinguishes immediate removal of app access and references from the managed storage service’s separate secure object-retention lifecycle.

## Iteration: private Friends and lift challenges

Lift Log will add a **Friends** experience for motivation between trusted peers, not a public fitness network. It follows the existing Flow State direction: one calm social destination, compact activity cards, and fast, thumb-friendly encouragement without turning a workout into a feed to manage.

### Scope and privacy rules

- **Mutual friends only:** A signed-in athlete sends a request using the other person’s account email. The request is neutral if no matching account exists, and no activity is revealed until the recipient explicitly accepts. There is no public directory, public-figure following, or unapproved follower model.
- **Identity is chosen by the athlete:** Social settings add a private display name and a choice to use that display name or the account name with friends. Account email remains private.
- **Activity sharing is opt-in:** Athletes choose whether to share activity with accepted friends. The default is private. When sharing is on, friends can see only a completed-workout card and a personal-record card such as “New Back Squat PR: 135 lb.” They never receive workout notes, individual set rows, reps, RPE, plan details, or full exercise summaries.
- **Friendly interactions:** Accepted friends can give one lightweight reaction per activity (Fist bump, Fire, or Strong) and add a short plain-text comment capped at 180 characters. A commenter or the activity owner can remove a comment; a friend can be removed at any time. The UI asks people to keep comments friendly.
- **Individual lift challenges:** Launch with private, mutual, 30-day estimated-1RM challenges for Barbell Bench Press, Barbell Back Squat, and Barbell Deadlift. A challenge is pending until the opponent accepts. Scores use the existing Epley estimate from each participant’s completed logs and are visible only to the two accepted participants. Challenges do not require public activity sharing.
- **Playful rivalry stays bounded:** Active challenge participants can send only preset notes: “Nice lift,” “Your turn,” and “Catching up.” There is no free-form taunt channel. Standard short comments remain available only on shared activity cards.

### Data, service, and screen structure

| Area | Responsibility |
| --- | --- |
| `user_settings` | Social display-name choice and opt-in activity-sharing preference. |
| `friend_connections` | Directed request, acceptance/decline, and removal states. Every social read verifies an accepted mutual connection. |
| `friend_activities`, `activity_reactions`, `activity_comments` | Minimal completed-workout / PR activity, one reaction per friend, and removable short comments. Activity retrieval filters by the athlete’s current sharing preference. |
| `lift_challenges`, `challenge_notes` | Pending/active/canceled 30-day lift challenges and the bounded preset rivalry notes. |
| `server/db.ts`, `server/routers.ts` | Ownership and relationship checks, neutral friend requests, activity generation after workout completion, reaction/comment controls, challenge scoring, export, and account-deletion cleanup. |
| `app/(tabs)/friends.tsx`, `app/friends/[id].tsx` | Friends hub with requests, active challenges, activity feed, quick reactions/comments, and a focused friend profile. |
| `app/(tabs)/settings.tsx`, `components/lift-log/global-bottom-nav.tsx` | Social identity/privacy controls and an athlete-workspace Friends destination. Coach workspace navigation remains focused on coaching. |

Every new table is additive. Account export includes social settings, connections, activity, comments/reactions, and challenges. Account deletion removes the account’s social records and any records that reference it. Completed workout history remains the source of challenge scores and is never exposed through the general friend feed.

## Iteration: first-time app guide

After a new athlete chooses **Follow a workout plan** or **Just log today’s workout**, Lift Log starts an interactive, in-app coach-mark guide rather than a separate slideshow. The athlete remains inside the real application: the current area is outlined, a short instruction explains its purpose, and the next required navigation tab is highlighted while the other tabs are temporarily unavailable. The guide moves through Plans, Workouts, Progress, Friends, and Settings using the athlete’s real taps. Each area also highlights the relevant real control or surface, such as the plan home, solo workout button, strength summary, friend request card, and unit preferences.

The coach-mark layer remains lightweight: it never automatically enters data, creates a plan, or creates a workout during the walkthrough. Users can inspect the highlighted real control, keep moving to the next area, or use **Skip guide** at any point. Only finishing or skipping marks onboarding complete and then opens the original selected plan, a fresh solo workout, or Workouts as appropriate. The guide can be replayed through Settings.

| Module | Responsibility |
| --- | --- |
| `shared/app-guide.ts` | Tour-area labels, safe first-time destination parsing, and completion label helpers. |
| `components/lift-log/interactive-tour.tsx` | In-app coach-mark state, navigation targeting, highlighted-control overlay, and secure completion handoff. |
| `app/guide.tsx` | Authenticated launcher that begins the interactive tour on the real Plans screen. |
| `app/onboarding.tsx` | Sends first-time workflow choices into the guide instead of creating a workout prematurely. |
| `app/(tabs)/settings.tsx` | Provides the persistent replay entry point. |

## Iteration: guided setup, transparent load progression, and skipped plan days

The first-use coach-mark tutorial will stay inside the real app and extend beyond navigation. In **Plans**, it will call out the difference between building a workout day and importing a trainer PDF, screenshot, or photo; the upload surface explains that the athlete selects a file, reviews the extracted plan, and chooses when to save. In **Workouts**, the tour will show the real **Start a solo workout** action, then the **Add exercise** control and picker without silently adding an exercise. Every tutorial step remains skippable and never saves a plan or set without an explicit athlete action.

Strength estimates continue to use the Epley formula: `estimated 1RM = load × (1 + reps / 30)`, and 3RM and higher-rep rows invert that same relationship. RPE does not change the estimated max in v1; it guides the next recommended starting load. When the athlete matched the next session's rep goal, the recommendation begins from their latest completed load rather than dropping back to a generic percentage. At or below the target RPE, it adds one standard increment (5 lb / 2.5 kg); one RPE point above target holds steady; higher effort or missed reps reduces one increment. A percentage-derived rep-max load remains the conservative starting point when there is no usable previous performance. The interface must explain this clearly and continue to prioritize an explicit coach/manual target weight.

An athlete can mark an unstarted planned workout day **Skipped**. A skip is stored separately from workouts, does not create a workout, does not affect Progress or estimated maxes, and is shown in a muted/gray day and session state. The athlete can undo the skip and start the original plan later. Active drafts and completed logs cannot be skipped, preserving logged history and avoiding conflicting session states.

## Iteration: published web session transport

- The public Web app uses its secure, HTTP-only same-origin session cookie for browser API and tRPC requests. It does **not** attach the locally cached app-issued bearer token to those requests, because the hosting proxy can interpret that header as platform credentials before Lift Log receives it.
- Native clients and explicitly cross-origin API configurations continue to use the bearer-token transport. This preserves Expo/Preview fallback behavior without blocking public account creation, sign-in, workout saves, or other authenticated browser actions.

## Iteration: default mutual sharing and friendly competition

After a mutual friend request is accepted, both athletes automatically share **future completed-workout and PR activity** with that accepted connection. This is intentionally summary-only: a feed card can say that someone completed a workout or achieved an estimated 1RM PR, but never exposes ordinary set-level loads/reps, RPE, notes, or plan details. Historical activity is not retroactively published merely because a friendship is accepted.

A completed workout is shared by default; the athlete can switch that individual workout to **Private** before logging it or when editing it later. Making an already shared workout private removes its corresponding social cards and interactions without changing the workout itself or Progress. The Friends settings keep display-name choice but do not make athletes opt into activity for every session.

Friend profiles will show estimated 1RMs by lift and equipment variant for mutual friends who share activity. A challenge can be created for **any matching weighted lift both friends have logged**, rather than a fixed three-lift list. Challenges remain private to their two accepted participants, run for 30 days, and update from completed logs. The feed retains short comments plus reactions, with a clearly labeled Kudos reaction. When an active challenge has a new leader, the winner sees a playful preset-taunt prompt (for example, “I took the lead”); rivalry messages remain preset and accepted-friend-only.

## Iteration: resilient weight entry

Loads are stored canonically in kilograms, but every conversion back to the athlete’s selected unit is normalized before it reaches controlled input fields. This prevents JavaScript floating-point artifacts such as `19.999999999999…` from appearing after a round-trip conversion; an entered 20 lb remains a clean `20` in the editor and throughout the app.

## Phase 3 — Calm, mutual-friend motivation (current scope)

Phase 3 supersedes older social descriptions above where they conflict. Preserve the Expo client, private Express/tRPC API, managed MySQL, existing actual brand assets, workout history, Phase 1 logging and Phase 2 guidance/finish screens. Do not publish this phase.

- **Invite:** Friends starts with names and one main Invite a friend action. A dedicated invitation screen shares a random opaque link or code; redemption sends a pending request, never bypasses mutual approval. Preserve the invitation through signup and first-run unit selection. Email remains an optional fallback, with no email delivery during testing.
- **Shared activity:** Existing published workout cards gain whitelisted exercise summaries (lift name, equipment, number of sets, heaviest actual weight and its reps, New best). Newest first; only currently shared, completed, non-private workouts from accepted, nonblocked friends. No notes, full set rows, body weight or personal statistics. One Kudos control with named givers and one Comment control, with Strong!, Nice lift and Beast mode chips.
- **Compare:** Friend profiles show only main lifts, actual heaviest shared weights, two values per matching lift in the viewer's unit. Equipment stays distinct. The viewer may see their own private history, but never another user's private results.
- **Challenges:** A pending challenge snapshots the sender's shared actual best and ends Sunday; opponent accepts or chooses Not now. A new shared lift after acceptance that exceeds the snapshot produces a private-to-participants win card and Rematch action. Friendly lines are presets; no free-text taunts. Old challenge records remain intact.
- **Safety:** Per-friend Mute is reversible and suppresses nudges, friendly lines and notices. Block removes the friendship, denies interaction and cancels current challenges; settings supports unblocking. All legacy social API paths must honor blocks as well.
- **Nudges:** Both parties explicitly opt in, default Off. Show Send a nudge only after approximately 14 days without a completed workout and only when permitted. The recipient sees just a preset warm line and sender, never the inactivity reason or time. Transactional enforcement limits each sender/recipient pair to one in seven days, including concurrent requests.
- **Notices:** In-app social notices, default enabled, at most one per rolling 24 hours per recipient; Settings has an explicit switch. Requests/challenges remain available in Friends even when an alert is suppressed. No claim of operating-system push delivery.
- **Modules:** Additive social schema and migrations; existing database/router/shared-social modules enforce server permissions; Friends hub/card, friend profile, invitation route and settings implement the focused UI. Account export/deletion includes new social records.

User-requested evidence: fake accounts only, no real emails, and a final fresh-user 390px phone walkthrough including signup, logging, Progress, plans entry and the social flow. Existing checks plus independent read-only review before checkpointing.

Phase 3 implemented: shared comparison/challenge sources require publication markers and target workout references; Sunday deadlines use device offset and whole-second MySQL precision. Direct unread nudge messages are separate from one-per-24-hour in-app notices so disabling alerts does not discard a permitted message. Independent review findings and observed 390px usability defects were fixed; details/evidence are in phase-3.md. No publication or next-phase work.

## Requested fixes — 8 October 2026
Only these changes: Best lift and chart use heaviest actual logged weight per exercise/workout (first log starts the best), no formula-derived achievement or calculation wording; chart footer Starting line set. for one workout, otherwise Started at X lb, now Y lb.; Home This week card uses the active plan's next unfinished scheduled session and starts/resumes it, or Pick a plan or just start with Plans/solo buttons; Plans gets its own persistent tab and leaves More; trainer import supports paste/photo/file, editable count preview and Save; shared number fields select all focus and retain partial decimals so typing replaces old values; preserve simple Next time Easy +5 lb, Easy big legs +10 lb, Hard holds, kg steps 2.5 and lb steps 5. Existing authentication, workout history, database, privacy and other features are not redesigned. No publication requested.

## First lift before signup — 8 October 2026
New visitors enter /first-lift without login. A persisted local draft captures unit (Skip uses lb), optional comfortable weekly days (2/3/4, Skip stays null), lift choice and actual sets. First-set logging is local and immediate so no network call blocks the reward moment. All fields blank; real nonnegative decimal weights and positive whole-number reps. The gentle confetti lasts 1000ms, no motion/haptic under Reduce Motion. Lazy anonymous backend identity uses a real signed session, no fake user or auth bypass; it owns private workouts/imports and opaque friend invite. Guests retain local draft and can retry remote save. A durable CSPRNG UUID client key prevents duplicate sync. Guest invite aliases preserve shared links through existing-account claims. Signup upgrades the same user, preserving sets/plans. Existing-account sign-in securely claims the guest data only with authenticated target and validated guest token. Apple native iOS sign-in verifies Apple JWK signature, issuer, exact bundle audience and a MySQL-backed one-use nonce; no unverified email-based linking. Web Apple OAuth cannot be enabled without Apple Service ID credentials, so no dead Apple button appears on unsupported devices. Screen routes and persistent navigation hide first-run/account flows; existing signed-in users retain app behavior. Guest finish reports Week 1 started and optional chosen count, never invented skipped choice. Invite button shares only a real friend link, never workout details; account request follows this moment with Save your lifts and guest continuation. Screenshots will show actual rendered 390px screens, not mockups. No publication requested.
