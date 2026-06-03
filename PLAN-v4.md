# Lab Suite v4 Plan

Source: McKenzie's request list 2026-06-03. "Start with small tweaks and fixes before large stuff."

## TIER 1 — Small Tweaks & Fixes (do first)

1. **Move Projects left of Entries** in lab notebook sub-nav tabs. [Notebook.js]
2. **Reagent status shown in notebook lookup** — when looking up reagents in @-mention/notebook, show status. [Notebook.js, ExperimentDetail.js]
3. **Sample status shown in notebook lookup** — when looking up a sample, show status (stored / in use / depleted lower). [Notebook.js, ExperimentDetail.js]
4. **Default new entry type = Protocol**. [Notebook.js, ExperimentDetail.js]
5. **Sample create in entry: default to stored condition, no status prompt** — remove smart status modal; default newly linked samples to "stored". [Notebook.js, ExperimentDetail.js]
6. **Minimized entry shows hyperlink inline** — currently minimized view shows raw full URL; should render the hyperlink view in minimized state too. [Notebook.js, ExperimentDetail.js]
7. **Increase entry margins / reduce side whitespace** — widen content area. [CSS / Notebook.js / ExperimentDetail.js]
8. **Add entry search in Projects view (ProjectDetail)**. [ProjectDetail.js]
9. **Reset date button broken in entries view** — won't clear date when clicked. Fix. [Notebook.js / ExperimentDetail.js]
10. **Reset expiration date broken for reagents** — same clear bug. [Inventory.js / reagents]
11. **Can't delete accidentally-created replicate** — allow deleting replicates. [ProjectDetail.js / Experiments / experiments API]
12. **Sample experiment reflected in inventory** — when creating sample in an experiment, inventory manager shows experiment (currently only project). [Samples.js, samples API]
13. **Sample experiment dropdown: only experiments, filtered by project** — when inputting experiment for sample, only pull experiments (not projects); if project selected, only show that project's experiments. [Samples.js]
14. **Remove position from location**. [Storage.js, storage API]
15. **Hide catalog # and vendor # from reagent table view; remove Status column** (not useful in table). [Inventory.js]
16. **Reagent default filter = stored + in use; depleted only when selected**. [Inventory.js]
17. **Sample default filter = stored + in use; depleted only when selected** (mirror of above for samples). [Samples.js]
18. **Add notes/concentration fields to reagents** (antibodies, lab-made). [Inventory.js, reagents API]
19. **Depleted reagent auto-removes location**. [reagents API + Inventory.js]

## TIER 2 — Medium Features

20. **Experiment Conclusion section** — when experiment completed, add a Conclusion section. [ExperimentDetail.js, experiments API]
21. **Fail/archive replicates & experiments** — mark as failed (technical error etc.), removes from active count, archive/hide. [experiments API, ProjectDetail.js, Experiments.js]
22. **Soft delete / trash (1 week retention)** — deleted items held 1 week before permanent delete. Need a trash store + restore UI + cleanup job. [all APIs + new Trash view]
23. **Name sync** — renaming project/experiment syncs to linked samples; renaming sample/reagent syncs to notebook mentions. [projects/experiments/samples/reagents APIs]
24. **Flag samples not linked to any notebook entry**. [Samples.js, samples/notebook API]
25. **Sample history / additive updates** — add to existing sample (e.g. +2 brains into same tube) with history log instead of new item. [Samples.js, samples API]
26. **Hierarchical location (temperature → rack → box), collapsible** — cleaner display for loose items; cascading selectors when assigning location. [Storage.js, storage API, Inventory.js, Samples.js]
27. **Picture upload to reagents**. [Inventory.js, reagents API, blob storage]
28. **Auto-backup**. [API/storage export job]

## TIER 3 — Larger Features

29. **Notes page rebuild** — Notes is broken, do not use. Reorganize/rebuild. [Notes.js, notes API]
30. **Project completion flow** (future — TBD with McKenzie). [projects]
31. **Reagent usage timeline** — click reagent → timeline w/ dots of everywhere it's been used. [reagents API, Inventory.js]
32. **Reagent derivation** — mark reagent as dilution derived from a stock reagent; "permanently depleted" option. [reagents API, Inventory.js]
33. **Fly strain management tab** — input FlyBase links to pull allele/strain info. [new component + API + FlyBase scraping]

## Notes
- Soft-delete "hold onto where": new `trash` Azure Table (or `deleted` flag + deletedAt on existing entities). Decide before implementing #22.
- Backup target: decide (blob container / external).
