const { app } = require('@azure/functions');
const { v4: uuidv4 } = require('uuid');
const { getTable } = require('../shared/db');
const { verifyToken, jsonResponse } = require('../shared/auth');

// GET /api/catalog
app.http('catalogGet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'catalog',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const search = req.query.get('search');
      const table = await getTable('catalog');
      let items = [];
      const entities = table.listEntities({ queryOptions: { filter: "PartitionKey eq 'shared'" } });
      for await (const entity of entities) {
        items.push({
          id: entity.rowKey,
          name: entity.name,
          catalog_number: entity.catalogNumber || null,
          vendor: entity.vendor || null,
          source_url: entity.sourceUrl || null,
          description: entity.description || null,
          added_by: entity.addedBy || null,
          created_at: entity.createdAt
        });
      }

      if (search) {
        const s = search.toLowerCase();
        items = items.filter(i =>
          (i.name || '').toLowerCase().includes(s) ||
          (i.catalog_number || '').toLowerCase().includes(s) ||
          (i.vendor || '').toLowerCase().includes(s)
        );
      }

      items.sort((a, b) => (a.vendor || '').localeCompare(b.vendor || '') || (a.name || '').localeCompare(b.name || ''));
      return jsonResponse(200, items);
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// POST /api/catalog — add manually
app.http('catalogCreate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'catalog',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const body = await req.json();
      if (!body.name) return jsonResponse(400, { error: 'Name is required' });

      const table = await getTable('catalog');
      const id = uuidv4();
      const entity = {
        partitionKey: 'shared',
        rowKey: id,
        name: body.name,
        catalogNumber: body.catalog_number || '',
        vendor: body.vendor || '',
        sourceUrl: body.source_url || '',
        description: body.description || '',
        addedBy: decoded.email || '',
        createdAt: new Date().toISOString()
      };

      await table.createEntity(entity);

      return jsonResponse(201, {
        id, name: entity.name, catalog_number: entity.catalogNumber || null,
        vendor: entity.vendor || null, source_url: entity.sourceUrl || null,
        description: entity.description || null, added_by: entity.addedBy,
        created_at: entity.createdAt
      });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// POST /api/catalog/scrape — scrape from URL
app.http('catalogScrape', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'catalog/scrape',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const body = await req.json();
      const url = body.url;
      if (!url) return jsonResponse(400, { error: 'URL is required' });

      // Fetch the page
      let html = '';
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; LabInventory/1.0)',
            'Accept': 'text/html'
          },
          redirect: 'follow'
        });
        html = await response.text();
      } catch (e) {
        return jsonResponse(400, { error: 'Failed to fetch URL: ' + e.message });
      }

      // Extract product info from HTML
      const info = scrapeProductInfo(html, url);

      // Return scraped info for user to review before saving
      return jsonResponse(200, {
        scraped: true,
        name: info.name,
        catalog_number: info.catalogNumber,
        vendor: info.vendor,
        source_url: url,
        description: info.description
      });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// DELETE /api/catalog/{id}
app.http('catalogDelete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'catalog/{id}',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const id = req.params.id;
      const table = await getTable('catalog');

      try {
        await table.getEntity('shared', id);
      } catch (e) {
        return jsonResponse(404, { error: 'Catalog item not found' });
      }

      await table.deleteEntity('shared', id);
      return jsonResponse(200, { success: true });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// Helper: scrape product info from HTML
function scrapeProductInfo(html, url) {
  const info = { name: '', catalogNumber: '', vendor: '', description: '' };

  // Detect vendor from URL
  const urlLower = url.toLowerCase();
  if (urlLower.includes('thermofisher.com') || urlLower.includes('invitrogen')) {
    info.vendor = 'Thermo Fisher Scientific';
  } else if (urlLower.includes('sigmaaldrich.com') || urlLower.includes('emdmillipore')) {
    info.vendor = 'Sigma-Aldrich';
  } else if (urlLower.includes('abcam.com')) {
    info.vendor = 'Abcam';
  } else if (urlLower.includes('cellsignal.com') || urlLower.includes('cst')) {
    info.vendor = 'Cell Signaling Technology';
  } else if (urlLower.includes('bio-rad.com')) {
    info.vendor = 'Bio-Rad';
  } else if (urlLower.includes('biolegend.com')) {
    info.vendor = 'BioLegend';
  } else if (urlLower.includes('r-dsystems.com') || urlLower.includes('rndsystems')) {
    info.vendor = 'R&D Systems';
  } else if (urlLower.includes('neb.com') || urlLower.includes('newenglandbiolabs')) {
    info.vendor = 'New England Biolabs';
  } else if (urlLower.includes('promega.com')) {
    info.vendor = 'Promega';
  } else if (urlLower.includes('qiagen.com')) {
    info.vendor = 'Qiagen';
  } else if (urlLower.includes('takara') || urlLower.includes('clontech')) {
    info.vendor = 'Takara Bio';
  }

  // Try to extract product name from title tag
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    let title = titleMatch[1].trim();
    // Clean up common suffixes
    title = title.replace(/\s*\|.*$/, '').replace(/\s*-\s*(Thermo Fisher|Sigma|Abcam|Bio-Rad).*$/i, '').trim();
    // Remove "Buy Online" type text
    title = title.replace(/\s*Buy\s+Online.*$/i, '').trim();
    info.name = title;
  }

  // Try to extract catalog number from URL path (last segment after product/catalog/item)
  const pathMatch = url.match(/(?:product|catalog|item)\/([A-Z0-9\-]+)$/i) ||
                    url.match(/(?:product|catalog|item)\/[^\/]+\/([A-Z0-9\-]+)/i);
  if (pathMatch) {
    info.catalogNumber = pathMatch[1];
  }

  // For Thermo Fisher: catalog # is the last path segment
  if (urlLower.includes('thermofisher.com')) {
    const lastSegment = url.split('/').pop().split('?')[0];
    if (lastSegment && /^[A-Z0-9\-]+$/i.test(lastSegment)) {
      info.catalogNumber = lastSegment;
    }
  }

  // Try og:title for better product name
  const ogTitleMatch = html.match(/<meta\s+(?:property|name)="og:title"\s+content="([^"]+)"/i) ||
                       html.match(/<meta\s+content="([^"]+)"\s+(?:property|name)="og:title"/i);
  if (ogTitleMatch) {
    let ogTitle = ogTitleMatch[1].trim();
    ogTitle = ogTitle.replace(/\s*\|.*$/, '').replace(/\s*-\s*(Thermo Fisher|Sigma|Abcam|Bio-Rad).*$/i, '').trim();
    if (ogTitle.length > 5) info.name = ogTitle;
  }

  // Try og:description for description
  const ogDescMatch = html.match(/<meta\s+(?:property|name)="og:description"\s+content="([^"]+)"/i) ||
                      html.match(/<meta\s+content="([^"]+)"\s+(?:property|name)="og:description"/i);
  if (ogDescMatch) {
    info.description = ogDescMatch[1].trim().substring(0, 500);
  }

  // Try meta description if no og:description
  if (!info.description) {
    const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i) ||
                      html.match(/<meta\s+content="([^"]+)"\s+name="description"/i);
    if (descMatch) {
      info.description = descMatch[1].trim().substring(0, 500);
    }
  }

  return info;
}
