# Animation plans

From an audit of the home page's motion at commit `0b9f508`. Each plan stands on its own. None depends on another, and no two edit the same lines.

| #   | Plan                                                                                                                   | Severity | File                     | Status |
| --- | ---------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------ | ------ |
| 001 | [Stop the previous response typing in when Send is pressed again](001-stop-stale-response-typing.md)                   | HIGH     | `src/lib/Request.svelte` | DONE   |
| 002 | [Announce the response once, not every chunk typed in](002-announce-response-once.md)                                  | MEDIUM   | `src/lib/Request.svelte` | DONE   |
| 003 | [Slow the field-goal cable strobe below three flashes a second](003-slow-field-goal-strobe.md)                         | MEDIUM   | `src/lib/Scene.svelte`   | DONE*  |
| 004 | [Let a swipe over the bridge scroll the page unless it lands on a vehicle](004-let-the-page-scroll-over-the-bridge.md) | MEDIUM   | `src/lib/Scene.svelte`   | DONE*  |
| 005 | [Heal the header's cloud wake by elapsed time, not by frames](005-heal-the-cloud-by-time.md)                           | MEDIUM   | `src/lib/Scene.svelte`   | DONE*  |
| 006 | [Give Send and Copy a press response, mirrored in the reflection](006-send-button-press-feedback.md)                   | MEDIUM   | `src/lib/Request.svelte` | DONE*  |

\* Code is in place. Still to check by hand: 004 on a real phone, 005 on a 120Hz screen plus the Safari profile, 003 recorded at 60fps, and 006 pressed by hand (including on an iPhone, where `:active` may need a touch listener).

## Recommended order

1. **003**: a two-line change, and the only finding with a safety angle.
2. **001**: the one visible bug.
3. **002**: also in `Request.svelte`. Do it after 001 to avoid conflicts in that file.
4. **004**: needs a real phone to verify.
5. **005**: needs a 120Hz screen to verify. It also includes the Safari profiling that decides whether a filter-performance plan is needed.
6. **006**: added later, after "the Send button isn't confirming my click". It doesn't depend on any other plan, and only edits CSS in `Request.svelte`.

## Not planned (from the same audit)

- The render loop never pauses: not under reduced motion, and not when the scene has scrolled off screen on a phone. `drawSea` also creates new arrays every frame (`src/lib/Scene.svelte:1586`, `:691`). Profile before planning.
- `still` is read once when the scene mounts (`src/lib/Scene.svelte:127`), so changing the reduced-motion setting only applies after a reload.
- The reflection's SVG `<animate>` repaints the filter every frame (`src/lib/Request.svelte:151`).
- On a fast response, Send starts dimming and then snaps back to full opacity (`src/lib/Request.svelte:266`). 006 makes the press itself the confirmation instead.
