# @atlas/world-model

Experimental reality-check helpers for LMTI.

This package does not claim AGI or consciousness. It models a deterministic,
local-first boundary between:

```text
Memory belief <-> filtered observation <-> source/test/tool evidence
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

This package is experimental support code. Memory remains guidance, not truth;
source, tests, build output and explicit user instruction are stronger evidence.
