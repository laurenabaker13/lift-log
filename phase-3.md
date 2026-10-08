# Phase 3 — Friends, kudos and friendly challenges

Completed 8 October 2026. This phase is saved for Preview/checkpoint delivery, **not published**. No later phase was started.

## What changed

- **Invite a friend:** share a text-friendly link or a private random code. Codes work with pasted spaces/hyphens. A new user keeps the invitation through signup and the first lb/kg question. The inviter still approves the request; links never automatically create a friendship.
- **A quieter Friends screen:** names first, one main Invite a friend button, and the exact empty state “Lifting is better with friends. Invite someone.” Incoming requests and challenges remain available even when notifications are off or the day's notice allowance is used.
- **Shared workout cards:** newest first, with name, time, exercise, number of sets, best actual weight/reps and New best when applicable. Only currently shared completed workouts appear. Notes, individual set rows, private workouts, body measurements and personal statistics are not returned by the social API.
- **Kudos and comments:** one Kudos button shows its givers. Comment supports up to 180 characters and the Strong!, Nice lift and Beast mode quick replies. A failed comment keeps the draft for retry. Old reactions are displayed as Kudos. A repeated New best label was removed from single-lift cards.
- **Compare lifts:** actual best weights, not estimates, for main bench press, squat, deadlift and overhead press variants. “You: … Sam: …” uses the viewer's lb/kg choice; equipment remains distinct. A user's own private best can be shown to that user, but challenge invitations use only their published shared best.
- **Friendly challenges:** “Beat my … by Sunday,” with Accept or Not now. Only a new shared workout after acceptance counts. The challenged friend exceeding the number creates a win card, visible only to the two participants. The loser can request Rematch; repeated requests are disabled while a challenge is in progress. Preset friendly lines include Catch me if you can and Your turn.
- **Mute and Block:** every friend profile has both. Mute suppresses nudges, notices and friendly lines without hiding ordinary shared workouts/comparisons. Block removes the friendship and prevents invitations, profile/feed access, comments, kudos, nudges and challenges. Only the blocker can unblock; unblocking does not silently restore approval.
- **Opt-in nudges:** Let friends nudge me starts Off. Both friends must turn it on. A Send a nudge button is available after about 14 days without a completed workout, subject to mute/block and the one-per-friend-per-seven-days limit. One tap sends “Gym misses you.” The other preset is “Where are you bro?” No free-text nudges or inactivity explanations are sent.
- **Calm notices:** Settings has Notifications On/Off. Notification creation is serialized to at most one per rolling 24 hours. Notices are in-app, not operating-system push notifications. Direct nudge messages remain available in Friends when alerts are off; these are separately dismissible messages, not extra alert notifications.
- **Privacy and records:** all social reads/mutations, including older endpoints, enforce the applicable current friendship, sharing and block rules. Comparison/challenge sources require actual publication, not merely a non-private workout. Withdrawing a source or turning sharing Off hides corresponding social results. Historical workout data is preserved; new fields/tables were added through additive migrations. Social export and account cleanup include the new records and inbound challenge-win references.

## Findings corrected before delivery

The independent read-only review identified legacy social privacy, notice, export and concurrency gaps. Confirmed findings were fixed and exercised with fake accounts. The phone walkthrough additionally found:

1. Challenge was missing because the source-safe comparison field was not connected to the UI. The field is now returned and the profile uses the inferred API type instead of an unchecked cast.
2. MySQL rounded a fractional Sunday deadline into Monday. Deadlines now use supported whole-second precision and the device's local offset; the persisted phone card reads Sunday.
3. Pending challenges showed two empty numbers. They now say who is waiting to accept, and a duplicate Challenge action is hidden.
4. Rematch could be tapped again while already pending. The card now displays Challenge in progress instead.
5. Failed comments cleared too early. The draft is retained until the save succeeds and the old error clears after a successful retry.
6. Settings had small duplicate accessibility switches. Only the full 58px row is interactive/accessible, with explicit web checked state.
7. An answered friend-request notice could reappear on a later invitation. Answering the request consumes its notice.

## Evidence

- TypeScript, Expo lint, API bundle, Drizzle migration consistency and diff whitespace checks pass. Lint retains the pre-existing Node module-type warning only.
- **70 unit tests pass** across 10 test files.
- `pnpm exec tsx scripts/phase3-social-smoke.ts`: **nine integration groups pass**, covering opaque invitations/approval, publication-only comparisons, card/Kudos/comment DTOs, private withdrawal, concurrent challenge creation, participant-only wins/Rematch/export, withdrawn challenge sources, notice dismissal/rolling daily limit, both-sided opt-in/inactivity/mute/concurrent weekly nudges, legacy block gates and deletion cleanup. The runner always cleans up its owned `@liftlog.invalid` fixtures.
- Expo Web export includes the new invitation routes; public Preview route-manifest JSON and API health were checked.
- Actual 390px browser walkthrough: new signup; first-run lb selection; 135×8 Easy with two sets; 2160 lb finish summary; invitation link through a second signup/unit flow; approval; a shared 145×8 three-set card; named Kudos, quick and free-text comments; two-number profile; challenge acceptance and preset line; next-weight Use it to 150; a new win and Rematch; local Sunday deadline; sharing Off/On; both nudge opt-ins; notifications Off with a direct nudge and dismissal; Not now; mute/unmute; block/unblock; code fallback; Progress; plan entry and creation; More/Settings; signout. A final fresh kg account verified units survive reload, nudges default Off, notices default On, two 58px switches, saved changes and no horizontal overflow.
- Deliberately aborted one fake comment request: draft retained, retry saved successfully.
- Reserved fake-email domains are rejected before account-email token/provider work, with a second provider guard and test. **No real emails were sent.** All three browser-test accounts and all integration fixtures were cleaned up; real accounts and history were unchanged.

## Remaining clarity notes

No unresolved blocker was found in the tested flows. Plans/templates still live under More, as established in Phase 1; that navigation was not redesigned. Notifications are explicitly labeled in-app. The PDF/photo import pipeline, coach workflows, native push delivery and physical-device Expo behavior were not re-audited in this phase and are not claimed as newly verified.
