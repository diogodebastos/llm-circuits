# Screenshots

Drop hero images here. The repo README references:

- `hero.png` — `groundedVote` preset mid-run (one branch grounded out, two surviving, judge active).
- `physics-budget.png` — parallel preset in `physics` mode showing per-branch `max_tokens` derived from conductance.

Capture flow:

1. `npm run wrangler:remote` (real Workers AI).
2. Load the relevant preset, hit "⚡ Apply Current".
3. Wait for at least one node to flip to the running/done state.
4. Screenshot the canvas + result panel together (Cmd+Shift+4 on macOS, then drag).
5. Save into this folder with the names above. PNG, ~1600px wide.

The README will pick them up automatically.
