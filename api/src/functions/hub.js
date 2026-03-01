const { app } = require('@azure/functions');
const { getTable } = require('../shared/db');
const { verifyToken, jsonResponse } = require('../shared/auth');

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

      // Get experiment count (will be 0 until notebook is built)
      let experimentCount = 0, recentEntryCount = 0;
      try {
        const experimentsTable = await getTable('experiments');
        const experiments = experimentsTable.listEntities({ queryOptions: { filter: `PartitionKey eq '${userId}'` } });
        for await (const e of experiments) {
          experimentCount++;
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

      return jsonResponse(200, {
        inventory: {
          reagent_count: reagentCount,
          sample_count: sampleCount,
          low_stock_count: lowStockCount,
          expiring_count: expiringCount,
        },
        notebook: {
          experiment_count: experimentCount,
          recent_entry_count: recentEntryCount,
        }
      });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});
