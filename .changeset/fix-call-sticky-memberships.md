---
default: patch
---

Fix calls disconnecting on servers that use sticky memberships: the call now has permission to publish them, and sticky memberships also reach clients that sync with sliding sync.
