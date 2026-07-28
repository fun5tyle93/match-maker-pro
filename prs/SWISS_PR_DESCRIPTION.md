# Swiss System: No-Rematch, Referee Balancing, BYE handling, Playoff Seeding

This PR implements the Swiss-system pairing and admin features discussed, including unit tests and export/history integration.

Summary of changes
- Strictly disallow rematches in Swiss pairings; pairing will throw an error if a rematch-free assignment is impossible (rare).
- BYE (freilos) assignment for odd player counts: assigned to the currently worst-ranked player who hasn't yet had a BYE (hasHadBye flag). When removing a round, BYE flags are rolled back.
- Referee mode: pairs players into two passes (pass1/pass2) by rank: P1->pass1 table1, P2->pass2 table1, P3->pass1 table2, ... continuing. Rematches are prevented across passes as well.
- Playoff seeding: standard seed order ensures seed #1 and seed #2 are placed in different halves (they meet earliest in the final).
- UI: SchweizSystem page updated to init hasHadBye flags, set/rollback BYE flags, button and confirm dialog to remove the most recently generated round (only allowed when no matches in that round are completed), export buttons for XLSX/PDF reusing existing export utilities, and persistence to history on transfer.
- Types: added hasHadBye and related fields to Swiss types.
- Tests: Vitest tests for pairing (no rematches), BYE allocation and playoff seeding.

How to test locally
1. git fetch && git checkout feature/swiss-no-rematch
2. npm ci
3. npm test
4. npm run dev and exercise the Schweizer System page as an admin:
   - Create a Swiss session with N players and generate rounds
   - Verify no rematches occur
   - For odd N, verify BYE assignment rules (no double BYE for the same player)
   - Try removing a just-created round (Confirm dialog) — should work only if no results recorded; BYE flags are rolled back
   - Start Playoff (if configured) and verify seeding (seed 1 & 2 in different halves)
   - Use Export XLSX / Export PDF in the admin toolbar to verify exports

Files changed (high level)
- src/lib/swissPairing.ts (new/modified): core pairing logic, referee balancing, playoff seeding
- src/pages/SchweizSystem.tsx (modified): UI wiring, remove round, export buttons
- src/pages/swissHelpers.ts (new): conversion + export + history helpers
- src/lib/__tests__/swissPairing.test.ts (new): Vitest tests
- src/types/index.ts (modified): Player.hasHadBye
- src/types/swiss.ts (modified): Swiss types updated
- package.json (modified): vitest + testing libs + test script

If you'd like I can also open the PR description with a checklist for reviewers and leave comments on files that need a closer look. Otherwise I'll create the PR now.
