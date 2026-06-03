const { app } = require('@azure/functions');
const { getTable } = require('../shared/db');
const { verifyToken, jsonResponse } = require('../shared/auth');
const { predict } = require('../shared/flyDev');

// GET /api/hub/summary
app.http('hubSummary', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'hub/summary',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const userId = decoded.id;

      // Get reagent stats
      const reagentsTable = await getTable('reagents');
      let reagentCount = 0, lowStockCount = 0, expiringCount = 0;
      const now = new Date();
      const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const reagents = reagentsTable.listEntities({ queryOptions: { filter: `PartitionKey eq '${userId}'` } });
      for await (const r of reagents) {
        reagentCount++;
        if (r.isLowStock === true || r.isLowStock === 'true') lowStockCount++;
        if (r.expirationDate) {
          const exp = new Date(r.expirationDate);
          if (exp <= thirtyDaysOut) expiringCount++;
        }
      }

      // Get sample count
      const samplesTable = await getTable('samples');
      let sampleCount = 0;
      const samples = samplesTable.listEntities({ queryOptions: { filter: `PartitionKey eq '${userId}'` } });
      for await (const s of samples) {
        sampleCount++;
      }

      // Get project & experiment counts
      let projectCount = 0, experimentCount = 0, recentEntryCount = 0;
      try {
        const experimentsTable = await getTable('experiments');
        const experiments = experimentsTable.listEntities({ queryOptions: { filter: `PartitionKey eq '${userId}'` } });
        for await (const e of experiments) {
          if (!e.projectId) {
            projectCount++;
          } else {
            experimentCount++;
          }
        }

        // Get entries from last 7 days
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const entriesTable = await getTable('notebookentries');
        const entries = entriesTable.listEntities({ queryOptions: { filter: `PartitionKey eq '${userId}'` } });
        for await (const entry of entries) {
          if (entry.createdAt >= sevenDaysAgo) recentEntryCount++;
        }
      } catch (e) {
        // Tables may not exist yet — that's fine
      }

      // Fly tubes + attention count
      let tubeCount = 0, attentionCount = 0;
      try {
        const boxesTable = await getTable('flyboxes');
        const boxTemp = {};
        const boxes = boxesTable.listEntities({ queryOptions: { filter: `PartitionKey eq '${userId}'` } });
        for await (const b of boxes) boxTemp[b.rowKey] = b.temperature != null ? Number(b.temperature) : 22;

        const obsByVial = {};
        const obsTable = await getTable('flyobservations');
        const allObs = obsTable.listEntities();
        for await (const o of allObs) {
          (obsByVial[o.partitionKey] = obsByVial[o.partitionKey] || []).push({ observed_at: o.observedAt, stage_seen: o.stageSeen });
        }

        const vialsTable = await getTable('flyvials');
        const vials = vialsTable.listEntities({ queryOptions: { filter: `PartitionKey eq '${userId}'` } });
        for await (const e of vials) {
          const status = e.status || 'active';
          if (status === 'archived' || status === 'discarded') continue;
          tubeCount++;
          const type = e.vialType || 'cross';
          if (type === 'stock') {
            if (e.nextFlipDate) {
              const days = Math.ceil((new Date(e.nextFlipDate + 'T12:00:00') - now) / 86400000);
              if (days <= 3) attentionCount++;
            }
          } else {
            const v = { start_date: e.startDate, target_stage: e.targetStage || 'L3', type: 'cross' };
            const p = predict(v, boxTemp[e.boxId] != null ? boxTemp[e.boxId] : 22, obsByVial[e.rowKey] || []);
            if ((p.eta_to_target_days != null && p.eta_to_target_days <= 1.5 && p.eta_to_target_days >= -2) ||
                (p.clear_parents_in_days != null && p.clear_parents_in_days <= 2 && p.clear_parents_in_days >= -3)) {
              attentionCount++;
            }
          }
        }
      } catch (e) { /* tables may not exist yet */ }

      return jsonResponse(200, {
        inventory: {
          reagent_count: reagentCount,
          sample_count: sampleCount,
          low_stock_count: lowStockCount,
          expiring_count: expiringCount,
        },
        notebook: {
          project_count: projectCount,
          experiment_count: experimentCount,
          recent_entry_count: recentEntryCount,
        },
        flies: {
          tube_count: tubeCount,
          attention_count: attentionCount,
        }
      });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});
