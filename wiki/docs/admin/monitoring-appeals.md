# Monitoring appeals

> :material-pencil-outline: **Stub.** Filled when Phase B's admin UI ships, lit up fully when v0.1 customer app launches.

The appeals dashboard surfaces:

- **List view** of all appeals, filterable by status (`draft` / `ready` / `sent` / `resolved`) and outcome (`cancelled` / `rejected` / `pending`).
- **Detail view** per appeal: photos, notes, drafted letter, payment, submission attempts, council response.
- **Status override** — manual reclassification when a user reports a council outcome.
- **Quality metrics** — acceptance rate per council per contravention code; AI cost per appeal; time-to-letter.
- **Service-failure queue** — appeals where our system failed to deliver (generation crashed, payment taken but no appeal produced, portal unreachable for >24h). Eligible for an exceptional refund. Distinct from outcome refunds, which we don't offer.

**TODO**: KPI dashboard, council-by-council acceptance rates, AI quality regression alerts.
