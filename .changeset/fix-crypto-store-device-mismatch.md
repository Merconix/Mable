---
default: patch
---

Fix devices randomly becoming unverified after a forced sign-out: encryption keys left behind by a previous session on the same account no longer block sign-in, and that session now starts its own device scoped store.
