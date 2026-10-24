# @project/reatom-vue

Private, source-only Reatom binding for Vue. `useAtom` exposes an atom, computed or selector as a readonly Vue
shallow ref, subscribing in the setup Reatom frame and unsubscribing when its Vue scope stops.

Tests currently run through `vp test` in `backend/admin-ui` (`bun run test` on the CI runner).
