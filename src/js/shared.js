(function() {
"use strict";

var FM = window.FeatureMap = {};

FM.data = null;
FM.state = {
  sectors: {},
  statuses: {},
  components: {},
  tags: {},
  ringMax: 0,
  blockerFilter: 'all',
  pinned: null
};

FM.featureMap = {};
FM.statusMap = {};
FM.sectorMap = {};
FM.ringMap = {};
FM.componentMap = {};
FM.tagMap = {};
FM.unlocks = {};
FM._onFilterChange = null;

/* ===== INIT ===== */
FM.init = function(onFilterChange) {
  FM._onFilterChange = onFilterChange;

  if (typeof d3 === 'undefined') {
    var el = document.getElementById('error-msg');
    el.style.display = 'block';
    el.textContent = 'Failed to load D3.js library. Check your internet connection or disable ad blockers.';
    return Promise.reject(new Error('D3 not loaded'));
  }

  return fetch('./features.json').then(function(resp) {
    if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + resp.statusText);
    return resp.json();
  }).then(function(json) {
    FM.data = json;
    FM._buildMaps();
    FM._initState();
    FM._buildSidebar();
    FM._setupDetailPanel();
    FM._updateNav();
    onFilterChange();
  }).catch(function(err) {
    var el = document.getElementById('error-msg');
    el.style.display = 'block';
    el.innerHTML = 'Failed to load features.json:<br><code>' + (err.message || err) +
      '</code><br><br>Make sure features.json is in the same directory and you are serving via HTTP.';
  });
};

/* ===== MAPS ===== */
FM._buildMaps = function() {
  var data = FM.data;
  data.statuses.forEach(function(s) { FM.statusMap[s.id] = s; });
  data.sectors.forEach(function(s) { FM.sectorMap[s.id] = s; });
  data.rings.forEach(function(r, i) { FM.ringMap[r.id] = Object.assign({}, r, {index: i}); });
  if (data.components) data.components.forEach(function(c) { FM.componentMap[c.id] = c; });
  if (data.tags) data.tags.forEach(function(t) { FM.tagMap[t.id] = t; });
  data.features.forEach(function(f) { FM.featureMap[f.id] = f; });

  FM.unlocks = {};
  data.features.forEach(function(f) { FM.unlocks[f.id] = []; });
  data.features.forEach(function(f) {
    if (f.dependencies) {
      f.dependencies.forEach(function(depId) {
        if (FM.unlocks[depId]) FM.unlocks[depId].push(f.id);
      });
    }
  });
};

/* ===== STATE ===== */
FM._initState = function() {
  var data = FM.data;
  data.sectors.forEach(function(s) { FM.state.sectors[s.id] = true; });
  data.statuses.forEach(function(s) {
    FM.state.statuses[s.id] = (s.id !== 'implemented' && s.id !== 'deprecated');
  });
  if (data.components) data.components.forEach(function(c) { FM.state.components[c.id] = true; });
  if (data.tags) data.tags.forEach(function(t) { FM.state.tags[t.id] = true; });
  FM.state.ringMax = data.rings.length - 1;
};

/* ===== FILTERING ===== */
FM.isFeatureVisible = function(f) {
  var ri = FM.ringMap[f.ring] ? FM.ringMap[f.ring].index : 0;
  if (ri > FM.state.ringMax) return false;
  if (!FM.state.statuses[f.status]) return false;
  if (f.sector && !FM.state.sectors[f.sector]) return false;
  if (FM.data.components && FM.data.components.length && f.components && f.components.length) {
    if (!f.components.some(function(c) { return FM.state.components[c]; })) return false;
  }
  if (FM.data.tags && FM.data.tags.length && f.tags && f.tags.length) {
    if (!f.tags.some(function(t) { return FM.state.tags[t]; })) return false;
  }
  if (FM.state.blockerFilter !== 'all') {
    var hasInt = f.blockers && f.blockers.internal && f.blockers.internal.length > 0;
    var hasExt = f.blockers && f.blockers.external && f.blockers.external.length > 0;
    if (FM.state.blockerFilter === 'none' && (hasInt || hasExt)) return false;
    if (FM.state.blockerFilter === 'internal' && !(hasInt && !hasExt)) return false;
    if (FM.state.blockerFilter === 'external' && !(!hasInt && hasExt)) return false;
    if (FM.state.blockerFilter === 'both' && !(hasInt && hasExt)) return false;
  }
  return true;
};

FM.getVisibleFeatures = function() {
  return FM.data.features.filter(FM.isFeatureVisible);
};

/* ===== SIDEBAR ===== */
FM._buildSidebar = function() {
  var sidebar = d3.select('#sidebar');
  sidebar.html('');

  sidebar.append('div').style('padding', '4px 0 8px').style('border-bottom', '1px solid var(--border)')
    .append('div').style('font-size', '15px').style('font-weight', '700').style('color', '#fff')
    .text(FM.data.project.name);

  FM._buildFilterSection(sidebar, 'Sectors', FM.data.sectors, FM.state.sectors, 'sector');
  FM._buildFilterSection(sidebar, 'Status', FM.data.statuses, FM.state.statuses, 'status');

  if (FM.data.rings.length > 1) {
    var sec = sidebar.append('div').attr('class', 'filter-section');
    sec.append('h2').text('Rings');
    var cont = sec.append('div').attr('id', 'ring-slider-container');
    cont.append('input').attr('type', 'range').attr('id', 'ring-slider')
      .attr('min', 0).attr('max', FM.data.rings.length - 1).attr('value', FM.state.ringMax).attr('step', 1)
      .on('input', function() {
        FM.state.ringMax = +this.value;
        d3.select('#ring-label').text(FM.data.rings[FM.state.ringMax].label);
        FM._triggerChange();
      });
    cont.append('div').attr('id', 'ring-label').text(FM.data.rings[FM.state.ringMax].label);
  }

  if (FM.data.components && FM.data.components.length) {
    FM._buildFilterSection(sidebar, 'Components', FM.data.components, FM.state.components, 'component');
  }
  if (FM.data.tags && FM.data.tags.length) {
    FM._buildFilterSection(sidebar, 'Tags', FM.data.tags, FM.state.tags, 'tag', FM.data.tags.length > 6);
  }

  FM._buildBlockerFilter(sidebar);

  var resetSec = sidebar.append('div').attr('class', 'filter-section');
  resetSec.append('button').attr('id', 'reset-btn').text('Reset Filters').on('click', FM.resetFilters);
};

FM._buildFilterSection = function(sidebar, title, items, stateObj, kind, collapsible) {
  var sec = sidebar.append('div').attr('class', 'filter-section');
  var container;
  if (collapsible) {
    var hdr = sec.append('div').attr('class', 'collapsible-header').on('click', function() {
      sec.classed('collapsed', !sec.classed('collapsed'));
    });
    hdr.append('h2').text(title);
    hdr.append('span').attr('class', 'collapse-arrow').text('\u25BC');
    container = sec.append('div').attr('class', 'collapsible-body').style('max-height', '999px');
  } else {
    sec.append('h2').text(title);
    container = sec;
  }

  items.forEach(function(item) {
    var isActive = stateObj[item.id];
    container.append('button')
      .attr('class', 'toggle-btn' + (isActive ? ' active' : ' inactive'))
      .attr('data-id', item.id).attr('data-kind', kind)
      .on('click', function() { FM._toggleFilter(kind, item.id); })
      .call(function(btn) {
        var color = item.color || '#888';
        btn.append('span').attr('class', 'color-dot').style('background', color);
        btn.append('span').text(item.label || item.name);
        btn.append('span').attr('class', 'badge').attr('data-badge', kind + '-' + item.id).text('0');
      });
  });
};

FM._buildBlockerFilter = function(sidebar) {
  var sec = sidebar.append('div').attr('class', 'filter-section');
  sec.append('h2').text('Blockers');
  var options = [
    {id: 'all', label: 'All'},
    {id: 'none', label: 'No blockers'},
    {id: 'internal', label: 'Internal only'},
    {id: 'external', label: 'External only'},
    {id: 'both', label: 'Both'}
  ];
  options.forEach(function(opt) {
    sec.append('button')
      .attr('class', 'toggle-btn' + (opt.id === 'all' ? ' active' : ''))
      .attr('data-blocker', opt.id)
      .on('click', function() {
        FM.state.blockerFilter = opt.id;
        sec.selectAll('.toggle-btn').classed('active', false).classed('inactive', true);
        d3.select(this).classed('active', true).classed('inactive', false);
        FM._triggerChange();
      })
      .call(function(btn) {
        btn.append('span').text(opt.label);
      });
  });
};

FM._toggleFilter = function(kind, id) {
  var map = kind === 'sector' ? FM.state.sectors : kind === 'status' ? FM.state.statuses :
            kind === 'component' ? FM.state.components : FM.state.tags;
  map[id] = !map[id];
  d3.select('#sidebar').selectAll('.toggle-btn[data-kind="' + kind + '"][data-id="' + id + '"]')
    .classed('active', map[id]).classed('inactive', !map[id]);
  FM._triggerChange();
};

FM.resetFilters = function() {
  FM.data.sectors.forEach(function(s) { FM.state.sectors[s.id] = true; });
  FM.data.statuses.forEach(function(s) {
    FM.state.statuses[s.id] = (s.id !== 'implemented' && s.id !== 'deprecated');
  });
  if (FM.data.components) FM.data.components.forEach(function(c) { FM.state.components[c.id] = true; });
  if (FM.data.tags) FM.data.tags.forEach(function(t) { FM.state.tags[t.id] = true; });
  FM.state.ringMax = FM.data.rings.length - 1;
  FM.state.blockerFilter = 'all';
  FM.state.pinned = null;
  d3.select('#detail-panel').classed('open', false);

  d3.select('#sidebar').selectAll('.toggle-btn[data-kind]').classed('active', true).classed('inactive', false);
  // Re-apply default status visibility (implemented/deprecated off)
  FM.data.statuses.forEach(function(s) {
    var isOn = FM.state.statuses[s.id];
    d3.select('#sidebar').selectAll('.toggle-btn[data-kind="status"][data-id="' + s.id + '"]')
      .classed('active', isOn).classed('inactive', !isOn);
  });
  d3.select('#sidebar').selectAll('.toggle-btn[data-blocker]').classed('active', false).classed('inactive', true);
  d3.select('#sidebar').select('.toggle-btn[data-blocker="all"]').classed('active', true).classed('inactive', false);
  if (d3.select('#ring-slider').node()) {
    d3.select('#ring-slider').property('value', FM.state.ringMax);
    d3.select('#ring-label').text(FM.data.rings[FM.state.ringMax].label);
  }
  FM._triggerChange();
};

/* ===== BADGES ===== */
FM.updateBadges = function(visibleFeatures) {
  var sidebar = d3.select('#sidebar');
  var sectorCounts = {}, statusCounts = {}, compCounts = {}, tagCounts = {};
  FM.data.sectors.forEach(function(s) { sectorCounts[s.id] = 0; });
  FM.data.statuses.forEach(function(s) { statusCounts[s.id] = 0; });
  if (FM.data.components) FM.data.components.forEach(function(c) { compCounts[c.id] = 0; });
  if (FM.data.tags) FM.data.tags.forEach(function(t) { tagCounts[t.id] = 0; });

  visibleFeatures.forEach(function(f) {
    if (f.sector && sectorCounts[f.sector] !== undefined) sectorCounts[f.sector]++;
    if (statusCounts[f.status] !== undefined) statusCounts[f.status]++;
    if (f.components) f.components.forEach(function(c) { if (compCounts[c] !== undefined) compCounts[c]++; });
    if (f.tags) f.tags.forEach(function(t) { if (tagCounts[t] !== undefined) tagCounts[t]++; });
  });

  FM.data.sectors.forEach(function(s) { sidebar.select('[data-badge="sector-' + s.id + '"]').text(sectorCounts[s.id]); });
  FM.data.statuses.forEach(function(s) { sidebar.select('[data-badge="status-' + s.id + '"]').text(statusCounts[s.id]); });
  if (FM.data.components) FM.data.components.forEach(function(c) { sidebar.select('[data-badge="component-' + c.id + '"]').text(compCounts[c.id]); });
  if (FM.data.tags) FM.data.tags.forEach(function(t) { sidebar.select('[data-badge="tag-' + t.id + '"]').text(tagCounts[t.id]); });
};

/* ===== DETAIL PANEL ===== */
FM.getDetailHTML = function(f) {
  var st = FM.statusMap[f.status];
  var sec = f.sector ? FM.sectorMap[f.sector] : null;
  var ring = FM.ringMap[f.ring];

  var html = '<h3>' + FM._esc(f.name) + '</h3>';
  html += '<div class="detail-section"><span class="status-badge" style="background:' +
    (st ? st.color : '#888') + '">' + FM._esc(st ? st.label : f.status) + '</span></div>';

  if (f.description) {
    html += '<div class="detail-section"><h4>Description</h4><p>' + FM._esc(f.description) + '</p></div>';
  }
  html += '<div class="detail-section"><h4>Ring</h4><p>' + FM._esc(ring ? ring.label : f.ring) +
    (ring && ring.description ? ' &mdash; ' + FM._esc(ring.description) : '') + '</p></div>';

  if (sec) {
    html += '<div class="detail-section"><h4>Sector</h4><p style="color:' + (sec.color || '#333') + '">' +
      FM._esc(sec.name) + (sec.description ? ' &mdash; ' + FM._esc(sec.description) : '') + '</p></div>';
  } else {
    html += '<div class="detail-section"><h4>Sector</h4><p>Core (no sector)</p></div>';
  }

  if (f.components && f.components.length) {
    html += '<div class="detail-section"><h4>Components</h4><ul>' +
      f.components.map(function(c) { return '<li>' + FM._esc(FM.componentMap[c] ? FM.componentMap[c].label : c) + '</li>'; }).join('') +
      '</ul></div>';
  }
  if (f.tags && f.tags.length) {
    html += '<div class="detail-section"><h4>Tags</h4><ul>' +
      f.tags.map(function(t) { return '<li>' + FM._esc(FM.tagMap[t] ? FM.tagMap[t].label : t) + '</li>'; }).join('') +
      '</ul></div>';
  }
  if (f.dependencies && f.dependencies.length) {
    html += '<div class="detail-section"><h4>Depends On</h4><ul>';
    f.dependencies.forEach(function(d) {
      var df = FM.featureMap[d];
      var ds = df ? FM.statusMap[df.status] : null;
      html += '<li class="dep-list-item"><span class="dep-dot" style="background:' +
        (ds ? ds.color : '#888') + '"></span>' + FM._esc(df ? df.name : d) + '</li>';
    });
    html += '</ul></div>';
  }
  if (FM.unlocks[f.id] && FM.unlocks[f.id].length) {
    html += '<div class="detail-section"><h4>Unlocks</h4><ul>';
    FM.unlocks[f.id].forEach(function(u) {
      var uf = FM.featureMap[u];
      var us = uf ? FM.statusMap[uf.status] : null;
      html += '<li class="dep-list-item"><span class="dep-dot" style="background:' +
        (us ? us.color : '#888') + '"></span>' + FM._esc(uf ? uf.name : u) + '</li>';
    });
    html += '</ul></div>';
  }
  if (f.blockers) {
    if (f.blockers.internal && f.blockers.internal.length) {
      html += '<div class="detail-section"><h4>Internal Blockers</h4><ul>' +
        f.blockers.internal.map(function(b) { return '<li>' + FM._esc(b) + '</li>'; }).join('') + '</ul></div>';
    }
    if (f.blockers.external && f.blockers.external.length) {
      html += '<div class="detail-section"><h4>External Blockers</h4><ul>' +
        f.blockers.external.map(function(b) { return '<li>' + FM._esc(b) + '</li>'; }).join('') + '</ul></div>';
    }
  }
  if (f.value && f.value.length) {
    html += '<div class="detail-section"><h4>Value</h4><ul>' +
      f.value.map(function(v) { return '<li>' + FM._esc(v) + '</li>'; }).join('') + '</ul></div>';
  }
  if (f.links && f.links.length) {
    html += '<div class="detail-section"><h4>Links</h4><ul>' +
      f.links.map(function(l) {
        return '<li><a href="' + FM._escAttr(l.url) + '" target="_blank" rel="noopener">' + FM._esc(l.label) + '</a></li>';
      }).join('') + '</ul></div>';
  }
  return html;
};

FM.showDetail = function(f) {
  d3.select('#detail-content').html(FM.getDetailHTML(f));
  d3.select('#detail-panel').classed('open', true);
  FM.state.pinned = f.id;
};

FM.hideDetail = function() {
  d3.select('#detail-panel').classed('open', false);
  FM.state.pinned = null;
};

FM._setupDetailPanel = function() {
  d3.select('#detail-close').on('click', FM.hideDetail);
};

/* ===== NAV ===== */
FM._updateNav = function() {
  var brand = document.getElementById('nav-brand');
  if (brand && FM.data.project.name) {
    brand.textContent = FM.data.project.name + ' Feature Map';
  }
};

/* ===== CHANGE TRIGGER ===== */
FM._triggerChange = function() {
  var visible = FM.getVisibleFeatures();
  FM.updateBadges(visible);
  if (FM._onFilterChange) FM._onFilterChange();
};

/* ===== CSS VARIABLE ACCESS ===== */
FM.css = function(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
};

/* ===== UTILS ===== */
FM._esc = function(s) {
  if (!s) return '';
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(s));
  return div.innerHTML;
};

FM._escAttr = function(s) {
  return FM._esc(s).replace(/"/g, '&quot;');
};

})();
