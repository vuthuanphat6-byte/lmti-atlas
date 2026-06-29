# @atlas/world-model

Reality Boundary and resource-bounded active inference for LMTI.

This package does not claim AGI or consciousness. It models a deterministic,
local-first boundary between:

```text
Internal Model <-> Markov Blanket <-> External World
```

The world model never executes tools and never reads raw stores directly. It
accepts sensory inputs from callers, filters them through a Markov Blanket,
estimates compute cost, updates beliefs against observations, runs reality
checks and proposes policy-safe next actions.

Core APIs:

* `createMarkovBlanketState`
* `estimateInformationDensity`
* `estimateComputeCost`
* `updateBeliefBayesian`
* `alignBeliefsWithObservations`
* `proposeActiveInferenceActions`
* `checkRealityAlignment`
* `runWorldModelCycle`

Secret-like sensory input is redacted and marked `do_not_prompt`.
