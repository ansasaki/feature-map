(function() {
"use strict";

var FM = window.FeatureMap;
var searchText = '';
var groupBy = 'sector';

FM.init(function() {
  renderFeatures();

  d3.select('#search-input').on('input', function() {
    searchText = this.value.toLowerCase().trim();
    renderFeatures();
  });

  d3.select('#group-select').on('change', function() {
    groupBy = this.value;
    renderFeatures();
  });
});

function matchesSearch(f) {
  if (!searchText) return true;
  var haystack = (f.name + ' ' + (f.description || '')).toLowerCase();
  var terms = searchText.split(/\s+/);
  return terms.every(function(term) { return haystack.indexOf(term) >= 0; });
}

// Assign distinct colors to ring badges based on position (inner→outer).
// Uses a green→blue→amber→red progression that conveys timeline/feasibility.
var RING_PALETTE = [
  {bg: '#dcfce7', fg: '#166534'},  // green  – core / implemented
  {bg: '#dbeafe', fg: '#1e40af'},  // blue   – near-term
  {bg: '#fef3c7', fg: '#92400e'},  // amber  – mid-term
  {bg: '#fee2e2', fg: '#991b1b'},  // red    – long-term / blocked
  {bg: '#f3e8ff', fg: '#6b21a8'},  // purple – extra
  {bg: '#e0f2fe', fg: '#075985'},  // sky    – extra
];
var RING_PALETTE_DARK = [
  {bg: '#166534', fg: '#bbf7d0'},
  {bg: '#1e3a5f', fg: '#bfdbfe'},
  {bg: '#78350f', fg: '#fde68a'},
  {bg: '#7f1d1d', fg: '#fecaca'},
  {bg: '#581c87', fg: '#e9d5ff'},
  {bg: '#0c4a6e', fg: '#bae6fd'},
];

function ringColor(index, total) {
  var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  var palette = dark ? RING_PALETTE_DARK : RING_PALETTE;
  if (index < palette.length) return palette[index];
  // For extra rings beyond the palette, generate from hue
  var hue = (index * 360 / total) % 360;
  return dark
    ? {bg: 'hsl(' + hue + ',40%,25%)', fg: 'hsl(' + hue + ',60%,80%)'}
    : {bg: 'hsl(' + hue + ',60%,90%)', fg: 'hsl(' + hue + ',60%,25%)'};
}

function renderFeatures() {
  var container = d3.select('#features-container');
  container.html('');

  var visible = FM.getVisibleFeatures().filter(matchesSearch);
  FM.updateBadges(FM.getVisibleFeatures());

  d3.select('#feature-count').text(visible.length + ' feature' + (visible.length !== 1 ? 's' : ''));

  if (visible.length === 0) {
    container.append('div').attr('id', 'empty-state')
      .html('<div class="empty-icon">\u26A0</div>' +
        '<div class="empty-text">No features match your filters</div>' +
        '<div class="empty-sub">Try adjusting the sidebar filters or search query</div>');
    return;
  }

  var groups = buildGroups(visible);

  groups.forEach(function(group) {
    var section = container.append('div').attr('class', 'feature-group');

    var header = section.append('div').attr('class', 'group-header');
    if (group.color) {
      header.append('div').attr('class', 'group-color').style('background', group.color);
    }
    header.append('div').attr('class', 'group-title').text(group.label);
    header.append('div').attr('class', 'group-count').text(group.features.length);
    if (group.desc) {
      header.append('div').attr('class', 'group-desc').text('\u2014 ' + group.desc);
    }

    var grid = section.append('div').attr('class', 'card-grid');

    group.features.forEach(function(f) {
      var card = grid.append('div')
        .attr('class', 'feature-card' + (FM.state.pinned === f.id ? ' selected' : ''))
        .attr('data-id', f.id);

      var st = FM.statusMap[f.status] || {color: '#888', label: f.status};
      var sec = f.sector ? FM.sectorMap[f.sector] : null;
      var ring = FM.ringMap[f.ring];

      if (sec) {
        card.style('border-left', '4px solid ' + (sec.color || '#888'));
      }

      var hdr = card.append('div').attr('class', 'card-header');
      hdr.append('span').attr('class', 'card-status').style('background', st.color || '#888')
        .text(st.label || f.status);
      if (ring) {
        var rc = ringColor(ring.index, FM.data.rings.length);
        hdr.append('span').attr('class', 'card-ring')
          .style('background', rc.bg).style('color', rc.fg)
          .text(ring.label);
      }
      if (sec) {
        hdr.append('span').attr('class', 'card-sector').style('color', sec.color || '#888').text(sec.name);
      }

      card.append('div').attr('class', 'card-name').text(f.name);

      if (f.description) {
        card.append('div').attr('class', 'card-desc').text(f.description);
      }

      var footer = card.append('div').attr('class', 'card-footer');
      if (f.components && f.components.length) {
        f.components.forEach(function(c) {
          var comp = FM.componentMap[c];
          footer.append('span').attr('class', 'card-tag').text(comp ? comp.label : c);
        });
      }
      if (f.tags && f.tags.length) {
        f.tags.forEach(function(t) {
          var tag = FM.tagMap[t];
          footer.append('span').attr('class', 'card-tag').style('background', FM.css('--tag-alt-bg')).style('color', FM.css('--tag-alt-color'))
            .text(tag ? tag.label : t);
        });
      }
      if (f.dependencies && f.dependencies.length) {
        footer.append('span').attr('class', 'card-dep-indicator')
          .html('\u2190 ' + f.dependencies.length + ' dep' + (f.dependencies.length > 1 ? 's' : ''));
      }
      if (FM.unlocks[f.id] && FM.unlocks[f.id].length) {
        footer.append('span').attr('class', 'card-dep-indicator')
          .html('\u2192 unlocks ' + FM.unlocks[f.id].length);
      }

      card.on('click', function() {
        if (FM.state.pinned === f.id) {
          FM.hideDetail();
          d3.selectAll('.feature-card').classed('selected', false);
        } else {
          FM.showDetail(f);
          d3.selectAll('.feature-card').classed('selected', false);
          card.classed('selected', true);
        }
      });
    });
  });
}

function buildGroups(features) {
  var groups = [];

  if (groupBy === 'none') {
    groups.push({label: 'All Features', features: features});
    return groups;
  }

  var groupMap = {};
  var groupOrder = [];

  if (groupBy === 'sector') {
    var coreFeatures = features.filter(function(f) { return !f.sector; });
    if (coreFeatures.length) {
      groups.push({label: 'Core', color: '#64748b', desc: 'Foundation features', features: coreFeatures});
    }
    FM.data.sectors.forEach(function(s) {
      var sf = features.filter(function(f) { return f.sector === s.id; });
      if (sf.length) {
        groups.push({label: s.name, color: s.color, desc: s.description, features: sf});
      }
    });
    return groups;
  }

  if (groupBy === 'status') {
    FM.data.statuses.forEach(function(s) {
      var sf = features.filter(function(f) { return f.status === s.id; });
      if (sf.length) {
        groups.push({label: s.label, color: s.color, features: sf});
      }
    });
    return groups;
  }

  if (groupBy === 'ring') {
    FM.data.rings.forEach(function(r, i) {
      var sf = features.filter(function(f) { return f.ring === r.id; });
      if (sf.length) {
        var rc = ringColor(i, FM.data.rings.length);
        groups.push({label: r.label, color: rc.bg, desc: r.description, features: sf});
      }
    });
    return groups;
  }

  return [{label: 'All Features', features: features}];
}

})();
