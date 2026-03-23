# Headless Release Candidate Evidence

## APG coverage summary

- Component specs in `specs/components/*.md`: 30
- Implemented component modules in `src/<component>/index.ts`: 30
- Component tests in `src/<component>/*.test.ts`: 30
- Shared APG harness: `src/testing/apg-contract-harness.ts`
- Cross-component APG regression suite: `src/testing/apg-contracts.regression.test.ts`

Coverage focus for the newest tranche (HLS-131..HLS-134):

- `treegrid`: role/aria hierarchy metadata and keyboard transitions
- `feed`: role/aria stream metadata and paging keyboard contract
- `carousel`: role/aria-live semantics, control linkage, and rotation pause rules
- `window-splitter`: separator aria-value contract and orientation-aware keyboard resizing

## Release-ready checklist

- [x] `src/index.ts` exports include all implemented components
- [x] `README.md` implemented components list matches package surface
- [x] LSP diagnostics clean for changed source and test files
- [x] Package lint gates pass (`lint:types`, `lint:oxlint`, `lint:prettier`, `lint:boundaries`)
- [x] Package test gate passes (`vitest`)
- [x] APG contract helper and regression suite added

## Verification commands

- `npm run lint -w packages/headless`
- `npm run test -w packages/headless`
