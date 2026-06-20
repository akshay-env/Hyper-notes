## Architectural Rule: Atomic QML and JS
- Every QML file must describe exactly 1 component and contain 0 inline functions (except for signal handlers mandated by Qt such as \unction onFoo()\).
- Every JS logic file must export exactly 1 function and describe 0 components.
- When asked to implement a new feature:
  1. Check if the feature can be built by combining existing atomic JS and QML pieces.
  2. If new logic or UI is required, break it down into its fundamental atomic pieces first.
  3. Implement those new atomic pieces as isolated files (\scripts/...\ and \ui/...\).
  4. Combine the atomic pieces to create the final implementation.
  5. Never bundle multiple disparate functions into a single JS file or multiple distinct UI elements into a single large QML file.
