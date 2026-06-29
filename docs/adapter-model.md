# Adapter Model

Adapters are policy-safe output targets for coding agents or tools.

Default adapter privacy profile:

```json
{
  "allowRawSecret": false,
  "allowRawConfidential": false,
  "requiresEgressScan": true,
  "defaultModelTarget": "external_model"
}
```

Adapters must not read raw memory or build context by themselves. They receive Context Packages after memory hard gates, privacy filtering and egress scanning.
