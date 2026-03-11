const { app } = require('@azure/functions');
const { v4: uuidv4 } = require('uuid');
const { getTable } = require('../shared/db');
const { verifyToken, jsonResponse } = require('../shared/auth');

// Helper: format project entity (same table as experiments, but no projectId)
function formatProject(entity) {
  return {
    id: entity.rowKey,
    title: entity.title || '',
    description: entity.description || '',
    purpose: entity.purpose || '',
    hypothesis: entity.hypothesis || '',
    strains: entity.strains ? JSON.parse(entity.strains) : [],
    controls: entity.controls ? JSON.parse(entity.controls) : [],
    scratch_pad: entity.scratchPad || '',
    status: entity.status || 'active',
    tags: entity.tags || '',
    created_at: entity.createdAt,
    updated_at: entity.updatedAt
  };
}

// Helper: format experiment entity (has projectId)
function formatExperiment(entity) {
  return {
    id: entity.rowKey,
    project_id: entity.projectId || null,
    title: entity.title || '',
    description: entity.description || '',
    status: entity.status || 'active',
    tags: entity.tags || '',
    created_at: entity.createdAt,
    updated_at: entity.updatedAt
  };
}

// Helper: format replicate
function formatReplicate(entity) {
  return {
    id: entity.rowKey,
    experiment_id: entity.experimentId,
    replicate_number: entity.replicateNumber || 1,
    start_date: entity.startDate || entity.createdAt,
    last_updated: entity.lastUpdated || entity.createdAt,
    notes: entity.notes || '',
    created_at: entity.createdAt
  };
}

// ==================== PROJECTS ====================

// GET /api/projects
app.http('projectsGet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'projects',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const table = await getTable('experiments');
      const projects = [];
      const experimentCounts = {};
      
      const entities = table.listEntities({ queryOptions: { filter: `PartitionKey eq '${decoded.id}'` } });
      for await (const entity of entities) {
        if (!entity.projectId) {
          // This is a project (top-level)
          projects.push(formatProject(entity));
        } else {
          // This is an experiment — count per project
          experimentCounts[entity.projectId] = (experimentCounts[entity.projectId] || 0) + 1;
        }
      }

      // Get replicate counts per experiment
      let replicateCounts = {};
      try {
        const repTable = await getTable('replicates');
        const reps = repTable.listEntities({ queryOptions: { filter: `PartitionKey eq '${decoded.id}'` } });
        for await (const r of reps) {
          replicateCounts[r.experimentId] = (replicateCounts[r.experimentId] || 0) + 1;
        }
      } catch (e) { /* table may not exist */ }

      // Attach experiment_count to each project
      projects.forEach(p => {
        p.experiment_count = experimentCounts[p.id] || 0;
      });

      projects.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
      return jsonResponse(200, projects);
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// GET /api/projects/{id}
app.http('projectsGetOne', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'projects/{id}',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const id = req.params.id;
      const table = await getTable('experiments');

      let projectEntity;
      try {
        projectEntity = await table.getEntity(decoded.id, id);
      } catch (e) {
        return jsonResponse(404, { error: 'Project not found' });
      }

      const project = formatProject(projectEntity);

      // Get experiments for this project
      const experiments = [];
      const allEntities = table.listEntities({ queryOptions: { filter: `PartitionKey eq '${decoded.id}'` } });
      for await (const entity of allEntities) {
        if (entity.projectId === id) {
          experiments.push(formatExperiment(entity));
        }
      }

      // Get replicate counts per experiment
      let replicatesMap = {};
      try {
        const repTable = await getTable('replicates');
        const reps = repTable.listEntities({ queryOptions: { filter: `PartitionKey eq '${decoded.id}'` } });
        for await (const r of reps) {
          if (!replicatesMap[r.experimentId]) replicatesMap[r.experimentId] = [];
          replicatesMap[r.experimentId].push(formatReplicate(r));
        }
      } catch (e) { /* table may not exist */ }

      // Attach replicate info to experiments
      experiments.forEach(exp => {
        const reps = replicatesMap[exp.id] || [];
        reps.sort((a, b) => b.replicate_number - a.replicate_number); // most recent first
        exp.replicates = reps;
        exp.replicate_count = reps.length;
      });

      experiments.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));

      project.experiments = experiments;
      project.experiment_count = experiments.length;

      return jsonResponse(200, project);
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// POST /api/projects
app.http('projectsCreate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'projects',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const body = await req.json();
      if (!body.title) return jsonResponse(400, { error: 'Title is required' });

      const table = await getTable('experiments');
      const id = uuidv4();
      const now = new Date().toISOString();

      const entity = {
        partitionKey: decoded.id,
        rowKey: id,
        title: body.title,
        status: body.status || 'active',
        createdAt: now,
        updatedAt: now
        // No projectId — this makes it a project, not an experiment
      };
      if (body.description) entity.description = body.description;
      if (body.tags) entity.tags = body.tags;
      if (body.purpose) entity.purpose = body.purpose;
      if (body.hypothesis) entity.hypothesis = body.hypothesis;
      if (body.strains && body.strains.length > 0) entity.strains = JSON.stringify(body.strains);
      if (body.controls && body.controls.length > 0) entity.controls = JSON.stringify(body.controls);

      await table.createEntity(entity);

      const project = formatProject(entity);
      project.experiment_count = 0;
      project.experiments = [];
      return jsonResponse(201, project);
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// PUT /api/projects/{id}
app.http('projectsUpdate', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'projects/{id}',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const id = req.params.id;
      const body = await req.json();
      const table = await getTable('experiments');

      let existing;
      try {
        existing = await table.getEntity(decoded.id, id);
      } catch (e) {
        return jsonResponse(404, { error: 'Project not found' });
      }

      const now = new Date().toISOString();
      const updated = {
        partitionKey: decoded.id,
        rowKey: id,
        title: (body.title !== undefined ? body.title : existing.title) || '',
        status: (body.status !== undefined ? body.status : existing.status) || 'active',
        createdAt: existing.createdAt || now,
        updatedAt: now
      };

      const desc = body.description !== undefined ? body.description : (existing.description || '');
      const tgs = body.tags !== undefined ? body.tags : (existing.tags || '');
      const purpose = body.purpose !== undefined ? body.purpose : (existing.purpose || '');
      const hypothesis = body.hypothesis !== undefined ? body.hypothesis : (existing.hypothesis || '');
      const scratchPad = body.scratch_pad !== undefined ? body.scratch_pad : (existing.scratchPad || '');

      if (desc) updated.description = desc;
      if (tgs) updated.tags = tgs;
      if (purpose) updated.purpose = purpose;
      if (hypothesis) updated.hypothesis = hypothesis;
      if (scratchPad) updated.scratchPad = scratchPad;

      if (body.strains !== undefined) {
        if (body.strains && body.strains.length > 0) updated.strains = JSON.stringify(body.strains);
      } else if (existing.strains) {
        updated.strains = existing.strains;
      }

      if (body.controls !== undefined) {
        if (body.controls && body.controls.length > 0) updated.controls = JSON.stringify(body.controls);
      } else if (existing.controls) {
        updated.controls = existing.controls;
      }

      await table.updateEntity(updated, 'Replace');
      return jsonResponse(200, formatProject(updated));
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// DELETE /api/projects/{id}
app.http('projectsDelete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'projects/{id}',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const id = req.params.id;
      const table = await getTable('experiments');

      try {
        await table.getEntity(decoded.id, id);
      } catch (e) {
        return jsonResponse(404, { error: 'Project not found' });
      }

      // Delete all experiments under this project
      const allEntities = table.listEntities({ queryOptions: { filter: `PartitionKey eq '${decoded.id}'` } });
      const experimentIds = [];
      for await (const entity of allEntities) {
        if (entity.projectId === id) {
          experimentIds.push(entity.rowKey);
          await table.deleteEntity(decoded.id, entity.rowKey);
        }
      }

      // Delete all replicates for those experiments
      try {
        const repTable = await getTable('replicates');
        const reps = repTable.listEntities({ queryOptions: { filter: `PartitionKey eq '${decoded.id}'` } });
        for await (const r of reps) {
          if (experimentIds.includes(r.experimentId)) {
            await repTable.deleteEntity(decoded.id, r.rowKey);
          }
        }
      } catch (e) { /* table may not exist */ }

      // Delete all notebook entries for this project's experiments
      try {
        const entriesTable = await getTable('notebookentries');
        const entries = entriesTable.listEntities({ queryOptions: { filter: `PartitionKey eq '${decoded.id}'` } });
        for await (const entry of entries) {
          if (entry.projectId === id || experimentIds.includes(entry.experimentId)) {
            try {
              const historyTable = await getTable('entryhistory');
              const history = historyTable.listEntities({ queryOptions: { filter: `PartitionKey eq '${entry.rowKey}'` } });
              for await (const h of history) {
                await historyTable.deleteEntity(h.partitionKey, h.rowKey);
              }
            } catch (e) { /* ok */ }
            await entriesTable.deleteEntity(entry.partitionKey, entry.rowKey);
          }
        }
      } catch (e) { /* ok */ }

      // Delete the project itself
      await table.deleteEntity(decoded.id, id);
      return jsonResponse(200, { success: true });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// ==================== EXPERIMENTS (under projects) ====================

// POST /api/projects/{id}/experiments
app.http('projectExperimentsCreate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'projects/{id}/experiments',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const projectId = req.params.id;
      const body = await req.json();
      if (!body.title) return jsonResponse(400, { error: 'Title is required' });

      // Verify project exists
      const table = await getTable('experiments');
      try {
        await table.getEntity(decoded.id, projectId);
      } catch (e) {
        return jsonResponse(404, { error: 'Project not found' });
      }

      const id = uuidv4();
      const now = new Date().toISOString();

      const entity = {
        partitionKey: decoded.id,
        rowKey: id,
        projectId: projectId,
        title: body.title,
        status: body.status || 'active',
        createdAt: now,
        updatedAt: now
      };
      if (body.description) entity.description = body.description;
      if (body.tags) entity.tags = body.tags;

      await table.createEntity(entity);

      const experiment = formatExperiment(entity);
      experiment.replicates = [];
      experiment.replicate_count = 0;
      return jsonResponse(201, experiment);
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// GET /api/projects/{projectId}/experiments/{expId}
app.http('projectExperimentGetOne', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'projects/{projectId}/experiments/{expId}',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const { projectId, expId } = req.params;
      const table = await getTable('experiments');

      let entity;
      try {
        entity = await table.getEntity(decoded.id, expId);
      } catch (e) {
        return jsonResponse(404, { error: 'Experiment not found' });
      }

      if (entity.projectId !== projectId) {
        return jsonResponse(404, { error: 'Experiment not found in this project' });
      }

      const experiment = formatExperiment(entity);

      // Get replicates
      let replicates = [];
      try {
        const repTable = await getTable('replicates');
        const reps = repTable.listEntities({ queryOptions: { filter: `PartitionKey eq '${decoded.id}'` } });
        for await (const r of reps) {
          if (r.experimentId === expId) {
            replicates.push(formatReplicate(r));
          }
        }
      } catch (e) { /* table may not exist */ }

      replicates.sort((a, b) => b.replicate_number - a.replicate_number);
      experiment.replicates = replicates;
      experiment.replicate_count = replicates.length;

      // Get project title
      try {
        const projectEntity = await table.getEntity(decoded.id, projectId);
        experiment.project_title = projectEntity.title || '';
      } catch (e) { /* ok */ }

      return jsonResponse(200, experiment);
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// PUT /api/projects/{projectId}/experiments/{expId}
app.http('projectExperimentUpdate', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'projects/{projectId}/experiments/{expId}',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const { expId } = req.params;
      const body = await req.json();
      const table = await getTable('experiments');

      let existing;
      try {
        existing = await table.getEntity(decoded.id, expId);
      } catch (e) {
        return jsonResponse(404, { error: 'Experiment not found' });
      }

      const now = new Date().toISOString();
      const updated = {
        partitionKey: decoded.id,
        rowKey: expId,
        projectId: existing.projectId,
        title: (body.title !== undefined ? body.title : existing.title) || '',
        status: (body.status !== undefined ? body.status : existing.status) || 'active',
        createdAt: existing.createdAt || now,
        updatedAt: now
      };

      const desc = body.description !== undefined ? body.description : (existing.description || '');
      const tgs = body.tags !== undefined ? body.tags : (existing.tags || '');
      if (desc) updated.description = desc;
      if (tgs) updated.tags = tgs;

      await table.updateEntity(updated, 'Replace');
      return jsonResponse(200, formatExperiment(updated));
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// DELETE /api/projects/{projectId}/experiments/{expId}
app.http('projectExperimentDelete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'projects/{projectId}/experiments/{expId}',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const { expId } = req.params;
      const table = await getTable('experiments');

      try {
        await table.getEntity(decoded.id, expId);
      } catch (e) {
        return jsonResponse(404, { error: 'Experiment not found' });
      }

      // Delete replicates
      try {
        const repTable = await getTable('replicates');
        const reps = repTable.listEntities({ queryOptions: { filter: `PartitionKey eq '${decoded.id}'` } });
        for await (const r of reps) {
          if (r.experimentId === expId) {
            await repTable.deleteEntity(decoded.id, r.rowKey);
          }
        }
      } catch (e) { /* ok */ }

      // Delete notebook entries
      try {
        const entriesTable = await getTable('notebookentries');
        const entries = entriesTable.listEntities({ queryOptions: { filter: `PartitionKey eq '${decoded.id}'` } });
        for await (const entry of entries) {
          if (entry.experimentId === expId) {
            try {
              const historyTable = await getTable('entryhistory');
              const history = historyTable.listEntities({ queryOptions: { filter: `PartitionKey eq '${entry.rowKey}'` } });
              for await (const h of history) {
                await historyTable.deleteEntity(h.partitionKey, h.rowKey);
              }
            } catch (e) { /* ok */ }
            await entriesTable.deleteEntity(entry.partitionKey, entry.rowKey);
          }
        }
      } catch (e) { /* ok */ }

      await table.deleteEntity(decoded.id, expId);
      return jsonResponse(200, { success: true });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// ==================== REPLICATES ====================

// POST /api/experiments/{expId}/replicates
app.http('replicatesCreate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'experiments/{expId}/replicates',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const expId = req.params.expId;
      const body = await req.json().catch(() => ({}));

      // Verify experiment exists
      const expTable = await getTable('experiments');
      try {
        await expTable.getEntity(decoded.id, expId);
      } catch (e) {
        return jsonResponse(404, { error: 'Experiment not found' });
      }

      // Count existing replicates to determine number
      const repTable = await getTable('replicates');
      let maxNum = 0;
      try {
        const existing = repTable.listEntities({ queryOptions: { filter: `PartitionKey eq '${decoded.id}'` } });
        for await (const r of existing) {
          if (r.experimentId === expId) {
            maxNum = Math.max(maxNum, r.replicateNumber || 0);
          }
        }
      } catch (e) { /* table may not exist yet */ }

      const id = uuidv4();
      const now = new Date().toISOString();

      const entity = {
        partitionKey: decoded.id,
        rowKey: id,
        experimentId: expId,
        replicateNumber: maxNum + 1,
        startDate: body.start_date || now.split('T')[0],
        lastUpdated: now,
        createdAt: now
      };
      if (body.notes) entity.notes = body.notes;

      await repTable.createEntity(entity);

      return jsonResponse(201, formatReplicate(entity));
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// DELETE /api/experiments/{expId}/replicates/{repId}
app.http('replicatesDelete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'experiments/{expId}/replicates/{repId}',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const { repId } = req.params;
      const repTable = await getTable('replicates');

      try {
        await repTable.getEntity(decoded.id, repId);
      } catch (e) {
        return jsonResponse(404, { error: 'Replicate not found' });
      }

      // Unlink notebook entries from this replicate (set replicateId to empty)
      try {
        const entriesTable = await getTable('notebookentries');
        const entries = entriesTable.listEntities({ queryOptions: { filter: `PartitionKey eq '${decoded.id}'` } });
        for await (const entry of entries) {
          if (entry.replicateId === repId) {
            entry.replicateId = '';
            entry.updatedAt = new Date().toISOString();
            await entriesTable.updateEntity(entry, 'Merge');
          }
        }
      } catch (e) { /* ok */ }

      await repTable.deleteEntity(decoded.id, repId);
      return jsonResponse(200, { success: true });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});
