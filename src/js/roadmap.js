(function() {
"use strict";

var FM = window.FeatureMap;
var TRANSITION_MS = 300;
var NODE_RADIUS = 10;
var CORE_NODE_RADIUS = 13;
var SECTOR_GAP = 0.04;
var RING_PAD_INNER = 70;

var svg, g;
var viewMode = 'radial';

var diagramContainer = d3.select('#diagram-container');
var tooltip = d3.select('#tooltip');
var detailPanel = d3.select('#detail-panel');

FM.init(function() {
  buildLegend();
  buildDiagram();

  window.addEventListener('resize', function() { buildDiagram(); });

  d3.selectAll('#view-toggle button').on('click', function() {
    var mode = d3.select(this).attr('data-view');
    if (mode === viewMode) return;
    viewMode = mode;
    d3.selectAll('#view-toggle button').classed('active', false);
    d3.select(this).classed('active', true);
    FM.state.pinned = null;
    detailPanel.classed('open', false);
    buildDiagram();
  });
});

/* ========== LAYOUT COMPUTATION ========== */
function computeLayout(visibleFeatures, width, height) {
  var cx = width / 2, cy = height / 2;
  var maxR = Math.min(cx, cy) - 60;
  var numRings = FM.state.ringMax + 1;

  var ringInner = RING_PAD_INNER;
  var ringBand = (maxR - ringInner) / numRings;
  var ringRadii = [];
  for (var i = 0; i < numRings; i++) {
    var inner = ringInner + i * ringBand;
    var outer = ringInner + (i + 1) * ringBand;
    ringRadii.push({inner: inner, outer: outer, mid: (inner + outer) / 2});
  }

  var coreFeatures = visibleFeatures.filter(function(f) { return !f.sector; });
  var sectorFeatures = visibleFeatures.filter(function(f) { return f.sector; });

  var activeSectorIds = [];
  var seen = {};
  sectorFeatures.forEach(function(f) {
    if (!seen[f.sector]) { seen[f.sector] = true; activeSectorIds.push(f.sector); }
  });
  var activeSectors = FM.data.sectors.filter(function(s) {
    return activeSectorIds.indexOf(s.id) >= 0 && FM.state.sectors[s.id];
  });

  var totalGap = activeSectors.length * SECTOR_GAP;
  var available = 2 * Math.PI - totalGap;
  var sectorAngle = activeSectors.length > 0 ? available / activeSectors.length : 0;
  var sectorLayout = {};
  var angle = -Math.PI / 2;
  activeSectors.forEach(function(s) {
    sectorLayout[s.id] = {startAngle: angle, endAngle: angle + sectorAngle};
    angle += sectorAngle + SECTOR_GAP;
  });

  var positions = [];

  if (coreFeatures.length > 0) {
    var coreR = ringInner * 0.6;
    coreFeatures.forEach(function(f, i) {
      var a = (2 * Math.PI * i / coreFeatures.length) - Math.PI / 2;
      positions.push({
        feature: f, x: cx + coreR * Math.cos(a), y: cy + coreR * Math.sin(a),
        r: coreR, angle: a, isCore: true
      });
    });
  }

  activeSectors.forEach(function(sector) {
    var sf = sectorFeatures.filter(function(f) { return f.sector === sector.id; });
    var byRing = {};
    sf.forEach(function(f) {
      var ri = FM.ringMap[f.ring] ? FM.ringMap[f.ring].index : 0;
      if (!byRing[ri]) byRing[ri] = [];
      byRing[ri].push(f);
    });

    var sl = sectorLayout[sector.id];
    var pad = 0.05;

    Object.keys(byRing).forEach(function(ri) {
      var features = byRing[ri];
      var ringR = ringRadii[ri] ? ringRadii[ri].mid : ringRadii[0].mid;
      var angStart = sl.startAngle + pad;
      var angEnd = sl.endAngle - pad;
      var angRange = angEnd - angStart;

      features.forEach(function(f, i) {
        var a = features.length === 1 ? (angStart + angEnd) / 2 :
                angStart + (angRange * i / (features.length - 1));
        positions.push({
          feature: f, x: cx + ringR * Math.cos(a), y: cy + ringR * Math.sin(a),
          r: ringR, angle: a, isCore: false
        });
      });
    });
  });

  return {positions: positions, ringRadii: ringRadii, sectorLayout: sectorLayout,
    activeSectors: activeSectors, cx: cx, cy: cy, maxR: maxR, ringInner: ringInner};
}

/* ========== DIAGRAM ========== */
function buildDiagram() {
  diagramContainer.select('svg').remove();
  var rect = diagramContainer.node().getBoundingClientRect();
  var w = rect.width, h = rect.height;

  svg = diagramContainer.append('svg').attr('width', w).attr('height', h);
  g = svg.append('g');

  var zoom = d3.zoom().scaleExtent([0.3, 5]).on('zoom', function(event) {
    g.attr('transform', event.transform);
  });
  svg.call(zoom);
  svg.on('dblclick.zoom', function() {
    svg.transition().duration(TRANSITION_MS).call(zoom.transform, d3.zoomIdentity);
  });

  update();
}

function update() {
  if (!g) return;

  var visibleFeatures = FM.getVisibleFeatures();
  FM.updateBadges(visibleFeatures);
  g.selectAll('*').remove();
  svg.select('defs').remove();

  var defs = svg.append('defs');
  defs.append('marker')
    .attr('id', 'arrowhead').attr('viewBox', '0 0 10 8')
    .attr('refX', 9).attr('refY', 4)
    .attr('markerWidth', 8).attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path').attr('d', 'M0,0 L10,4 L0,8 Z').attr('fill', FM.css('--arrow-color'));

  if (viewMode === 'timeline') {
    renderTimeline(visibleFeatures);
  } else {
    renderRadial(visibleFeatures);
  }

  svg.on('click', function() {
    if (FM.state.pinned) {
      FM.state.pinned = null;
      detailPanel.classed('open', false);
      clearHighlight();
    }
  });
}

/* ========== SHARED RENDERING ========== */
function renderNodes(positions) {
  var nodeGroup = g.append('g').attr('class', 'feature-nodes');

  positions.forEach(function(p) {
    var f = p.feature;
    var st = FM.statusMap[f.status] || {color: '#888'};
    var sec = f.sector ? FM.sectorMap[f.sector] : null;
    var nr = p.isCore ? CORE_NODE_RADIUS : NODE_RADIUS;

    var nodeG = nodeGroup.append('g')
      .attr('class', 'feature-node')
      .attr('data-id', f.id)
      .attr('transform', 'translate(' + p.x + ',' + p.y + ')')
      .style('cursor', 'pointer');

    nodeG.append('circle')
      .attr('r', nr)
      .attr('fill', st.color || '#888')
      .attr('stroke', sec ? (sec.color || '#888') : FM.css('--text-secondary'))
      .attr('stroke-width', 2.5)
      .attr('filter', 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))');

    if (st.symbol) {
      nodeG.append('text')
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
        .attr('fill', '#fff').attr('font-size', '10px').attr('pointer-events', 'none')
        .text(st.symbol);
    }

    var maxLen = 16;
    var label = f.name.length > maxLen ? f.name.slice(0, maxLen - 1) + '\u2026' : f.name;
    nodeG.append('text')
      .attr('x', 0).attr('y', nr + 14)
      .attr('text-anchor', 'middle')
      .attr('fill', FM.css('--text-primary')).attr('font-size', '10px').attr('font-family', 'inherit')
      .attr('pointer-events', 'none')
      .text(label);

    nodeG.on('mouseenter', function(event) {
      if (FM.state.pinned) return;
      highlightFeature(f.id);
      showTooltip(event, f);
    }).on('mousemove', function(event) {
      if (FM.state.pinned) return;
      moveTooltip(event);
    }).on('mouseleave', function() {
      if (FM.state.pinned) return;
      clearHighlight();
      hideTooltip();
    }).on('click', function(event) {
      event.stopPropagation();
      if (FM.state.pinned === f.id) {
        FM.state.pinned = null;
        detailPanel.classed('open', false);
        clearHighlight();
        hideTooltip();
      } else {
        FM.state.pinned = f.id;
        highlightFeature(f.id, true);
        FM.showDetail(f);
        hideTooltip();
      }
    });
  });
}

function renderArrows(positions, visibleFeatures) {
  var posMap = {};
  positions.forEach(function(p) { posMap[p.feature.id] = p; });
  var visibleIds = {};
  visibleFeatures.forEach(function(f) { visibleIds[f.id] = true; });
  var arrowGroup = g.append('g').attr('class', 'dep-arrows');

  visibleFeatures.forEach(function(f) {
    if (f.dependencies) {
      f.dependencies.forEach(function(depId) {
        if (visibleIds[depId] && posMap[depId] && posMap[f.id]) {
          var src = posMap[depId];
          var tgt = posMap[f.id];
          var dx = tgt.x - src.x, dy = tgt.y - src.y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 1) return;
          var bulge = dist * 0.2;
          var mx = (src.x + tgt.x) / 2, my = (src.y + tgt.y) / 2;
          var nx = -dy / dist * bulge, ny = dx / dist * bulge;

          arrowGroup.append('path')
            .attr('d', 'M' + src.x + ',' + src.y + ' Q' + (mx + nx) + ',' + (my + ny) + ' ' + tgt.x + ',' + tgt.y)
            .attr('fill', 'none')
            .attr('stroke', FM.css('--arrow-color'))
            .attr('stroke-width', 1.2)
            .attr('stroke-opacity', 0.15)
            .attr('marker-end', 'url(#arrowhead)')
            .attr('data-from', depId)
            .attr('data-to', f.id)
            .attr('class', 'dep-arrow');
        }
      });
    }
  });
}

/* ========== RADIAL VIEW ========== */
function renderRadial(visibleFeatures) {
  var rect = diagramContainer.node().getBoundingClientRect();
  var w = rect.width, h = rect.height;
  var layout = computeLayout(visibleFeatures, w, h);
  var positions = layout.positions, ringRadii = layout.ringRadii;
  var sectorLayout = layout.sectorLayout, activeSectors = layout.activeSectors;
  var cx = layout.cx, cy = layout.cy, maxR = layout.maxR, ringInner = layout.ringInner;

  ringRadii.forEach(function(rr, i) {
    g.append('circle')
      .attr('cx', cx).attr('cy', cy).attr('r', rr.outer)
      .attr('fill', i % 2 === 0 ? FM.css('--grid-bg-even') : FM.css('--grid-bg-odd'))
      .attr('stroke', FM.css('--grid-line')).attr('stroke-width', 0.5)
      .attr('stroke-dasharray', '4,4');
  });
  g.append('circle')
    .attr('cx', cx).attr('cy', cy).attr('r', ringInner)
    .attr('fill', FM.css('--grid-bg-even'))
    .attr('stroke', FM.css('--grid-line')).attr('stroke-width', 0.5)
    .attr('stroke-dasharray', '4,4');

  ringRadii.forEach(function(rr, i) {
    if (i <= FM.state.ringMax && FM.data.rings[i]) {
      g.append('text')
        .attr('x', cx + 6).attr('y', cy - rr.mid)
        .attr('fill', FM.css('--text-muted')).attr('font-size', '10px').attr('font-family', 'inherit')
        .attr('text-anchor', 'start').attr('dominant-baseline', 'middle')
        .text(FM.data.rings[i].label);
    }
  });

  activeSectors.forEach(function(sector) {
    var sl = sectorLayout[sector.id];
    var color = sector.color || '#888';
    var arc = d3.arc()
      .innerRadius(ringInner)
      .outerRadius(ringRadii.length ? ringRadii[ringRadii.length - 1].outer : maxR)
      .startAngle(sl.startAngle + Math.PI / 2)
      .endAngle(sl.endAngle + Math.PI / 2);

    g.append('path')
      .attr('d', arc())
      .attr('transform', 'translate(' + cx + ',' + cy + ')')
      .attr('fill', color).attr('fill-opacity', FM.css('--sector-fill-opacity'))
      .attr('stroke', 'none');

    var outerR = ringRadii.length ? ringRadii[ringRadii.length - 1].outer : maxR;
    g.append('line')
      .attr('x1', cx + ringInner * Math.cos(sl.startAngle))
      .attr('y1', cy + ringInner * Math.sin(sl.startAngle))
      .attr('x2', cx + outerR * Math.cos(sl.startAngle))
      .attr('y2', cy + outerR * Math.sin(sl.startAngle))
      .attr('stroke', FM.css('--grid-line')).attr('stroke-width', 0.5);
    g.append('line')
      .attr('x1', cx + ringInner * Math.cos(sl.endAngle))
      .attr('y1', cy + ringInner * Math.sin(sl.endAngle))
      .attr('x2', cx + outerR * Math.cos(sl.endAngle))
      .attr('y2', cy + outerR * Math.sin(sl.endAngle))
      .attr('stroke', FM.css('--grid-line')).attr('stroke-width', 0.5);

    var midAngle = (sl.startAngle + sl.endAngle) / 2;
    var labelR = (ringRadii.length ? ringRadii[ringRadii.length - 1].outer : maxR) + 20;
    var lx = cx + labelR * Math.cos(midAngle);
    var ly = cy + labelR * Math.sin(midAngle);
    var rotDeg = (midAngle * 180 / Math.PI);
    var flip = midAngle > Math.PI / 2 || midAngle < -Math.PI / 2;
    g.append('text')
      .attr('x', lx).attr('y', ly)
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
      .attr('fill', color).attr('font-size', '13px').attr('font-weight', '600')
      .attr('font-family', 'inherit')
      .attr('transform', 'rotate(' + (flip ? rotDeg + 180 : rotDeg) + ',' + lx + ',' + ly + ')')
      .text(sector.name);
  });

  g.append('text')
    .attr('x', cx).attr('y', cy - 8)
    .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
    .attr('fill', FM.css('--text-primary')).attr('font-size', '16px').attr('font-weight', '700')
    .attr('font-family', 'inherit')
    .text(FM.data.project.name);
  if (FM.data.project.description) {
    g.append('text')
      .attr('x', cx).attr('y', cy + 10)
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
      .attr('fill', FM.css('--text-secondary')).attr('font-size', '10px')
      .attr('font-family', 'inherit')
      .text(FM.data.project.description);
  }

  renderArrows(positions, visibleFeatures);
  renderNodes(positions);
}

/* ========== TIMELINE VIEW ========== */
function renderTimeline(visibleFeatures) {
  var rect = diagramContainer.node().getBoundingClientRect();
  var w = rect.width, h = rect.height;
  var numRings = FM.state.ringMax + 1;
  var COL_PAD = 60, ROW_H = 48, HEADER_H = 40, SECTOR_LABEL_W = 140;
  var COL_W = Math.max(120, (w - SECTOR_LABEL_W - COL_PAD * 2) / numRings);

  var coreFeatures = visibleFeatures.filter(function(f) { return !f.sector; });
  var activeSectorIds = [];
  var seen = {};
  visibleFeatures.filter(function(f) { return f.sector; }).forEach(function(f) {
    if (!seen[f.sector]) { seen[f.sector] = true; activeSectorIds.push(f.sector); }
  });
  var activeSectors = FM.data.sectors.filter(function(s) {
    return activeSectorIds.indexOf(s.id) >= 0 && FM.state.sectors[s.id];
  });

  var rows = [];
  if (coreFeatures.length > 0) {
    rows.push({label: 'Core', color: FM.css('--text-secondary'), features: coreFeatures.map(function(f) {
      return {ring: FM.ringMap[f.ring] ? FM.ringMap[f.ring].index : 0, feature: f};
    })});
  }
  activeSectors.forEach(function(s) {
    var sf = visibleFeatures.filter(function(f) { return f.sector === s.id; });
    if (sf.length > 0) {
      rows.push({label: s.name, color: s.color || '#888', features: sf.map(function(f) {
        return {ring: FM.ringMap[f.ring] ? FM.ringMap[f.ring].index : 0, feature: f};
      })});
    }
  });

  rows.forEach(function(row) {
    var byRing = {};
    row.features.forEach(function(rf) {
      if (!byRing[rf.ring]) byRing[rf.ring] = [];
      byRing[rf.ring].push(rf.feature);
    });
    row.byRing = byRing;
    row.maxStack = Math.max(1, Math.max.apply(null, Object.values(byRing).map(function(arr) { return arr.length; })));
  });

  var totalHeight = HEADER_H + rows.reduce(function(sum, r) { return sum + r.maxStack * ROW_H + 20; }, 0) + 40;
  var totalWidth = SECTOR_LABEL_W + numRings * COL_W + COL_PAD * 2;

  var bgGroup = g.append('g').attr('class', 'tl-bg');

  for (var ri = 0; ri < numRings; ri++) {
    var x = SECTOR_LABEL_W + COL_PAD + ri * COL_W;
    var ringLabel = FM.data.rings[ri] ? FM.data.rings[ri].label : 'Ring ' + ri;

    bgGroup.append('rect')
      .attr('x', x).attr('y', HEADER_H)
      .attr('width', COL_W).attr('height', totalHeight - HEADER_H)
      .attr('fill', ri % 2 === 0 ? FM.css('--grid-bg-even') : FM.css('--grid-bg-odd'));

    bgGroup.append('text')
      .attr('x', x + COL_W / 2).attr('y', HEADER_H / 2)
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
      .attr('fill', FM.css('--text-secondary')).attr('font-size', '13px').attr('font-weight', '700')
      .attr('font-family', 'inherit')
      .text(ringLabel);
  }

  var arrowY = HEADER_H / 2;
  var arrowX1 = SECTOR_LABEL_W + COL_PAD + 4;
  var arrowX2 = SECTOR_LABEL_W + COL_PAD + numRings * COL_W - 4;
  bgGroup.append('line')
    .attr('x1', arrowX1).attr('y1', arrowY + 14)
    .attr('x2', arrowX2).attr('y2', arrowY + 14)
    .attr('stroke', FM.css('--grid-line')).attr('stroke-width', 1)
    .attr('marker-end', 'url(#arrowhead)');
  bgGroup.append('text')
    .attr('x', (arrowX1 + arrowX2) / 2).attr('y', arrowY + 24)
    .attr('text-anchor', 'middle').attr('fill', FM.css('--text-muted'))
    .attr('font-size', '9px').attr('font-family', 'inherit')
    .text('Further in the future');

  var positions = [];
  var yOffset = HEADER_H + 10;

  rows.forEach(function(row) {
    var rowH = row.maxStack * ROW_H;

    bgGroup.append('rect')
      .attr('x', 0).attr('y', yOffset)
      .attr('width', SECTOR_LABEL_W - 4).attr('height', rowH)
      .attr('fill', row.color).attr('fill-opacity', 0.08)
      .attr('rx', 6);

    bgGroup.append('text')
      .attr('x', SECTOR_LABEL_W / 2).attr('y', yOffset + rowH / 2)
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
      .attr('fill', row.color).attr('font-size', '12px').attr('font-weight', '600')
      .attr('font-family', 'inherit')
      .text(row.label);

    bgGroup.append('line')
      .attr('x1', 0).attr('y1', yOffset + rowH + 10)
      .attr('x2', totalWidth).attr('y2', yOffset + rowH + 10)
      .attr('stroke', FM.css('--border-light')).attr('stroke-width', 0.5);

    for (var ri2 = 0; ri2 < numRings; ri2++) {
      var features = row.byRing[ri2] || [];
      var colX = SECTOR_LABEL_W + COL_PAD + ri2 * COL_W + COL_W / 2;

      features.forEach(function(f, fi) {
        var fy = yOffset + fi * ROW_H + ROW_H / 2;
        positions.push({feature: f, x: colX, y: fy, isCore: !f.sector});
      });
    }

    yOffset += rowH + 20;
  });

  var svgW = Math.max(rect.width, totalWidth + 40);
  var svgH = Math.max(rect.height, totalHeight + 40);
  svg.attr('width', svgW).attr('height', svgH);

  renderArrows(positions, visibleFeatures);
  renderNodes(positions);
}

/* ========== HIGHLIGHTING ========== */
function highlightFeature(fid, transitive) {
  var connected = {};
  connected[fid] = true;

  if (transitive) {
    var queue = [fid];
    var visited = {};
    visited[fid] = true;
    while (queue.length) {
      var cur = queue.shift();
      var cf = FM.featureMap[cur];
      if (cf && cf.dependencies) {
        cf.dependencies.forEach(function(d) {
          if (!visited[d]) { visited[d] = true; queue.push(d); connected[d] = true; }
        });
      }
      if (FM.unlocks[cur]) {
        FM.unlocks[cur].forEach(function(u) {
          if (!visited[u]) { visited[u] = true; queue.push(u); connected[u] = true; }
        });
      }
    }
  } else {
    var f = FM.featureMap[fid];
    if (f && f.dependencies) f.dependencies.forEach(function(d) { connected[d] = true; });
    if (FM.unlocks[fid]) FM.unlocks[fid].forEach(function(u) { connected[u] = true; });
  }

  g.selectAll('.feature-node').each(function() {
    var id = d3.select(this).attr('data-id');
    d3.select(this).transition().duration(150).style('opacity', connected[id] ? 1 : 0.3);
  });

  g.selectAll('.dep-arrow').each(function() {
    var from = d3.select(this).attr('data-from');
    var to = d3.select(this).attr('data-to');
    var show = connected[from] && connected[to];
    d3.select(this).transition().duration(150)
      .attr('stroke-opacity', show ? 0.6 : 0.05)
      .attr('stroke-width', show ? 2 : 1);
  });
}

function clearHighlight() {
  g.selectAll('.feature-node').transition().duration(150).style('opacity', 1);
  g.selectAll('.dep-arrow').transition().duration(150).attr('stroke-opacity', 0.15).attr('stroke-width', 1.2);
}

/* ========== TOOLTIP ========== */
function showTooltip(event, f) {
  var st = FM.statusMap[f.status];
  var sec = f.sector ? FM.sectorMap[f.sector] : null;
  var ring = FM.ringMap[f.ring];

  var html = '<strong>' + FM._esc(f.name) + '</strong>';
  if (f.description) html += '<br>' + FM._esc(f.description);
  html += '<div class="tt-row"><span class="tt-label">Status:</span>' + FM._esc(st ? st.label : f.status) + '</div>';
  html += '<div class="tt-row"><span class="tt-label">Ring:</span>' + FM._esc(ring ? ring.label : f.ring) + '</div>';
  if (sec) html += '<div class="tt-row"><span class="tt-label">Sector:</span>' + FM._esc(sec.name) + '</div>';
  if (f.components && f.components.length) {
    html += '<div class="tt-row"><span class="tt-label">Components:</span>' +
      f.components.map(function(c) { return FM._esc(FM.componentMap[c] ? FM.componentMap[c].label : c); }).join(', ') + '</div>';
  }
  if (f.tags && f.tags.length) {
    html += '<div class="tt-row"><span class="tt-label">Tags:</span>' +
      f.tags.map(function(t) { return FM._esc(FM.tagMap[t] ? FM.tagMap[t].label : t); }).join(', ') + '</div>';
  }
  if (f.blockers) {
    if (f.blockers.internal && f.blockers.internal.length)
      html += '<div class="tt-row"><span class="tt-label">Blockers (int):</span>' + f.blockers.internal.map(FM._esc).join('; ') + '</div>';
    if (f.blockers.external && f.blockers.external.length)
      html += '<div class="tt-row"><span class="tt-label">Blockers (ext):</span>' + f.blockers.external.map(FM._esc).join('; ') + '</div>';
  }
  if (f.dependencies && f.dependencies.length) {
    html += '<div class="tt-row"><span class="tt-label">Depends on:</span>' +
      f.dependencies.map(function(d) { return FM._esc(FM.featureMap[d] ? FM.featureMap[d].name : d); }).join(', ') + '</div>';
  }
  if (FM.unlocks[f.id] && FM.unlocks[f.id].length) {
    html += '<div class="tt-row"><span class="tt-label">Unlocks:</span>' +
      FM.unlocks[f.id].map(function(u) { return FM._esc(FM.featureMap[u] ? FM.featureMap[u].name : u); }).join(', ') + '</div>';
  }

  tooltip.html(html).classed('visible', true);
  moveTooltip(event);
}

function moveTooltip(event) {
  var main = d3.select('#main').node().getBoundingClientRect();
  var x = event.clientX - main.left + 15;
  var y = event.clientY - main.top + 15;
  var tw = tooltip.node().offsetWidth;
  var th = tooltip.node().offsetHeight;
  if (x + tw > main.width - 10) x = x - tw - 30;
  if (y + th > main.height - 10) y = y - th - 30;
  tooltip.style('left', x + 'px').style('top', y + 'px');
}

function hideTooltip() {
  tooltip.classed('visible', false);
}

/* ========== LEGEND ========== */
function buildLegend() {
  var content = d3.select('#legend-content');
  content.html('');

  var sg = content.append('div').attr('class', 'legend-group');
  sg.append('h4').text('Status');
  FM.data.statuses.forEach(function(s) {
    var item = sg.append('div').attr('class', 'legend-item');
    item.append('span').attr('class', 'legend-swatch').style('background', s.color || '#888');
    item.append('span').text(s.label);
  });

  var rg = content.append('div').attr('class', 'legend-group');
  rg.append('h4').text('Rings (center to edge)');
  FM.data.rings.forEach(function(r, i) {
    var item = rg.append('div').attr('class', 'legend-item');
    item.append('span').style('width', '14px').style('text-align', 'center').style('font-size', '11px')
      .style('color', FM.css('--text-secondary')).style('flex-shrink', '0').text(i);
    item.append('span').text(r.label);
  });

  var scg = content.append('div').attr('class', 'legend-group');
  scg.append('h4').text('Sectors');
  FM.data.sectors.forEach(function(s) {
    var item = scg.append('div').attr('class', 'legend-item');
    item.append('span').attr('class', 'legend-swatch').style('background', s.color || '#888');
    item.append('span').text(s.name);
  });

  var ag = content.append('div').attr('class', 'legend-group');
  ag.append('h4').text('Arrows');
  var ai = ag.append('div').attr('class', 'legend-item');
  ai.append('span').attr('class', 'legend-line').style('background', FM.css('--arrow-color'));
  ai.append('span').text('Dependency (A \u2192 B means B depends on A)');

  d3.select('#legend-toggle').on('click', function() {
    var legend = d3.select('#legend');
    legend.classed('open', !legend.classed('open'));
    d3.select(this).text(legend.classed('open') ? 'Hide Legend' : 'Legend');
  });
}

})();
