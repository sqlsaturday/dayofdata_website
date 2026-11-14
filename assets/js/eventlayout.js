/* Behavior for the custom event layouts (_includes/eventlayout.html).
   - readable text on the event's own colors
   - hides registration / call for speakers once their date has passed
   - tabs, schedule popup, "Show more"
   - draws speakers, sessions and the schedule from Sessionize JSON when sessionizetype is "json" */
(function () {
  'use strict';
  var root = document.querySelector('.dod');
  if (!root) { return; }
  root.classList.add('dod-js');

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined && text !== null) { e.textContent = text; }
    return e;
  }

  /* ---- Colors: pick dark or white text for the primary and button colors ---- */
  function luminance(hex) {
    var h = String(hex || '').trim().replace('#', '');
    if (h.length === 3) { h = h.split('').map(function (c) { return c + c; }).join(''); }
    if (!/^[0-9a-f]{6}$/i.test(h)) { return null; }
    var v = [0, 2, 4].map(function (i) {
      var x = parseInt(h.substr(i, 2), 16) / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  [['--dod-primary', '--dod-on-primary'], ['--dod-button', '--dod-on-button']].forEach(function (pair) {
    var l = luminance(getComputedStyle(root).getPropertyValue(pair[0]));
    if (l !== null) { root.style.setProperty(pair[1], l > 0.3 ? '#12222B' : '#FFFFFF'); }
  });

  /* ---- Dates: anything marked data-dod-hide-after="<unix seconds>" disappears after that time ---- */
  var now = Date.now() / 1000;
  root.querySelectorAll('[data-dod-hide-after]').forEach(function (n) {
    var until = parseInt(n.getAttribute('data-dod-hide-after'), 10);
    if (until && now > until) { n.hidden = true; }
  });

  /* ---- Counts ---- */
  function setCount(name, value) {
    root.querySelectorAll('[data-dod-count="' + name + '"]').forEach(function (n) { n.textContent = value ? (n.getAttribute('data-dod-count-prefix') || '') + value : ''; });
    root.querySelectorAll('[data-dod-count-row="' + name + '"]').forEach(function (n) { n.hidden = !value; });
  }

  /* ---- Tabs ---- */
  var tabButtons = root.querySelectorAll('[data-dod-tab-btn]');
  function showTab(name) {
    if (!tabButtons.length) { return; }
    tabButtons.forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-dod-tab-btn') === name ? 'true' : 'false'); });
    root.querySelectorAll('[data-dod-tab]').forEach(function (s) {
      if (s.getAttribute('data-dod-tab') === name) { s.removeAttribute('data-dod-off'); } else { s.setAttribute('data-dod-off', ''); }
    });
  }
  if (tabButtons.length) {
    tabButtons.forEach(function (b) { b.addEventListener('click', function () { showTab(b.getAttribute('data-dod-tab-btn')); }); });
    showTab('attend');
    root.addEventListener('click', function (ev) {
      var link = ev.target.closest('[data-dod-goto]');
      if (link) { showTab(link.getAttribute('data-dod-goto')); }
    });
  }

  /* ---- Sponsorship plan: any link to it opens the full plan ---- */
  function openPlan() {
    var plan = root.querySelector('#sponsorship details');
    if (plan) { plan.open = true; }
  }
  root.addEventListener('click', function (ev) {
    if (ev.target.closest('a[href="#sponsorship"]')) { openPlan(); }
  });
  if (location.hash === '#sponsorship') { openPlan(); }

  /* ---- Show more / Show less ---- */
  function clamp(node) {
    if (node.scrollHeight === 0 && !node.textContent.trim()) { return; }
    node.classList.add('dod-clamp', 'is-clamped');
    var btn = el('button', 'dod-more', 'Show more');
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', function () {
      var open = node.classList.toggle('is-clamped') === false;
      btn.textContent = open ? 'Show less' : 'Show more';
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    node.insertAdjacentElement('afterend', btn);
  }
  root.querySelectorAll('[data-dod-clamp]').forEach(clamp);

  /* ---- Schedule popup ---- */
  var scheduleLoaded = false;
  root.addEventListener('click', function (ev) {
    var opener = ev.target.closest('[data-dod-open]');
    if (opener) {
      var dlg = document.getElementById(opener.getAttribute('data-dod-open'));
      if (dlg) {
        if (typeof dlg.showModal === 'function') { dlg.showModal(); } else { dlg.setAttribute('open', ''); }
        if (!scheduleLoaded) { scheduleLoaded = true; loadSchedule(dlg); }
      }
      return;
    }
    var closer = ev.target.closest('[data-dod-close]');
    if (closer) {
      var d = closer.closest('dialog');
      if (d) { if (typeof d.close === 'function') { d.close(); } else { d.removeAttribute('open'); } }
    }
  });
  root.querySelectorAll('dialog').forEach(function (d) {
    d.addEventListener('click', function (ev) { if (ev.target === d && typeof d.close === 'function') { d.close(); } });
  });

  /* ---- Sessionize helpers ---- */
  function getJson(url) {
    return fetch(url).then(function (r) { if (!r.ok) { throw new Error('HTTP ' + r.status); } return r.json(); });
  }
  function fail(box, what) {
    box.textContent = '';
    box.appendChild(el('p', 'dod-loading', 'The ' + what + ' could not be loaded right now. Please try again later.'));
  }
  function time(iso) {
    var m = /T(\d\d):(\d\d)/.exec(iso || '');
    if (!m) { return ''; }
    var h = parseInt(m[1], 10);
    return ((h + 11) % 12 + 1) + ':' + m[2] + (h < 12 ? ' am' : ' pm');
  }
  function minutes(a, b) {
    var x = Date.parse(a), y = Date.parse(b);
    return (isNaN(x) || isNaN(y)) ? 0 : Math.round((y - x) / 60000);
  }
  function fileKind(url) {
    var m = /\.([a-z0-9]+)$/i.exec(String(url || '').split('?')[0]);
    var ext = m ? m[1].toLowerCase() : '';
    if (ext === 'pptx' || ext === 'ppt') { return 'PowerPoint'; }
    if (ext === 'pdf') { return 'PDF'; }
    if (ext === 'zip') { return 'zip'; }
    return '';
  }
  /* Level, slides and demos come from Sessionize categories and custom questions, when the endpoint includes them. */
  function sessionExtras(s) {
    var out = { level: '', slides: null, demos: null };
    (s.categories || []).forEach(function (c) {
      if (/level/i.test(c.name || '') && c.categoryItems && c.categoryItems.length) { out.level = c.categoryItems.map(function (i) { return i.name; }).join(', '); }
    });
    (s.questionAnswers || []).forEach(function (q) {
      var name = q.question || '';
      var answer = q.answer;
      if (!answer) { return; }
      if (/level/i.test(name) && !out.level) { out.level = String(answer); return; }
      if (!/^https?:/i.test(answer)) { return; }
      var kind = fileKind(answer);
      if (!kind) { return; }
      if (/demo/i.test(name)) { out.demos = { url: answer, kind: kind }; }
      else if (/present|slide|deck|powerpoint/i.test(name)) { out.slides = { url: answer, kind: kind }; }
    });
    return out;
  }
  function tagRow(s, extras, withLength) {
    var row = el('div', 'dod-tags');
    if (extras.level) { row.appendChild(el('span', '', 'Level: ' + extras.level)); }
    if (withLength) {
      var len = minutes(s.startsAt, s.endsAt);
      if (len > 0) { row.appendChild(el('span', '', len + ' min')); }
    }
    [['slides', 'Slides'], ['demos', 'Demos']].forEach(function (p) {
      var f = extras[p[0]];
      if (!f) { return; }
      var a = el('a', '', p[1] + ' (' + f.kind + ')');
      a.href = f.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      row.appendChild(a);
    });
    return row.childNodes.length ? row : null;
  }
  function speakerNames(s) {
    return (s.speakers || []).map(function (p) { return p.name; }).join(', ');
  }
  function flatSessions(groups) {
    var list = [];
    (groups || []).forEach(function (g) { (g.sessions || []).forEach(function (s) { list.push(s); }); });
    return list;
  }

  /* ---- Speakers ---- */
  var linkIcons = [[/linkedin/i, 'fab fa-linkedin-in'], [/twitter|^x\b/i, 'fab fa-twitter'], [/blog/i, 'fas fa-pen'], [/company|website/i, 'fas fa-globe'], [/sessionize/i, 'fas fa-link'], [/facebook/i, 'fab fa-facebook-f'], [/instagram/i, 'fab fa-instagram'], [/github/i, 'fab fa-github'], [/youtube/i, 'fab fa-youtube']];
  function speakerCard(sp) {
    var card = el('article', 'dod-speaker');
    var top = el('div', 'dod-speaker__top');
    var photo;
    if (sp.profilePicture) {
      photo = el('img', 'dod-speaker__photo');
      photo.src = sp.profilePicture; photo.alt = ''; photo.loading = 'lazy';
    } else {
      var parts = String(sp.fullName || '').split(',')[0].trim().split(/\s+/);
      photo = el('span', 'dod-speaker__photo', ((parts[0] || ' ')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase());
      photo.setAttribute('aria-hidden', 'true');
    }
    top.appendChild(photo);
    var who = el('div');
    who.appendChild(el('div', 'dod-speaker__name', sp.fullName));
    if (sp.tagLine) { who.appendChild(el('div', 'dod-speaker__tag', sp.tagLine)); }
    top.appendChild(who);
    card.appendChild(top);
    if (sp.bio) {
      var bio = el('p', 'dod-speaker__bio', sp.bio);
      card.appendChild(bio);
      clamp(bio);
    }
    if (sp.sessions && sp.sessions.length) {
      card.appendChild(el('p', 'dod-speaker__sessions', (sp.sessions.length === 1 ? 'Session: ' : 'Sessions: ') + sp.sessions.map(function (s) { return s.name; }).join('; ')));
    }
    if (sp.links && sp.links.length) {
      var icons = el('div', 'dod-icons');
      sp.links.forEach(function (l) {
        if (!l.url) { return; }
        var label = l.title || l.linkType || 'Link';
        var icon = 'fas fa-link';
        for (var i = 0; i < linkIcons.length; i++) { if (linkIcons[i][0].test(label + ' ' + (l.linkType || ''))) { icon = linkIcons[i][1]; break; } }
        var a = el('a');
        a.href = l.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = label;
        var i2 = el('span', icon); i2.setAttribute('aria-hidden', 'true');
        if (/sessionize/i.test(label + ' ' + (l.linkType || '') + ' ' + l.url)) {
          /* Sessionize has no icon in Font Awesome, so use its own site icon and fall back to a link icon. */
          var logo = el('img', 'dod-ico-img');
          logo.src = 'https://sessionize.com/favicon.ico'; logo.alt = ''; logo.width = 18; logo.height = 18;
          logo.addEventListener('error', function () { logo.replaceWith(i2); });
          a.appendChild(logo);
        } else {
          a.appendChild(i2);
        }
        a.appendChild(el('span', 'sr-only', label));
        icons.appendChild(a);
      });
      card.appendChild(icons);
    }
    return card;
  }
  root.querySelectorAll('[data-dod-speakers]').forEach(function (box) {
    getJson(box.getAttribute('data-dod-speakers')).then(function (list) {
      list = (list || []).slice().sort(function (a, b) { return String(a.fullName).localeCompare(String(b.fullName)); });
      box.textContent = '';
      setCount('speakers', list.length || '');
      if (!list.length) { box.appendChild(el('p', 'dod-loading', 'Speakers have not been announced yet.')); return; }
      var grid = el('div', 'dod-speakers__grid');
      var first = 12;
      list.forEach(function (sp, i) { var c = speakerCard(sp); if (i >= first) { c.hidden = true; } grid.appendChild(c); });
      box.appendChild(grid);
      if (list.length > first) {
        var all = el('button', 'dod-btn dod-btn--line dod-speakers__all', 'Show all ' + list.length + ' speakers');
        all.type = 'button';
        all.addEventListener('click', function () { grid.querySelectorAll('[hidden]').forEach(function (n) { n.hidden = false; }); all.remove(); });
        box.appendChild(all);
      }
    }).catch(function () { fail(box, 'speaker list'); });
  });

  /* ---- Submitted sessions (shown until the schedule is posted) ---- */
  root.querySelectorAll('[data-dod-sessionlist]').forEach(function (box) {
    getJson(box.getAttribute('data-dod-sessionlist')).then(function (groups) {
      var list = flatSessions(groups).filter(function (s) { return !s.isServiceSession; });
      box.textContent = '';
      setCount('sessions', list.length || '');
      if (!list.length) { box.appendChild(el('p', 'dod-loading', 'No sessions have been submitted yet.')); return; }
      var grid = el('div', 'dod-sessionlist__grid');
      list.forEach(function (s) {
        var card = el('article', 'dod-session');
        card.appendChild(el('div', 'dod-session__title', s.title));
        var who = speakerNames(s);
        if (who) { card.appendChild(el('div', 'dod-session__who', who)); }
        if (s.description) { var d = el('p', 'dod-session__desc', s.description); card.appendChild(d); clamp(d); }
        var tags = tagRow(s, sessionExtras(s), true);
        if (tags) { card.appendChild(tags); }
        grid.appendChild(card);
      });
      box.appendChild(grid);
    }).catch(function () { fail(box, 'session list'); });
  });

  /* ---- Schedule (inside the popup) ---- */
  function loadSchedule(dlg) {
    var box = dlg.querySelector('[data-dod-schedule]');
    if (!box) { return; }
    var sessionsUrl = box.getAttribute('data-dod-sessions');
    var extrasById = {};
    var extrasReady = sessionsUrl ? getJson(sessionsUrl).then(function (groups) {
      flatSessions(groups).forEach(function (s) { extrasById[s.id] = sessionExtras(s); });
    }).catch(function () { /* the schedule still works without the extra fields */ }) : Promise.resolve();
    Promise.all([getJson(box.getAttribute('data-dod-schedule')), extrasReady]).then(function (res) {
      var days = res[0] || [];
      box.textContent = '';
      days.forEach(function (day) {
        var d = new Date(String(day.date).slice(0, 10) + 'T12:00:00');
        box.appendChild(el('h3', 'dod-day', isNaN(d) ? '' : d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })));
        (day.timeSlots || []).forEach(function (slot) {
          var row = el('div', 'dod-slot');
          var first = slot.rooms && slot.rooms[0] && slot.rooms[0].session;
          row.appendChild(el('div', 'dod-slot__time', first ? time(first.startsAt) : ''));
          var items = el('div', 'dod-slot__items');
          (slot.rooms || []).forEach(function (r) {
            var s = r.session;
            if (!s) { return; }
            var len = minutes(s.startsAt, s.endsAt);
            if (s.isServiceSession) {
              items.appendChild(el('div', 'dod-session dod-session--break', s.title + (len ? ', ' + len + ' min' : '') + (r.name ? '. ' + r.name : '')));
              return;
            }
            var card = el('div', 'dod-session');
            card.appendChild(el('div', 'dod-session__room', r.name || s.room || ''));
            card.appendChild(el('div', 'dod-session__title', s.title));
            var who = speakerNames(s);
            if (who) { card.appendChild(el('div', 'dod-session__who', who)); }
            var tags = tagRow(s, extrasById[s.id] || sessionExtras(s), true);
            if (tags) { card.appendChild(tags); }
            items.appendChild(card);
          });
          row.appendChild(items);
          box.appendChild(row);
        });
      });
      box.appendChild(el('p', 'dod-small', 'Session and speaker management powered by Sessionize.com'));
    }).catch(function () { fail(box, 'schedule'); });
  }
})();
