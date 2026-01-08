# Testing Pattern: Required Spy That Must Be Used

Problem scenario:
- Home rendering immediately pivots away from Internal.* BobFlow scenarios because deriveNextScenarioFromFollowupSnapshot drives the live view to the true follow-up snapshot scenario.
- A subset of tests deliberately lock the Internal.* surface to keep the recommendation card or onboarding state visible, so they stub the deriveNextScenarioFromFollowupSnapshot helper to prevent that pivot.
- Without the stub, the helper runs, the recommendation card disappears, and the test no longer exercises the intended state, making the assertion invalid.

- Canonical solution:
- When a spy exists solely to stabilize the rendered scenario, the test must explicitly assert that the spy was invoked, even though it is not part of the feature being validated.
- Asserting the spy documents the tester's intent to keep the Internal.* surface alive and satisfies lint rules that would otherwise flag the unused mock.
- This check is intentional and required rather than incidental: it proves that the stabilization helper was engaged, not simply left lingering.

Illustrative snippet description:
A test spies on deriveNextScenarioFromFollowupSnapshot, forces it to return null, asserts toHaveBeenCalled, and restores the spy so the stabilization intent stays clear without leaking to other tests.

Why this is correct:
- Determinism: locking the spy and asserting its execution eliminates nondeterministic pivots driven by follow-up snapshots.
- Architectural intent: the Home test explicitly acknowledges that the live logic would redirect to deriveNextScenarioFromFollowupSnapshot, so mocking it is a deliberate override.
- It avoids fragile snapshot manipulation or disabling ESLint rules that would otherwise hide the fact that the helper is mocked only to suppress behavior.

What not to do:
- Remove the spy; that reintroduces the nondeterministic transition and breaks the recommendation-card scenario.
- Manipulate snapshot data just to sidestep the helper, as that obscures why the Internal.* surface is required in the first place.
- Silence lint warnings instead of asserting the spy's invocation, because the test would then carry hidden dependencies.

Rule of thumb:
If a helper must be mocked to prevent behavior rather than assert behavior, the test must assert that the mock was used.

This pattern is canonical for Home + BobFlow tests and must be followed for any future scenario-stabilization mocks.
