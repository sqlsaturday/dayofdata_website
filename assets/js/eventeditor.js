/* Event data editor (eventeditor.html).
   Load an event's data file (_data/events/*.yml), edit it in a form or as YAML, check it,
   preview the real event page, then download it, copy it, or commit it to GitHub.
   Needs: js-yaml 3 (window.jsyaml) and eventeditor-liquid.js (window.DodLiquid). */
(function () {
  'use strict';

  var root = document.getElementById('dod-ed');
  if (!root || !window.jsyaml || !window.DodLiquid) { return; }
  var YAML = window.jsyaml;
  var INDEX = {};
  try { INDEX = JSON.parse(document.getElementById('dod-ed-index').textContent); } catch (e) { INDEX = { posts: [], files: [] }; }

  var CFG = {
    upstream: root.getAttribute('data-upstream') || 'sqlsaturday/dayofdata_website',
    upstreamBranch: root.getAttribute('data-branch') || 'main',
    dataDir: '_data/events/',
    timezone: INDEX.timezone || root.getAttribute('data-timezone') || 'UTC',
    baseurl: (root.getAttribute('data-baseurl') || '').replace(/\/$/, ''),
    assetOrigin: (root.getAttribute('data-asset-origin') || window.location.origin).replace(/\/$/, ''),
    api: 'https://api.github.com',
    raw: 'https://raw.githubusercontent.com'
  };
  var LS = {
    get: function (k, d) { try { var v = window.localStorage.getItem('dodEditor.' + k); return v === null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { window.localStorage.setItem('dodEditor.' + k, v); } catch (e) { /* storage off */ } },
    del: function (k) { try { window.localStorage.removeItem('dodEditor.' + k); } catch (e) { /* storage off */ } }
  };
  var SS = {
    get: function (k) { try { return window.sessionStorage.getItem('dodEditor.' + k); } catch (e) { return null; } },
    set: function (k, v) { try { window.sessionStorage.setItem('dodEditor.' + k, v); } catch (e) { /* storage off */ } },
    del: function (k) { try { window.sessionStorage.removeItem('dodEditor.' + k); } catch (e) { /* storage off */ } }
  };

  /* ================= Small helpers ================= */
  function $(sel, ctx) { return (ctx || root).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || root).querySelectorAll(sel)); }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) { return; }
        if (k === 'text') { e.textContent = v; }
        else if (k === 'html') { e.innerHTML = v; }
        else if (k === 'class') { e.className = v; }
        else if (k.indexOf('on') === 0 && typeof v === 'function') { e.addEventListener(k.slice(2), v); }
        else { e.setAttribute(k, v === true ? '' : v); }
      });
    }
    (kids || []).forEach(function (c) { if (c !== null && c !== undefined) { e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); } });
    return e;
  }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function blankVal(v) { return v === null || v === undefined || (typeof v === 'string' && v.trim() === ''); }
  function deepEqual(a, b) {
    if (a === undefined) { a = null; }
    if (b === undefined) { b = null; }
    if (a === b) { return true; }
    if (typeof a !== typeof b || a === null || b === null) { return false; }
    if (Array.isArray(a)) { return Array.isArray(b) && a.length === b.length && a.every(function (x, i) { return deepEqual(x, b[i]); }); }
    if (isObj(a)) {
      if (!isObj(b)) { return false; }
      var ka = Object.keys(a), kb = Object.keys(b);
      if (ka.length !== kb.length) { return false; }
      return ka.every(function (k) { return Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]); });
    }
    return false;
  }
  function debounce(fn, ms) { var t; return function () { var args = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, args); }, ms); }; }
  function b64utf8(s) { var bytes = new TextEncoder().encode(s), bin = ''; for (var i = 0; i < bytes.length; i += 0x8000) { bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); } return btoa(bin); }
  function fromB64utf8(b) { var bin = atob(b.replace(/\s/g, '')), bytes = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) { bytes[i] = bin.charCodeAt(i); } return new TextDecoder().decode(bytes); }
  /* Jekyll reads only the first YAML document in a data file, so do the same. */
  function parseYaml(text) {
    try { return YAML.load(text, { schema: YAML.CORE_SCHEMA }); }
    catch (e) {
      if (!/single document/.test(e.message)) { throw e; }
      var docs = [];
      YAML.loadAll(text, function (d) { docs.push(d); }, { schema: YAML.CORE_SCHEMA });
      return docs[0];
    }
  }
  function docCount(text) { var n = 0; try { YAML.loadAll(text, function () { n++; }, { schema: YAML.CORE_SCHEMA }); } catch (e) { return 1; } return n; }
  function todayISO() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  /* ================= Form schema ================= */
  /* types: text, textarea, html, url, email, number, bool, select, color, datetime, cfsdate, image, list, map, yaml */
  var BOOL = { type: 'bool' };
  var SECTIONS = [
    { id: 'basics', title: 'Basics', fields: [
      { k: 'name', label: 'Event name', type: 'text', required: true, help: 'Shown as the page heading, for example "Day of Data Jacksonville 2027".' },
      { k: 'primarytag', label: 'Primary tag', type: 'text', help: 'Usually the city.' },
      { k: 'date', label: 'Event date and start time', type: 'datetime', required: true, help: 'The main event day. Registration and other buttons hide after this day.' },
      { k: 'logo', label: 'Logo', type: 'image', help: 'A path on this site, for example /assets/img/logos/YourLogo.png, or a full web address.' },
      { k: 'logocredit', label: 'Logo credit', type: 'text' },
      { k: 'physical', label: 'In person', type: 'bool' },
      { k: 'virtual', label: 'Virtual', type: 'bool' },
      { k: 'hybrid', label: 'Hybrid (streamed and live)', type: 'bool' },
      { k: 'capacity', label: 'Capacity', type: 'number' },
      { k: 'lunchcost', label: 'Lunch cost', type: 'text', placeholder: '$15 (optional)' },
      { k: 'officialwebsite', label: 'Official website', type: 'url' },
      { k: 'postponed', label: 'Postponed', type: 'select', options: [['', 'No'], [1, 'Yes, postponed']], help: 'Shows "Postponed" in place of the date.' },
      { k: 'eventupdate', label: 'Postponement note', type: 'text' },
      { k: 'description', label: 'Description', type: 'html', rows: 10 }
    ] },
    { id: 'layout', title: 'Page layout and colors', fields: [
      { k: 'eventlayout', label: 'Layout', type: 'select', options: [['', 'Default (classic page)'], ['poster', 'Poster'], ['rail', 'Side rail'], ['tabs', 'Tabs']], help: 'See the layout examples in the documentation.' },
      { k: 'colorprimary', label: 'Primary color', type: 'color', help: 'Header, headings and the selected tab. Pick a dark or strong color.' },
      { k: 'colorsecondary', label: 'Secondary color', type: 'color', help: 'Small accents.' },
      { k: 'colorbutton', label: 'Button color', type: 'color', help: 'Register now, Submit your session and other main buttons.' },
      { k: 'colorlink', label: 'Link color', type: 'color', help: 'Text links. Pick a color that is easy to read on white.' }
    ] },
    { id: 'location', title: 'Location', fields: [
      { k: 'eventlocation', label: 'Location', type: 'html', rows: 5 },
      { k: 'eventlocationurl', label: 'Location map link', type: 'url' },
      { k: 'googlemapurl', label: 'Google map embed address', type: 'url', help: 'The src of a Google Maps embed, with no styling.' },
      { k: 'parkingdesc', label: 'Parking', type: 'html', rows: 3 },
      { k: 'eventhotel', label: 'Hotel', type: 'html', rows: 3 }
    ] },
    { id: 'registration', title: 'Registration', fields: [
      { k: 'registrationtype', label: 'Registration type', type: 'select', options: [['', 'Button that links to the registration address'], ['url', 'Button (url)'], ['zeffy', 'Embed a Zeffy form in the page']] },
      { k: 'registrationurl', label: 'Registration address', type: 'url', help: 'For Zeffy, the embed address: https://www.zeffy.com/embed/ticketing/your-form' },
      { k: 'eventbriteembed', code: true, label: 'Eventbrite embed code', type: 'html', rows: 3, advanced: true },
      { k: 'eventcountdown', label: 'Show a countdown', type: 'bool' },
      { k: 'countdownscript', code: true, label: 'Countdown script', type: 'html', rows: 3, advanced: true }
    ] },
    { id: 'precons', title: 'Pre-cons', fields: [
      { k: 'precons', label: 'Has pre-cons (classic page)', type: 'bool' },
      { k: 'preconintro', label: 'Pre-con intro', type: 'text', placeholder: 'Pre-cons will be held on Friday.' },
      { k: 'preconregistrationtype', label: 'Pre-con registration', type: 'select', options: [['', 'Each pre-con has its own register link'], ['zeffy', 'One Zeffy form for all pre-cons']] },
      { k: 'preconregistrationurl', label: 'Pre-con Zeffy address', type: 'url' },
      { group: 'precon', n: 1 }, { group: 'precon', n: 2 }, { group: 'precon', n: 3 },
      { k: 'precondetail', label: 'Older pre-con block (classic page)', type: 'html', rows: 4, advanced: true }
    ] },
    { id: 'speakers', title: 'Speakers, sessions and schedule', fields: [
      { k: 'sessionizetype', label: 'Sessionize data', type: 'select', options: [['', 'Sessionize embeds'], ['json', 'JSON endpoints (newer layouts draw the cards)']] },
      { k: 'callforspeakers', label: 'Call for speakers open', type: 'bool' },
      { k: 'callforspeakersurl', label: 'Call for speakers address', type: 'url', placeholder: 'https://sessionize.com/your-event/' },
      { k: 'callforspeakersenddate', label: 'Call for speakers end date', type: 'cfsdate' },
      { k: 'speakertext', label: 'Speaker text', type: 'text' },
      { k: 'speakerlisturl', label: 'Speakers address', type: 'url', placeholder: 'https://sessionize.com/api/v2/YOUR-ID/view/Speakers' },
      { k: 'submittedsessionurl', label: 'Submitted sessions address', type: 'url', placeholder: 'https://sessionize.com/api/v2/YOUR-ID/view/Sessions' },
      { k: 'scheduleurl', label: 'Schedule address', type: 'url', placeholder: 'https://sessionize.com/api/v2/YOUR-ID/view/GridSmart', help: 'Leave blank until the schedule is ready.' },
      { k: 'printscheduleurl', label: 'Print schedule address', type: 'url' },
      { k: 'sessionizeappurl', label: 'Sessionize app address (Build My Schedule)', type: 'url' },
      { k: 'scheduletimezone', label: 'Schedule time zone', type: 'text', placeholder: 'Eastern Daylight Savings time UTC -4' },
      { k: 'scheduleheight', label: 'Schedule height (classic page)', type: 'number', advanced: true },
      { k: 'schedulehtml', code: true, label: 'Schedule HTML', type: 'html', rows: 4, advanced: true }
    ] },
    { id: 'sponsors', title: 'Sponsors', fields: [
      { k: 'sponsorpaymenttype', label: 'Sponsorship payment', type: 'select', options: [['', 'Become a sponsor button links to the address'], ['zeffy', 'Embed a Zeffy sponsorship form']] },
      { k: 'sponsorpaymenturl', label: 'Sponsorship payment address', type: 'url' },
      { k: 'sponsorscontacturl', label: 'Sponsor information link', type: 'url' },
      { k: 'optInGlobalSponsor', label: 'Show global sponsors', type: 'select', options: [['', 'Not set'], [0, 'No (0)'], [1, 'Yes (1)']], advanced: true },
      { k: 'sponsors', label: 'Sponsors', type: 'list', item: 'sponsor', fields: [
        { k: 'type', label: 'Level', type: 'text', list: ['Event Host', 'Platinum', 'Gold', 'Silver', 'Bronze', 'Community'] },
        { k: 'link', label: 'Website', type: 'url' },
        { k: 'image', label: 'Logo image', type: 'image' },
        { k: 'alt', label: 'Logo description', type: 'text' },
        { k: 'width', label: 'Width', type: 'number' },
        { k: 'height', label: 'Height', type: 'number' }
      ] },
      { k: 'sponsorplan', label: 'Sponsorship plan', type: 'html', rows: 10 }
    ] },
    { id: 'people', title: 'Organizers and volunteers', fields: [
      { k: 'organizers', label: 'Organizers', type: 'list', item: 'organizer', fields: [
        { k: 'name', label: 'Name', type: 'text' },
        { k: 'email', label: 'Email', type: 'email' },
        { k: 'twitter', label: 'X / Twitter handle', type: 'text', placeholder: 'handle, without @' },
        { k: 'linkedin', label: 'LinkedIn address', type: 'url' },
        { k: 'url', label: 'Website', type: 'url' }
      ] },
      { k: 'volunteers', label: 'Volunteers', type: 'map', fields: [
        { k: 'description', label: 'Volunteer text', type: 'textarea', rows: 2 },
        { k: 'volunteerurl', label: 'Volunteer sign-up address', type: 'url' }
      ] }
    ] },
    { id: 'social', title: 'Social media', fields: [
      { k: 'social', label: 'Social media', type: 'map', fields: [
        { k: 'twitter', label: 'X / Twitter handle', type: 'text', placeholder: 'handle, without @' },
        { k: 'linkedin', label: 'LinkedIn address', type: 'url' },
        { k: 'meetup', label: 'Meetup address', type: 'url' },
        { k: 'youtube', label: 'YouTube address', type: 'url' },
        { k: 'facebook', label: 'Facebook page name', type: 'text' },
        { k: 'instagram', label: 'Instagram handle', type: 'text' },
        { k: 'tiktok', label: 'TikTok handle', type: 'text' },
        { k: 'pinterest', label: 'Pinterest handle', type: 'text' }
      ] }
    ] },
    { id: 'more', title: 'More options', fields: [
      { k: 'cocurl', label: 'Code of conduct address', type: 'url' },
      { k: 'dataprivacy', label: 'Data privacy text', type: 'html', rows: 3 },
      { k: 'join', label: 'Virtual rooms (join)', type: 'yaml', help: 'description, then rooms with name and url.' },
      { k: 'downloads', label: 'Downloads', type: 'yaml', help: 'A list of name and url.' },
      { k: 'eventnumber', label: 'Event number (for downloads)', type: 'text' }
    ] }
  ];
  var PRECON_FIELDS = [
    { s: 'preconname', label: 'Title', type: 'text' },
    { s: 'preconspeaker', label: 'Speaker', type: 'text' },
    { s: 'preconspeakerimageurl', label: 'Speaker photo address', type: 'url', help: 'For two speakers, put both addresses in quotes with a comma between them.' },
    { s: 'precondescription', label: 'Description', type: 'html', rows: 4 },
    { s: 'preconregurl', label: 'Register address', type: 'url' }
  ];
  /* Expand into a flat, ordered list of known top-level keys (used for new-key placement and "other keys"). */
  var FIELD_BY_KEY = {};
  var KEY_ORDER = [];
  SECTIONS.forEach(function (sec) {
    sec.fields.forEach(function (f) {
      if (f.group === 'precon') {
        PRECON_FIELDS.forEach(function (pf) {
          var k = pf.s + f.n;
          FIELD_BY_KEY[k] = { k: k, label: pf.label, type: pf.type, rows: pf.rows, help: pf.help, section: sec.id };
          KEY_ORDER.push(k);
        });
      } else {
        f.section = sec.id;
        FIELD_BY_KEY[f.k] = f;
        KEY_ORDER.push(f.k);
      }
    });
  });
  /* Older spellings some templates still read; treated as known so they stay under "other keys" only when present. */
  var URL_KEYS = Object.keys(FIELD_BY_KEY).filter(function (k) { return FIELD_BY_KEY[k].type === 'url'; });

  /* ================= YAML: block split and minimal-diff writer ================= */
  var KEY_LINE = /^(?:"((?:[^"\\]|\\.)*)"|'((?:[^']|'')*)'|([^\s#'"\-?:,\[\]{}&*!|>%@`][^:#]*?|-[^\s:#][^:#]*?))\s*:(?:\s|$)/;

  function splitBlocks(text) {
    var lines = text.replace(/\r\n?/g, '\n').split('\n');
    var trailingNewline = lines.length > 1 && lines[lines.length - 1] === '';
    if (trailingNewline) { lines.pop(); }
    var pre = [], blocks = [], pending = [], cur = null;
    lines.forEach(function (line) {
      if (/^(---|\.\.\.)\s*$/.test(line) && !cur) { pre = pre.concat(pending); pending = []; pre.push(line); return; }
      var m = KEY_LINE.exec(line);
      if (m && line.charAt(0) !== ' ' && line.charAt(0) !== '\t') {
        var key = m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2].replace(/''/g, "'") : m[3].trim());
        /* blank lines before the first comment belong to the previous block, the rest lead into this one */
        var firstComment = -1;
        for (var i = 0; i < pending.length; i++) { if (/^\s*#/.test(pending[i])) { firstComment = i; break; } }
        var toPrev = firstComment < 0 ? pending : pending.slice(0, firstComment);
        var lead = firstComment < 0 ? [] : pending.slice(firstComment);
        if (cur) { cur.trail = cur.trail.concat(toPrev); } else { pre = pre.concat(toPrev); }
        cur = { key: key, lead: lead, body: [line], trail: [] };
        blocks.push(cur);
        pending = [];
        return;
      }
      if (line.trim() === '' || /^#/.test(line)) { pending.push(line); return; }
      /* indented line, or a "- item" at column 0: part of the current block */
      if (cur) { cur.body = cur.body.concat(pending); cur.body.push(line); pending = []; }
      else { pre = pre.concat(pending); pending = []; pre.push(line); }
    });
    return { pre: pre, blocks: blocks, post: pending, trailingNewline: trailingNewline };
  }

  var YAML11_WORDS = /^(y|n|yes|no|on|off|true|false|null|~|nil|yes!)$/i;
  function plainOk(s) {
    if (s === '' || s !== s.trim()) { return false; }
    if (YAML11_WORDS.test(s)) { return false; }
    if (/^[-+]?(\d[\d_]*(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/.test(s)) { return false; }
    if (/^[-+]?0[xob]/i.test(s) || /^[-+]?\.(inf|nan)$/i.test(s)) { return false; }
    if (/^[-+]?\d[\d_]*(:[0-5]?\d)+(\.\d*)?$/.test(s)) { return false; } /* YAML 1.1 sexagesimal: 9:30 would be a number */
    if (/^[-?:,\[\]{}#&*!|>'"%@`]/.test(s)) { return false; }
    if (/:(\s|$)|\s#|[\t\n\r]|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufeff]/.test(s)) { return false; }
    if (/^(---|\.\.\.)/.test(s)) { return false; }
    try { var o = parseYaml('k: ' + s); return o && o.k === s; } catch (e) { return false; }
  }
  function quote(s) { return JSON.stringify(s).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); }
  function scalar(v, hint, key) {
    if (v === null || v === undefined) { return ''; }
    if (typeof v === 'boolean' || typeof v === 'number') { return String(v); }
    var s = String(v);
    if (hint && hint.quoted && hint.quoted[s]) { return quote(s); }
    if (hint && hint.quotedKeys && key !== undefined && hint.quotedKeys[key]) { return quote(s); }
    return plainOk(s) ? s : quote(s);
  }
  /* keys whose values were written in double quotes, so a changed value keeps the same style */
  function quotedKeysOf(lines) {
    var out = {};
    lines.forEach(function (l) { var m = /^\s*(?:-\s+)?([^\s:#][^:#]*?)\s*:\s+"/.exec(l); if (m) { out[m[1]] = true; } });
    return out;
  }
  /* Reuse the original line when a rewritten line only differs by trailing spaces. */
  function reuseLines(gen, orig) {
    var pool = {};
    orig.forEach(function (l) { var k = l.replace(/\s+$/, ''); (pool[k] = pool[k] || []).push(l); });
    return gen.map(function (l) { var list = pool[l]; return list && list.length ? list.shift() : l; });
  }
  function quotedStrings(lines) {
    var out = {};
    lines.forEach(function (l) {
      var re = /:\s+"((?:[^"\\]|\\.)*)"\s*(#.*)?$|^\s*-\s+"((?:[^"\\]|\\.)*)"\s*$/g, m;
      while ((m = re.exec(l)) !== null) { try { out[JSON.parse('"' + (m[1] !== undefined ? m[1] : m[3]) + '"')] = true; } catch (e) { /* skip */ } }
    });
    return out;
  }
  function blockIndentOf(lines, keyIndent) {
    for (var i = 0; i < lines.length; i++) {
      var m = /^(\s*)[^\s:]+:\s*\|[-+0-9]*\s*$/.exec(lines[i]);
      if (m && m[1].length === keyIndent && lines[i + 1] !== undefined) {
        for (var j = i + 1; j < lines.length; j++) {
          if (lines[j].trim() === '') { continue; }
          var ind = /^(\s*)/.exec(lines[j])[1].length;
          return ind > keyIndent ? ind - keyIndent : null;
        }
      }
    }
    return null;
  }
  function keyText(k) { return plainOk(k) && !/[\s]/.test(k.charAt(0)) ? k : quote(k); }

  /* Write one key and value in the site's style: block scalars for multi-line HTML, quoted colors, two-space lists. */
  function emitKV(key, value, indent, hint) {
    var pad = new Array(indent + 1).join(' ');
    var head = pad + keyText(key) + ':';
    if (value === null || value === undefined) { return [head]; }
    if (typeof value === 'string' && value.indexOf('\n') >= 0) {
      var step = (hint && hint.blockIndent) || (indent === 0 ? 4 : 2);
      var chomp = /\n\n+$/.test(value) ? '+' : (/\n$/.test(value) ? '' : '-');
      var body = value.replace(/\n$/, '');
      if (chomp === '+') { body = value.slice(0, -1); }
      var ind = /^[ ]/.test(body) ? String(step) : '';
      var cpad = new Array(indent + step + 1).join(' ');
      return [head + ' |' + ind + chomp].concat(body.split('\n').map(function (l) { return l === '' ? '' : cpad + l; }));
    }
    if (Array.isArray(value)) {
      if (!value.length) { return [head + ' []']; }
      var out = [head];
      value.forEach(function (item) { out = out.concat(emitItem(item, indent + 2, hint)); });
      return out;
    }
    if (isObj(value)) {
      var ks = Object.keys(value);
      if (!ks.length) { return [head + ' {}']; }
      var lines = [head];
      ks.forEach(function (k) { lines = lines.concat(emitKV(k, value[k], indent + 2, hint ? { quoted: hint.quoted, quotedKeys: hint.quotedKeys } : null)); });
      return lines;
    }
    return [head + ' ' + scalar(value, hint, key)];
  }
  function emitItem(item, indent, hint) {
    var pad = new Array(indent + 1).join(' ');
    if (isObj(item)) {
      var ks = Object.keys(item);
      if (!ks.length) { return [pad + '- {}']; }
      var lines = [];
      ks.forEach(function (k, i) {
        var kv = emitKV(k, item[k], indent + 2, hint ? { quoted: hint.quoted, quotedKeys: hint.quotedKeys } : null);
        if (i === 0) { kv[0] = pad + '- ' + kv[0].slice(indent + 2); }
        lines = lines.concat(kv);
      });
      return lines;
    }
    if (Array.isArray(item)) {
      var sub = item.length ? [] : [pad + '- []'];
      item.forEach(function (x, i) { var l = emitItem(x, indent + 2, hint); if (i === 0) { l[0] = pad + '- ' + l[0].slice(indent + 2); } sub = sub.concat(l); });
      return sub;
    }
    if (typeof item === 'string' && item.indexOf('\n') >= 0) { return emitKV('x', item, indent, hint).map(function (l, i) { return i === 0 ? pad + '- ' + l.slice(indent + 3) : l; }); }
    return [pad + '- ' + scalar(item, hint)];
  }

  /* Keep every unchanged block exactly as it was; rewrite only what changed; place new keys near their neighbors. */
  function serialize(base, doc) {
    var split = base.split, orig = base.parsed || {};
    var out = split.pre.slice();
    var used = {};
    var docKeys = Object.keys(doc);
    var newKeys = docKeys.filter(function (k) { return !Object.prototype.hasOwnProperty.call(orig, k); });
    var anchored = {}; /* anchor key -> new keys to write after it */
    var tail = [];
    newKeys.forEach(function (k) {
      var pos = KEY_ORDER.indexOf(k), anchor = null;
      if (pos > 0) {
        for (var i = pos - 1; i >= 0; i--) {
          var cand = KEY_ORDER[i];
          if (Object.prototype.hasOwnProperty.call(orig, cand) && Object.prototype.hasOwnProperty.call(doc, cand)) { anchor = cand; break; }
        }
      }
      if (anchor) { (anchored[anchor] = anchored[anchor] || []).push(k); } else { tail.push(k); }
    });
    split.blocks.forEach(function (b) {
      used[b.key] = true;
      if (!Object.prototype.hasOwnProperty.call(doc, b.key)) { return; }
      out = out.concat(b.lead);
      var extra = anchored[b.key] || [];
      if (deepEqual(doc[b.key], orig[b.key])) {
        out = out.concat(b.body);
      } else {
        var keyIndent = 0;
        out = out.concat(reuseLines(emitKV(b.key, doc[b.key], 0, { quoted: quotedStrings(b.body), quotedKeys: quotedKeysOf(b.body), blockIndent: blockIndentOf(b.body, keyIndent) }), b.body));
      }
      extra.forEach(function (k) { out = out.concat(emitKV(k, doc[k], 0, null)); });
      out = out.concat(b.trail);
    });
    if (tail.length && out.length && out[out.length - 1].trim() !== '') { /* keep new keys apart from a trailing block scalar */ }
    tail.forEach(function (k) { if (!used[k]) { out = out.concat(emitKV(k, doc[k], 0, null)); } });
    out = out.concat(split.post);
    var text = out.join('\n');
    if (split.trailingNewline || !split.blocks.length) { text += '\n'; }
    return text;
  }
  function serializeFresh(doc) {
    var lines = [];
    Object.keys(doc).forEach(function (k) { lines = lines.concat(emitKV(k, doc[k], 0, null)); });
    return lines.join('\n') + '\n';
  }
  /* Serialize, then read it back and make sure it says exactly what the form says. */
  function safeSerialize(base, doc) {
    var attempts = [function () { return serialize(base, doc); }, function () { return serializeFresh(doc); }, function () { return YAML.dump(doc, { schema: YAML.CORE_SCHEMA, lineWidth: -1 }); }];
    for (var i = 0; i < attempts.length; i++) {
      var text;
      try { text = attempts[i](); } catch (e) { continue; }
      try { if (deepEqual(parseYaml(text) || {}, doc)) { return { text: text, mode: i }; } } catch (e2) { /* try the next writer */ }
    }
    return { text: serializeFresh(doc), mode: -1 };
  }

  /* ================= State ================= */
  var state = {
    key: null,          /* data key, e.g. SQLSat1168 */
    file: null,         /* e.g. SQLSat1168.yml */
    post: null,         /* index entry for the event post */
    source: null,       /* { repo, branch, sha, kind } where the file was loaded from */
    loadedText: '',     /* text as loaded: the diff baseline */
    base: null,         /* { text, parsed, split } the text the writer patches */
    doc: null,          /* current values */
    text: '',           /* current YAML */
    writeMode: 0,
    rawDirty: false
  };

  function setBase(text) {
    var parsed = parseYaml(text);
    if (parsed === null || parsed === undefined) { parsed = {}; }
    if (!isObj(parsed)) { throw new Error('The file must be a list of keys and values (a YAML mapping).'); }
    state.base = { text: text, parsed: parsed, split: splitBlocks(text) };
    state.doc = clone(parsed);
  }

  /* ================= Event picker and loading ================= */
  var posts = (INDEX.posts || []).slice();
  var postByKey = {};
  posts.forEach(function (p) { if (!postByKey[p.data] || p.date > postByKey[p.data].date) { postByKey[p.data] = p; } });

  function eventOptions() {
    var today = todayISO();
    var seen = {}, groups = { upcoming: [], past: [], examples: [], nopost: [] };
    posts.forEach(function (p) {
      if (seen[p.data]) { return; }
      seen[p.data] = true;
      var item = { key: p.data, label: p.title + ' (' + p.data + ', ' + p.date + ')', date: p.date };
      if (/template/i.test(p.data) || /template|example|test/i.test(p.title)) { groups.examples.push(item); }
      else if (p.date >= today) { groups.upcoming.push(item); }
      else { groups.past.push(item); }
    });
    (INDEX.files || []).forEach(function (f) {
      if (seen[f.key]) { return; }
      seen[f.key] = true;
      var item = { key: f.key, label: (f.name || f.key) + ' (' + f.key + (f.date ? ', ' + f.date : '') + ', no event post)', date: f.date || '' };
      if (/template|test/i.test(f.key)) { groups.examples.push(item); } else { groups.nopost.push(item); }
    });
    groups.upcoming.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    groups.past.sort(function (a, b) { return a.date > b.date ? -1 : 1; });
    return groups;
  }
  function fillPicker(filter) {
    var sel = $('#dod-ed-event');
    var keep = sel.value;
    sel.innerHTML = '';
    sel.appendChild(el('option', { value: '', text: 'Pick an event...' }));
    var g = eventOptions(), f = (filter || '').toLowerCase();
    [['upcoming', 'Upcoming events'], ['past', 'Past events'], ['examples', 'Layout examples and templates'], ['nopost', 'Data files without an event post']].forEach(function (pair) {
      var items = g[pair[0]].filter(function (i) { return !f || i.label.toLowerCase().indexOf(f) >= 0; });
      if (!items.length) { return; }
      var og = el('optgroup', { label: pair[1] });
      items.forEach(function (i) { og.appendChild(el('option', { value: i.key, text: i.label })); });
      sel.appendChild(og);
    });
    if (keep) { sel.value = keep; }
  }

  function dataPath(key) { return CFG.dataDir + key + '.yml'; }

  function fetchFile(repo, branch, path) {
    var token = gh.token();
    if (token) {
      return ghFetch('GET', '/repos/' + repo + '/contents/' + encodeURI(path) + '?ref=' + encodeURIComponent(branch)).then(function (j) {
        return { text: fromB64utf8(j.content || ''), sha: j.sha };
      });
    }
    return fetch(CFG.raw + '/' + repo + '/' + branch.split('/').map(encodeURIComponent).join('/') + '/' + encodeURI(path), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) { var e = new Error(r.status === 404 ? 'Not found: ' + repo + ' @ ' + branch + ' / ' + path : 'Could not load ' + path + ' (' + r.status + ')'); e.status = r.status; throw e; }
      return r.text().then(function (t) { return { text: t, sha: null }; });
    });
  }

  function loadEvent(key) {
    if (!key) { return; }
    var repo = $('#dod-ed-repo').value.trim() || CFG.upstream;
    var branch = $('#dod-ed-branch').value.trim() || CFG.upstreamBranch;
    status('Loading ' + key + '.yml from ' + repo + ' @ ' + branch + '...');
    fetchFile(repo, branch, dataPath(key)).then(function (res) {
      openText(res.text, { key: key, repo: repo, branch: branch, sha: res.sha, kind: 'github' });
    }).catch(function (err) {
      status('', true);
      showLoadError(err.message + (err.status === 404 ? '. Check the repository and branch, or pick another event.' : ''));
    });
  }

  function openText(text, src) {
    try { setBase(text); }
    catch (err) {
      state.key = src.key; state.file = src.key + '.yml'; state.source = src; state.loadedText = text;
      state.base = null; state.doc = null;
      $('#dod-ed-raw').value = text;
      showWorkspace();
      selectTab('yaml');
      showRawError(err);
      status('This file has a YAML error. Fix it on the YAML tab, then press Apply to form.', true);
      return;
    }
    state.key = src.key;
    state.file = src.key + '.yml';
    state.post = postByKey[src.key] || null;
    state.source = src;
    state.loadedText = text;
    state.rawDirty = false;
    state.extraKeys = [];
    showWorkspace();
    buildForm();
    refreshText();
    loadTemplateKeys();
    var where = src.kind === 'file' ? 'your computer' : (src.repo + ' @ ' + src.branch);
    status('Editing ' + state.file + ' from ' + where + (src.sha ? ' (' + src.sha.slice(0, 7) + ')' : '') + '.');
    LS.set('last', JSON.stringify({ key: src.key, repo: src.repo, branch: src.branch }));
    offerDraft();
    updateGhTargets();
  }

  function loadTemplateKeys() {
    return loadTemplates().then(function (tpl) {
      state.tplKeys = scanTemplates(tpl);
      if (state.doc) { var y = window.scrollY; buildForm(); runValidation(); window.scrollTo(0, y); }
    }).catch(function () { state.tplKeys = null; });
  }
  function showLoadError(msg) {
    var box = $('#dod-ed-loaderr');
    box.textContent = msg;
    box.hidden = false;
  }
  function status(msg, isError) {
    var s = $('#dod-ed-status');
    s.textContent = msg;
    s.classList.toggle('text-danger', !!isError);
    $('#dod-ed-loaderr').hidden = true;
  }
  function showWorkspace() { $('#dod-ed-work').hidden = false; $('#dod-ed-empty').hidden = true; }

  /* ================= Drafts ================= */
  function draftKey() { return 'draft.' + state.key; }
  var saveDraft = debounce(function () {
    if (!state.key || !state.text) { return; }
    if (state.text === state.loadedText) { LS.del(draftKey()); return; }
    LS.set(draftKey(), JSON.stringify({ text: state.text, saved: new Date().toISOString(), loaded: state.loadedText }));
  }, 800);
  function offerDraft() {
    var box = $('#dod-ed-draft');
    box.hidden = true;
    var raw = LS.get(draftKey(), null);
    if (!raw) { return; }
    var d;
    try { d = JSON.parse(raw); } catch (e) { return; }
    if (!d || !d.text || d.text === state.loadedText) { return; }
    box.innerHTML = '';
    var when = new Date(d.saved);
    box.appendChild(el('span', { text: 'You have unsaved changes to this event from ' + when.toLocaleString() + '. ' + (d.loaded !== state.loadedText ? 'The file has changed since then, so check the Review tab after restoring. ' : '') }));
    box.appendChild(el('button', { type: 'button', class: 'btn btn-sm btn-primary', text: 'Restore my changes', onclick: function () {
      try { var parsed = parseYaml(d.text); state.doc = isObj(parsed) ? parsed : {}; buildForm(); refreshText(); box.hidden = true; }
      catch (e) { $('#dod-ed-raw').value = d.text; selectTab('yaml'); showRawError(e); box.hidden = true; }
    } }));
    box.appendChild(document.createTextNode(' '));
    box.appendChild(el('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary', text: 'Discard them', onclick: function () { LS.del(draftKey()); box.hidden = true; } }));
    box.hidden = false;
  }

  /* ================= Form ================= */
  function getVal(k) { return state.doc && Object.prototype.hasOwnProperty.call(state.doc, k) ? state.doc[k] : null; }
  function hadKey(k) { return state.base && Object.prototype.hasOwnProperty.call(state.base.parsed, k); }
  function setVal(k, v) {
    if (blankVal(v)) { v = null; }
    if (v === null && !hadKey(k) && !(state.doc && Object.prototype.hasOwnProperty.call(state.doc, k) && state.doc[k] !== null)) { delete state.doc[k]; }
    else { state.doc[k] = v; }
    onDocChange();
  }
  var onDocChange = debounce(function () { refreshText(); }, 150);

  function fieldId(k) { return 'dod-ed-f-' + k.replace(/[^\w-]/g, '_'); }

  function normalizeHtmlValue(s) {
    s = s.replace(/\r\n?/g, '\n');
    if (s.trim() === '') { return null; }
    if (s.indexOf('\n') >= 0 && !/\n$/.test(s)) { s += '\n'; }
    return s;
  }
  function readInput(f, input) {
    var v = input.value;
    switch (f.type) {
      case 'number': { v = v.trim(); if (v === '') { return null; } var n = Number(v); return isFinite(n) && /^-?\d+(\.\d+)?$/.test(v) ? n : v; }
      case 'bool': return v === '' ? null : v === 'true';
      case 'select': {
        if (v === '') { return null; }
        var opt = (f.options || []).filter(function (o) { return String(o[0]) === v; })[0];
        return opt ? opt[0] : v;
      }
      case 'html': case 'textarea': return normalizeHtmlValue(v);
      default: return v.trim() === '' ? null : v.trim();
    }
  }
  function writeInput(f, input, val) {
    if (f.type === 'bool') { input.value = val === true ? 'true' : (val === false ? 'false' : ''); return; }
    if (f.type === 'select') {
      var s = val === null || val === undefined ? '' : String(val);
      if (s !== '' && !$all('option', input).some(function (o) { return o.value === s; })) { input.appendChild(el('option', { value: s, text: s + ' (not a known value)' })); }
      input.value = s;
      return;
    }
    if (f.type === 'html' || f.type === 'textarea') { input.value = val === null || val === undefined ? '' : String(val).replace(/\n$/, ''); return; }
    input.value = val === null || val === undefined ? '' : String(val);
  }

  function inputFor(f, val, onchange, idBase) {
    var id = idBase;
    var input;
    switch (f.type) {
      case 'bool':
        input = el('select', { class: 'custom-select custom-select-sm', id: id }, [el('option', { value: '', text: 'Not set' }), el('option', { value: 'true', text: 'Yes (true)' }), el('option', { value: 'false', text: 'No (false)' })]);
        break;
      case 'select':
        input = el('select', { class: 'custom-select custom-select-sm', id: id });
        (f.options || []).forEach(function (o) { input.appendChild(el('option', { value: String(o[0]), text: o[1] })); });
        break;
      case 'html': case 'textarea':
        input = el('textarea', { class: 'form-control form-control-sm' + (f.type === 'html' ? ' dod-ed-mono' : ''), id: id, rows: f.rows || 3, spellcheck: f.type === 'html' ? 'false' : 'true' });
        break;
      default:
        input = el('input', { class: 'form-control form-control-sm', id: id, type: f.type === 'number' ? 'text' : (f.type === 'email' ? 'email' : 'text'), inputmode: f.type === 'number' ? 'numeric' : null, placeholder: f.placeholder || null, spellcheck: 'false', autocomplete: 'off' });
        if (f.list) {
          var dl = el('datalist', { id: id + '-list' });
          f.list.forEach(function (x) { dl.appendChild(el('option', { value: x })); });
          input.setAttribute('list', id + '-list');
          input._extra = dl;
        }
    }
    writeInput(f, input, val);
    input.addEventListener(f.type === 'bool' || f.type === 'select' ? 'change' : 'input', function () { onchange(readInput(f, input)); });
    var wrap = el('div', { class: 'dod-ed-input' }, [input, input._extra || null]);

    if (f.type === 'html' && !f.code) {
      wrap = htmlEditor(f, input, onchange, wrap);
    }
    if (f.type === 'color') {
      var picker = el('input', { type: 'color', class: 'dod-ed-swatch', title: 'Pick a color', 'aria-label': 'Pick a color' });
      var sync = function () { var v = input.value.trim(); if (/^#[0-9a-f]{6}$/i.test(v)) { picker.value = v; } else if (/^#[0-9a-f]{3}$/i.test(v)) { picker.value = '#' + v.slice(1).split('').map(function (c) { return c + c; }).join(''); } };
      sync();
      picker.addEventListener('input', function () { input.value = picker.value.toUpperCase(); onchange(readInput(f, input)); });
      input.addEventListener('input', sync);
      wrap.classList.add('dod-ed-input--color');
      wrap.insertBefore(picker, input);
    }
    if (f.type === 'datetime') {
      var dp = el('input', { type: 'date', class: 'form-control form-control-sm', 'aria-label': 'Pick the date' });
      var tp = el('input', { type: 'time', class: 'form-control form-control-sm', step: 1, 'aria-label': 'Pick the start time' });
      var fromText = function () {
        var m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(input.value.trim());
        if (m) { dp.value = m[1]; tp.value = m[2] ? String(m[2]).padStart(2, '0') + ':' + m[3] + ':' + (m[4] || '00') : ''; }
      };
      var toText = function () {
        if (!dp.value) { return; }
        var offm = /\s([-+]\d{4}|[-+]\d{2}:\d{2}|Z)\s*$/.exec(input.value);
        var t = tp.value || '08:00:00';
        if (t.length === 5) { t += ':00'; }
        input.value = dp.value + ' ' + t + ' ' + (offm ? offm[1] : '-0000');
        onchange(readInput(f, input));
      };
      fromText();
      dp.addEventListener('change', toText);
      tp.addEventListener('change', toText);
      input.addEventListener('input', fromText);
      input.placeholder = '2027-05-15 08:00:00 -0000';
      wrap.classList.add('dod-ed-input--date');
      wrap.appendChild(dp);
      wrap.appendChild(tp);
    }
    if (f.type === 'cfsdate') {
      var cp = el('input', { type: 'date', class: 'form-control form-control-sm', 'aria-label': 'Pick the end date' });
      var fromCfs = function () {
        var v = input.value.trim(), m;
        if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(v))) { cp.value = m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0'); }
        else if ((m = /^(\d{4}-\d{2}-\d{2})/.exec(v))) { cp.value = m[1]; }
      };
      fromCfs();
      cp.addEventListener('change', function () {
        if (!cp.value) { return; }
        var p = cp.value.split('-');
        input.value = p[1] + '/' + p[2] + '/' + p[0] + ' 11:59:59 PM';
        onchange(readInput(f, input));
      });
      input.addEventListener('input', fromCfs);
      input.placeholder = '03/31/2027 11:59:59 PM';
      wrap.classList.add('dod-ed-input--date');
      wrap.appendChild(cp);
    }
    if (f.type === 'image') {
      var thumb = el('img', { class: 'dod-ed-thumb', alt: '' });
      var showThumb = function () {
        var v = input.value.trim();
        if (!v) { thumb.hidden = true; return; }
        thumb.hidden = false;
        thumb.classList.remove('is-broken');
        thumb.src = assetUrl(v);
      };
      thumb.addEventListener('error', function () { thumb.classList.add('is-broken'); thumb.title = 'This image did not load'; });
      thumb.addEventListener('load', function () { thumb.title = thumb.naturalWidth + ' x ' + thumb.naturalHeight; });
      input.addEventListener('input', debounce(showThumb, 400));
      showThumb();
      wrap.classList.add('dod-ed-input--image');
      wrap.appendChild(thumb);
    }
    if (f.type === 'url') {
      var open = el('a', { class: 'dod-ed-open', target: '_blank', rel: 'noopener noreferrer', title: 'Open this address in a new tab', text: 'Open' });
      var syncOpen = function () { var v = input.value.trim(); open.hidden = !/^https?:\/\//i.test(v); open.href = v; };
      syncOpen();
      input.addEventListener('input', syncOpen);
      wrap.appendChild(open);
    }
    return wrap;
  }


  /* ---------- Visual HTML editor for html fields ---------- */
  var VISUAL_UNSAFE = /<\s*(script|iframe|style|object|embed|form|input|button|select|textarea|svg|math|link|meta)\b|\son[a-z]+\s*=|javascript:/i;
  var BLOCK_END = /(<\/(?:p|h[1-6]|li|ul|ol|table|thead|tbody|tfoot|tr|div|blockquote|pre)>|<br\s*\/?>)(?!\n)/gi;
  var BLOCK_OPEN = /(<(?:ul|ol|table|thead|tbody|tfoot|tr)(?:\s[^>]*)?>)(?!\n)/gi;
  function toDisplayHtml(html) {
    var d = new DOMParser().parseFromString('<body>' + (html || '') + '</body>', 'text/html');
    $all('img[src]', d.body).forEach(function (img) {
      var src = img.getAttribute('src');
      if (!/^[a-z][a-z0-9+.-]*:|^\/\//i.test(src)) { img.setAttribute('data-dod-src', src); img.setAttribute('src', assetUrl(src)); }
    });
    return d.body.innerHTML;
  }
  function fromDisplayHtml(node) {
    var c = node.cloneNode(true);
    $all('img[data-dod-src]', c).forEach(function (img) { img.setAttribute('src', img.getAttribute('data-dod-src')); img.removeAttribute('data-dod-src'); });
    $all('[contenteditable]', c).forEach(function (x) { x.removeAttribute('contenteditable'); });
    /* drop empty spans and the stray <br> browsers leave in empty blocks */
    $all('span:not([class]):not([style]):not([id])', c).forEach(function (sp) { while (sp.firstChild) { sp.parentNode.insertBefore(sp.firstChild, sp); } sp.remove(); });
    var html = c.innerHTML.replace(/<(p|h[1-6]|li)>(?:\s|&nbsp;)*<br>(?:\s)*<\/\1>/gi, '').replace(/<br>(<\/(?:p|h[1-6]|li)>)/gi, '$1');
    html = html.replace(BLOCK_END, '$1\n').replace(BLOCK_OPEN, '$1\n').replace(/\n{3,}/g, '\n\n').trim();
    return html;
  }
  function htmlEditor(f, textarea, onchange, codeWrap) {
    var box = el('div', { class: 'dod-ed-html' });
    var visual = el('div', { class: 'dod-ed-visual', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': (f.label || f.k) + ' (visual editor)', spellcheck: 'true' });
    visual.style.minHeight = Math.max(4, (f.rows || 4)) * 1.6 + 'em';
    var note = el('div', { class: 'dod-ed-htmlnote', hidden: true });
    var modeBtns = {};
    var mode = 'html';
    function emit() { textarea.value = fromDisplayHtml(visual); onchange(normalizeHtmlValue(textarea.value)); }
    function cmd(name, val) { visual.focus(); try { document.execCommand('styleWithCSS', false, false); } catch (e) { /* older browsers */ } document.execCommand(name, false, val === undefined ? null : val); emit(); }
    function tb(label, title, fn) { return el('button', { type: 'button', class: 'dod-ed-tb', title: title, 'aria-label': title, text: label, onmousedown: function (e) { e.preventDefault(); }, onclick: fn }); }
    var toolbar = el('div', { class: 'dod-ed-toolbar', role: 'toolbar', 'aria-label': 'Formatting' }, [
      tb('P', 'Paragraph', function () { cmd('formatBlock', '<p>'); }),
      tb('H2', 'Heading', function () { cmd('formatBlock', '<h2>'); }),
      tb('H3', 'Small heading', function () { cmd('formatBlock', '<h3>'); }),
      el('span', { class: 'dod-ed-tbsep' }),
      tb('B', 'Bold', function () { cmd('bold'); }),
      tb('I', 'Italic', function () { cmd('italic'); }),
      el('span', { class: 'dod-ed-tbsep' }),
      tb('Link', 'Add a link (opens in a new tab)', function () {
        var sel = window.getSelection();
        var url = window.prompt('Link address', 'https://');
        if (!url || url === 'https://') { return; }
        url = url.trim();
        visual.focus();
        if (sel && sel.isCollapsed) { document.execCommand('insertHTML', false, '<a href="' + esc(url) + '">' + esc(url) + '</a>'); }
        else { document.execCommand('createLink', false, url); }
        $all('a[href]', visual).forEach(function (a) { if (a.getAttribute('href') === url && /^https?:/i.test(url)) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); } });
        emit();
      }),
      tb('Unlink', 'Remove the link', function () { cmd('unlink'); }),
      el('span', { class: 'dod-ed-tbsep' }),
      tb('List', 'Bulleted list', function () { cmd('insertUnorderedList'); }),
      tb('1. List', 'Numbered list', function () { cmd('insertOrderedList'); }),
      tb('Image', 'Insert an image', function () {
        var src = window.prompt('Image address (a path such as /assets/img/logos/logo.png, or a full web address)', '');
        if (!src) { return; }
        src = src.trim();
        visual.focus();
        document.execCommand('insertHTML', false, '<img src="' + esc(assetUrl(src)) + '" data-dod-src="' + esc(src) + '" alt="">');
        emit();
      }),
      el('span', { class: 'dod-ed-tbsep' }),
      tb('Clear', 'Clear formatting', function () { cmd('removeFormat'); }),
      tb('Undo', 'Undo', function () { cmd('undo'); }),
      tb('Redo', 'Redo', function () { cmd('redo'); })
    ]);
    var switcher = el('div', { class: 'dod-ed-modes', role: 'group', 'aria-label': 'Editor mode' });
    ['visual', 'html'].forEach(function (m) {
      modeBtns[m] = el('button', { type: 'button', class: 'dod-ed-mode', 'aria-pressed': 'false', text: m === 'visual' ? 'Visual' : 'HTML', onclick: function () { setMode(m, true); } });
      switcher.appendChild(modeBtns[m]);
    });
    function setMode(m, remember) {
      if (m === 'visual' && VISUAL_UNSAFE.test(textarea.value)) {
        note.textContent = 'This text has a script, embed, form or event handler, so it can only be edited as HTML.';
        note.hidden = false;
        m = 'html';
      } else { note.hidden = true; }
      mode = m;
      if (remember) { LS.set('htmlmode', m); }
      if (m === 'visual') { visual.innerHTML = toDisplayHtml(textarea.value); }
      visual.hidden = toolbar.hidden = m !== 'visual';
      codeWrap.hidden = m === 'visual';
      Object.keys(modeBtns).forEach(function (k) { modeBtns[k].classList.toggle('active', k === m); modeBtns[k].setAttribute('aria-pressed', k === m ? 'true' : 'false'); });
    }
    visual.addEventListener('input', emit);
    visual.addEventListener('paste', function (e) {
      var t = (e.clipboardData || window.clipboardData).getData('text/plain');
      if (t === undefined || t === null) { return; }
      e.preventDefault();
      document.execCommand('insertText', false, t);
    });
    visual.addEventListener('click', function (e) { if (e.target.closest('a')) { e.preventDefault(); } });
    box.appendChild(el('div', { class: 'dod-ed-htmlbar' }, [toolbar, switcher]));
    box.appendChild(visual);
    box.appendChild(codeWrap);
    box.appendChild(note);
    setMode(LS.get('htmlmode', 'visual'), false);
    return box;
  }

  /* ---------- Dynamic keys: what the page templates read, and what the data template offers ---------- */
  var LEGACY_KEYS = { SessionizeAppURL: 1, precon1speakerimageurl: 1, precon2speakerimageurl: 1, precon3speakerimageurl: 1, precon: 1 };
  var LEGACY_SUB = { meetupurl: 1, size: 1, first: 1, last: 1 };
  function scanTemplates(tpl) {
    var out = { neu: {}, classic: {}, data: {}, sub: {}, item: { organizers: {}, sponsors: {} }, sample: {} };
    function scan(src, bucket) {
      var re = /pagedata\.([A-Za-z_]\w*)(?:\.([A-Za-z_]\w*))?/g, m;
      while ((m = re.exec(src)) !== null) {
        bucket[m[1]] = true;
        if (m[2] && !LEGACY_SUB[m[2]]) { (out.sub[m[1]] = out.sub[m[1]] || {})[m[2]] = true; }
      }
      var ri = /\b(organizer|sponsor)\.([A-Za-z_]\w*)/g;
      while ((m = ri.exec(src)) !== null) { out.item[m[1] + 's'][m[2]] = true; }
    }
    scan(tpl.eventlayout || '', out.neu);
    scan(tpl.event || '', out.classic);
    out.neu.eventlayout = out.neu.registrationtype = true;
    try {
      var d = tpl.datatpl ? parseYaml(tpl.datatpl) : null;
      if (isObj(d)) {
        Object.keys(d).forEach(function (k) {
          out.data[k] = true; out.sample[k] = d[k];
          if (isObj(d[k])) { Object.keys(d[k]).forEach(function (sk) { (out.sub[k] = out.sub[k] || {})[sk] = true; }); }
          if (Array.isArray(d[k]) && out.item[k]) { d[k].forEach(function (it) { if (isObj(it)) { Object.keys(it).forEach(function (sk) { out.item[k][sk] = true; }); } }); }
        });
      }
    } catch (e) { /* the data template is optional */ }
    return out;
  }
  function guessField(k, v) {
    var f = { k: k, label: k, dynamic: true };
    if (typeof v === 'boolean') { f.type = 'bool'; }
    else if (typeof v === 'number') { f.type = 'number'; }
    else if (Array.isArray(v) || isObj(v)) { f.type = 'yaml'; }
    else if (typeof v === 'string' && /<[a-z!\/]/i.test(v)) { f.type = 'html'; f.rows = 4; f.code = /<\s*(script|iframe)/i.test(v); }
    else if (typeof v === 'string' && v.indexOf('\n') >= 0) { f.type = 'textarea'; f.rows = 4; }
    else if (/(url|website|link)$/i.test(k)) { f.type = 'url'; }
    else if (/(html|embed|script)$/i.test(k)) { f.type = 'html'; f.code = true; f.rows = 3; }
    else if (/(desc|description|detail|text|plan)$/i.test(k)) { f.type = 'html'; f.rows = 3; }
    else if (/^color/i.test(k)) { f.type = 'color'; }
    else { f.type = 'text'; }
    return f;
  }
  function currentLayout() { var l = String((state.doc && state.doc.eventlayout) || '').toLowerCase(); return l === 'poster' || l === 'rail' || l === 'tabs' ? l : ''; }
  var LAYOUT_NAMES = { '': 'Default (classic)', poster: 'Poster', rail: 'Side rail', tabs: 'Tabs' };
  /* A key the other kind of page reads but the selected template does not. */
  function unusedByLayout(k) {
    var t = state.tplKeys;
    if (!t || k === 'name' || k === 'date' || k === 'primarytag' || k === 'eventlayout') { return false; }
    var used = currentLayout() ? t.neu : t.classic, other = currentLayout() ? t.classic : t.neu;
    return !used[k] && !!other[k];
  }
  function markUnused() {
    $all('[data-topkey]', $('#dod-ed-form')).forEach(function (row) {
      var un = unusedByLayout(row.getAttribute('data-topkey'));
      row.classList.toggle('is-unused', un);
      var chip = row.querySelector(':scope > .dod-ed-label > .dod-ed-chip--unused, :scope > legend > .dod-ed-chip--unused');
      if (un && !chip) { var host = row.querySelector(':scope > .dod-ed-label, :scope > legend'); if (host) { host.appendChild(el('span', { class: 'dod-ed-chip dod-ed-chip--unused' })); chip = host.lastChild; } }
      if (chip) { chip.hidden = !un; chip.textContent = 'not used by the ' + LAYOUT_NAMES[currentLayout()] + ' template'; }
    });
    var sel = $('#dod-ed-layoutsel');
    if (sel && state.doc) {
      var v = state.doc.eventlayout === null || state.doc.eventlayout === undefined ? '' : String(state.doc.eventlayout);
      if (!$all('option', sel).some(function (o) { return o.value === v; })) { sel.appendChild(el('option', { value: v, text: v + ' (not a known template)' })); }
      sel.value = v;
    }
    updateEmptyCounts();
  }
  var updateEmptyCounts = debounce(function () {
    var total = 0;
    $all('.dod-ed-sec', $('#dod-ed-form')).forEach(function (sec) {
      var n = $all('.dod-ed-field.is-empty', sec).filter(function (r) { return !r.classList.contains('is-offered') && !r.closest('.is-unused'); }).length;
      total += n;
      var link = $('#dod-ed-formnav [data-sec="' + sec.id + '"]');
      if (link) { link.textContent = link.getAttribute('data-title') + (n ? ' (' + n + ')' : ''); link.classList.toggle('has-empty', n > 0); }
    });
    var sum = $('#dod-ed-emptysum');
    if (sum) { sum.textContent = total ? total + (total === 1 ? ' field is empty' : ' fields are empty') : 'No empty fields'; }
  }, 120);

  function fieldRow(f, val, onchange0, idBase, extraClass) {
    var onchange = function (v) { row.classList.toggle('is-empty', blankVal(v) && f.type !== 'select'); onchange0(v); updateEmptyCounts(); };
    var row = el('div', { class: 'form-group dod-ed-field' + (extraClass ? ' ' + extraClass : '') + (f.type === 'html' || f.type === 'textarea' || f.type === 'yaml' ? ' dod-ed-field--wide' : ''), 'data-key': idBase });
    row.appendChild(el('label', { for: idBase, class: 'dod-ed-label' }, [f.label || f.k, f.required ? el('span', { class: 'dod-ed-req', text: ' required', 'aria-hidden': 'true' }) : null, f.dynamic ? null : el('code', { class: 'dod-ed-key', text: f.k })]));
    row.appendChild(inputFor(f, val, onchange, idBase));
    if (f.help) { row.appendChild(el('small', { class: 'form-text text-muted', text: f.help })); }
    row.appendChild(el('div', { class: 'dod-ed-msg', 'data-msg-for': idBase }));
    row.classList.toggle('is-empty', blankVal(val) && f.type !== 'select');
    return row;
  }

  function yamlField(f) {
    var id = fieldId(f.k);
    var row = el('div', { class: 'form-group dod-ed-field dod-ed-field--wide', 'data-key': id });
    row.appendChild(el('label', { for: id, class: 'dod-ed-label' }, [f.label, el('code', { class: 'dod-ed-key', text: f.k })]));
    var v = getVal(f.k);
    var ta = el('textarea', { class: 'form-control form-control-sm dod-ed-mono', id: id, rows: 4, spellcheck: 'false' });
    ta.value = v === null || v === undefined ? '' : YAML.dump(v, { schema: YAML.CORE_SCHEMA, lineWidth: -1 }).replace(/\n$/, '');
    var msg = el('div', { class: 'dod-ed-msg', 'data-msg-for': id });
    ta.addEventListener('input', debounce(function () {
      if (ta.value.trim() === '') { msg.textContent = ''; setVal(f.k, null); return; }
      try { var parsed = parseYaml(ta.value); msg.textContent = ''; setVal(f.k, parsed); }
      catch (e) { msg.textContent = 'YAML error: ' + e.message.split('\n')[0]; msg.className = 'dod-ed-msg is-error'; }
    }, 400));
    row.appendChild(ta);
    if (f.help) { row.appendChild(el('small', { class: 'form-text text-muted', text: f.help })); }
    row.appendChild(msg);
    return row;
  }

  function mapField(f) {
    var box = el('fieldset', { class: 'dod-ed-map', 'data-key': fieldId(f.k) });
    box.appendChild(el('legend', {}, [f.label, el('code', { class: 'dod-ed-key', text: f.k })]));
    var cur = getVal(f.k);
    var known = f.fields.map(function (x) { return x.k; });
    var extras = isObj(cur) ? Object.keys(cur).filter(function (k) { return known.indexOf(k) < 0; }) : [];
    var tsub = Object.keys((state.tplKeys && state.tplKeys.sub[f.k]) || {}).filter(function (k) { return known.indexOf(k) < 0 && extras.indexOf(k) < 0 && !LEGACY_SUB[k]; });
    var all = f.fields.concat(extras.concat(tsub).map(function (k) { return guessField(k, isObj(cur) ? cur[k] : null); }).filter(function (x) { return x.type !== 'yaml'; }));
    var grid = el('div', { class: 'dod-ed-grid' });
    all.forEach(function (sf) {
      var id = fieldId(f.k + '.' + sf.k);
      grid.appendChild(fieldRow(sf, isObj(cur) ? cur[sf.k] : null, function (v) {
        var m = isObj(state.doc[f.k]) ? state.doc[f.k] : {};
        var orig = state.base && isObj(state.base.parsed[f.k]) ? state.base.parsed[f.k] : {};
        if (blankVal(v)) { v = null; }
        if (v === null && !Object.prototype.hasOwnProperty.call(orig, sf.k) && !(Object.prototype.hasOwnProperty.call(m, sf.k) && m[sf.k] !== null)) { delete m[sf.k]; }
        else { m[sf.k] = v; }
        setVal(f.k, Object.keys(m).length ? m : null);
      }, id));
    });
    box.appendChild(grid);
    return box;
  }

  function listField(f) {
    var box = el('fieldset', { class: 'dod-ed-list', 'data-key': fieldId(f.k) });
    box.appendChild(el('legend', {}, [f.label, el('code', { class: 'dod-ed-key', text: f.k })]));
    var holder = el('div', { class: 'dod-ed-items' });
    box.appendChild(holder);
    function items() { return Array.isArray(state.doc[f.k]) ? state.doc[f.k] : []; }
    function commit(arr) { setVal(f.k, arr.length ? arr : (hadKey(f.k) ? null : null)); }
    function draw() {
      holder.innerHTML = '';
      var arr = items();
      if (!arr.length) { holder.appendChild(el('p', { class: 'text-muted small', text: 'None yet.' })); }
      arr.forEach(function (item, idx) {
        var it = isObj(item) ? item : {};
        var card = el('div', { class: 'dod-ed-item', 'data-key': fieldId(f.k + '.' + idx) });
        var title = el('div', { class: 'dod-ed-item__head' }, [
          el('strong', { text: (f.item === 'sponsor' ? (it.type || 'Sponsor') + ': ' + ((it.link || '').replace(/^https?:\/\/(www\.)?/, '') || 'new') : (it.name || 'New ' + f.item)) }),
          el('span', { class: 'dod-ed-item__tools' }, [
            el('button', { type: 'button', class: 'btn btn-sm btn-link', title: 'Move up', 'aria-label': 'Move up', text: 'Up', disabled: idx === 0 ? true : null, onclick: function () { var a = items().slice(); a.splice(idx - 1, 0, a.splice(idx, 1)[0]); commit(a); draw(); } }),
            el('button', { type: 'button', class: 'btn btn-sm btn-link', title: 'Move down', 'aria-label': 'Move down', text: 'Down', disabled: idx === arr.length - 1 ? true : null, onclick: function () { var a = items().slice(); a.splice(idx + 1, 0, a.splice(idx, 1)[0]); commit(a); draw(); } }),
            el('button', { type: 'button', class: 'btn btn-sm btn-link text-danger', text: 'Remove', onclick: function () { var a = items().slice(); a.splice(idx, 1); commit(a); draw(); } })
          ])
        ]);
        card.appendChild(title);
        var grid = el('div', { class: 'dod-ed-grid' });
        var known = f.fields.map(function (x) { return x.k; });
        var allExtra = Object.keys(it).filter(function (k) { return known.indexOf(k) < 0; });
        Object.keys((state.tplKeys && state.tplKeys.item[f.k]) || {}).forEach(function (k) { if (known.indexOf(k) < 0 && allExtra.indexOf(k) < 0) { allExtra.push(k); } });
        var extras = allExtra.filter(function (k) { return isObj(it[k]) || Array.isArray(it[k]); });
        f.fields.concat(allExtra.filter(function (k) { return extras.indexOf(k) < 0; }).map(function (k) { return guessField(k, it[k]); })).forEach(function (sf) {
          var id = fieldId(f.k + '.' + idx + '.' + sf.k);
          grid.appendChild(fieldRow(sf, it[sf.k], function (v) {
            var a = items().slice();
            var cur = isObj(a[idx]) ? Object.assign({}, a[idx]) : {};
            if (blankVal(v)) { if (Object.prototype.hasOwnProperty.call(cur, sf.k)) { cur[sf.k] = null; } }
            else { cur[sf.k] = v; }
            a[idx] = cur;
            commit(a);
          }, id));
        });
        card.appendChild(grid);
        if (extras.length) { card.appendChild(el('p', { class: 'small text-muted mb-0', text: 'Also kept as is: ' + extras.join(', ') + '. Edit these on the YAML tab.' })); }
        holder.appendChild(card);
      });
    }
    draw();
    box.appendChild(el('button', { type: 'button', class: 'btn btn-sm btn-outline-primary', text: 'Add ' + (f.item === 'sponsor' ? 'a sponsor' : 'an organizer'), onclick: function () {
      var a = items().slice();
      var blank = {};
      f.fields.forEach(function (sf) { if (f.item === 'organizer' || sf.k === 'type' || sf.k === 'link' || sf.k === 'image') { blank[sf.k] = null; } });
      if (f.item === 'sponsor') { blank = { link: null, type: a.length ? a[a.length - 1].type || null : null, image: null, width: 800 }; }
      a.push(blank);
      commit(a);
      draw();
    } }));
    return box;
  }

  function preconGroup(n) {
    var box = el('fieldset', { class: 'dod-ed-map', 'data-key': 'precon' + n });
    box.appendChild(el('legend', { text: 'Pre-con ' + n }));
    var grid = el('div', { class: 'dod-ed-grid' });
    PRECON_FIELDS.forEach(function (pf) {
      var k = pf.s + n;
      var f = FIELD_BY_KEY[k];
      var r = fieldRow(f, getVal(k), function (v) { setVal(k, v); }, fieldId(k));
      r.setAttribute('data-topkey', k);
      grid.appendChild(r);
    });
    box.appendChild(grid);
    return box;
  }

  function buildForm() {
    var form = $('#dod-ed-form');
    form.innerHTML = '';
    var nav = $('#dod-ed-formnav');
    nav.innerHTML = '';
    var showAdvanced = $('#dod-ed-advanced').checked;
    SECTIONS.forEach(function (sec) {
      var s = el('section', { class: 'dod-ed-sec', id: 'dod-ed-sec-' + sec.id });
      s.appendChild(el('h3', { text: sec.title }));
      var grid = el('div', { class: 'dod-ed-grid' });
      sec.fields.forEach(function (f) {
        if (f.group === 'precon') { grid.appendChild(preconGroup(f.n)); return; }
        if (f.advanced && !showAdvanced && blankVal(getVal(f.k))) { return; }
        var node;
        if (f.type === 'list') { node = listField(f); }
        else if (f.type === 'map') { node = mapField(f); }
        else if (f.type === 'yaml') { if (!(showAdvanced || getVal(f.k) !== null)) { return; } node = yamlField(f); }
        else { node = fieldRow(f, getVal(f.k), function (v) { setVal(f.k, v); if (f.k === 'eventlayout') { markUnused(); } }, fieldId(f.k)); }
        node.setAttribute('data-topkey', f.k);
        grid.appendChild(node);
      });
      s.appendChild(grid);
      form.appendChild(s);
      nav.appendChild(el('a', { href: '#dod-ed-sec-' + sec.id, 'data-sec': 'dod-ed-sec-' + sec.id, 'data-title': sec.title, text: sec.title, onclick: function (e) { e.preventDefault(); s.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }));
    });
    /* Keys the form has no fixed field for: built from the data file and from the templates. */
    var t = state.tplKeys;
    var inFile = Object.keys(state.doc).filter(function (k) { return !FIELD_BY_KEY[k]; });
    (state.extraKeys || []).forEach(function (k) { if (!FIELD_BY_KEY[k] && inFile.indexOf(k) < 0) { inFile.push(k); } });
    var offered = [];
    if (t) {
      [t.data, t.neu, t.classic].forEach(function (set) { Object.keys(set).forEach(function (k) { if (!FIELD_BY_KEY[k] && !LEGACY_KEYS[k] && inFile.indexOf(k) < 0 && offered.indexOf(k) < 0) { offered.push(k); } }); });
    }
    var os = el('section', { class: 'dod-ed-sec', id: 'dod-ed-sec-other' });
    os.appendChild(el('h3', { text: 'Other settings' }));
    function dynRow(k, isOffered) {
      var f = guessField(k, Object.prototype.hasOwnProperty.call(state.doc, k) && state.doc[k] !== null ? state.doc[k] : (t ? t.sample[k] : null));
      var node = f.type === 'yaml' ? yamlField(f) : fieldRow(f, getVal(k), function (v) { setVal(k, v); }, fieldId(k));
      node.setAttribute('data-topkey', k);
      if (isOffered) { node.classList.add('is-offered'); var lab = node.querySelector('.dod-ed-label'); if (lab) { lab.appendChild(el('span', { class: 'dod-ed-chip dod-ed-chip--offered', text: 'available' })); } }
      return node;
    }
    if (inFile.length) {
      os.appendChild(el('p', { class: 'small text-muted', text: 'In this file, but not one of the standard fields. They were picked up from the file and are saved with it.' }));
      var g1 = el('div', { class: 'dod-ed-grid' });
      inFile.forEach(function (k) { g1.appendChild(dynRow(k, false)); });
      os.appendChild(g1);
    }
    if (offered.length) {
      os.appendChild(el('p', { class: 'small text-muted', text: 'The page templates or the data template have these, and this file does not set them yet. Fill one in to add it.' }));
      var g2 = el('div', { class: 'dod-ed-grid' });
      offered.forEach(function (k) { g2.appendChild(dynRow(k, true)); });
      os.appendChild(g2);
    }
    if (!inFile.length && !offered.length) { os.appendChild(el('p', { class: 'small text-muted', text: t ? 'Every setting in this file and in the templates is on the form above.' : 'Looking at the page templates for more settings...' })); }
    var addIn = el('input', { type: 'text', class: 'form-control form-control-sm', id: 'dod-ed-addkey', placeholder: 'newsettingname', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'New setting name' });
    var addMsg = el('div', { class: 'dod-ed-msg', 'data-msg-for': 'dod-ed-other' });
    function addKey() {
      var k = addIn.value.trim();
      if (!/^[A-Za-z_][\w-]*$/.test(k)) { addMsg.textContent = 'Use letters, numbers, dashes and underscores, starting with a letter.'; addMsg.className = 'dod-ed-msg is-error'; return; }
      if (FIELD_BY_KEY[k] || Object.prototype.hasOwnProperty.call(state.doc, k)) { addMsg.textContent = k + ' is already on the form.'; addMsg.className = 'dod-ed-msg is-error'; focusKey(k); return; }
      state.extraKeys = (state.extraKeys || []).concat([k]);
      buildForm(); runValidation(); focusKey(k);
    }
    addIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addKey(); } });
    os.appendChild(el('div', { class: 'dod-ed-addkey' }, [el('label', { for: 'dod-ed-addkey', class: 'dod-ed-label', text: 'Add a setting' }), el('div', { class: 'dod-ed-inline' }, [addIn, el('button', { type: 'button', class: 'btn btn-sm btn-outline-primary', text: 'Add', onclick: addKey })]), addMsg]));
    form.appendChild(os);
    nav.appendChild(el('a', { href: '#dod-ed-sec-other', 'data-sec': 'dod-ed-sec-other', 'data-title': 'Other settings', text: 'Other settings', onclick: function (e) { e.preventDefault(); os.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }));
    form.classList.toggle('hl-empty', $('#dod-ed-hlempty').checked);
    form.classList.toggle('only-empty', $('#dod-ed-onlyempty').checked);
    markUnused();
  }

  /* ================= Text, raw YAML tab ================= */
  function refreshText() {
    if (!state.doc) { return; }
    var r = safeSerialize(state.base, state.doc);
    state.text = r.text;
    state.writeMode = r.mode;
    if (!state.rawDirty || document.activeElement !== $('#dod-ed-raw')) { $('#dod-ed-raw').value = state.text; state.rawDirty = false; }
    $('#dod-ed-rawerr').hidden = true;
    runValidation();
    updateReview();
    saveDraft();
    if (currentTab === 'preview') { schedulePreview(); }
    var changed = state.text !== state.loadedText;
    $('#dod-ed-changed').textContent = changed ? 'Unsaved changes' : 'No changes';
    $('#dod-ed-changed').className = 'badge ' + (changed ? 'badge-warning' : 'badge-light');
  }
  function showRawError(e) {
    var box = $('#dod-ed-rawerr');
    var msg = e && e.message ? e.message : String(e);
    var line = e && e.mark ? ' (line ' + (e.mark.line + 1) + ', column ' + (e.mark.column + 1) + ')' : '';
    box.textContent = 'YAML error' + line + ': ' + msg.split('\n')[0];
    box.hidden = false;
    if (e && e.mark) {
      var ta = $('#dod-ed-raw');
      var lines = ta.value.split('\n'), pos = 0;
      for (var i = 0; i < e.mark.line && i < lines.length; i++) { pos += lines[i].length + 1; }
      try { ta.setSelectionRange(pos, pos + (lines[e.mark.line] || '').length); } catch (x) { /* ignore */ }
    }
  }
  function applyRaw() {
    var text = $('#dod-ed-raw').value;
    try {
      setBase(text);
    } catch (e) { showRawError(e); return false; }
    $('#dod-ed-rawerr').hidden = true;
    state.rawDirty = false;
    if (!state.key) { state.key = 'NewEvent'; state.file = 'NewEvent.yml'; }
    showWorkspace();
    buildForm();
    refreshText();
    return true;
  }

  /* ================= Validation ================= */
  function tagProblems(html) {
    if (typeof html !== 'string' || html.indexOf('<') < 0) { return []; }
    var VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i;
    var OPTIONAL = /^(p|li|dt|dd|tr|td|th|thead|tbody|tfoot|option|optgroup|colgroup|rt|rp)$/i;
    var src = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '');
    var re = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g, m;
    var stack = [], probs = [];
    var stray = src.replace(re, '').match(/<[a-zA-Z\/][^>]*$/m);
    if (stray) { probs.push('A tag is not finished: "' + stray[0].slice(0, 40) + '"'); }
    while ((m = re.exec(src)) !== null) {
      var name = m[2].toLowerCase();
      if (m[1]) {
        if (VOID.test(name)) { continue; }
        var at = stack.lastIndexOf(name);
        if (at < 0) { probs.push('</' + name + '> has no opening <' + name + '>.'); continue; }
        stack.slice(at + 1).forEach(function (n) { if (!OPTIONAL.test(n)) { probs.push('<' + n + '> is not closed before </' + name + '>.'); } });
        stack.length = at;
      } else if (!m[4] && !VOID.test(name)) {
        stack.push(name);
      }
    }
    stack.forEach(function (n) { if (!OPTIONAL.test(n)) { probs.push('<' + n + '> is never closed.'); } });
    return probs.slice(0, 4);
  }
  function relLuminance(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) { h = h.split('').map(function (c) { return c + c; }).join(''); }
    var rgb = [0, 2, 4].map(function (i) { var c = parseInt(h.substr(i, 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  }
  function contrastOnWhite(hex) { return 1.05 / (relLuminance(hex) + 0.05); }
  function isAbsUrl(s) { return /^https?:\/\/[^\s/$.?#][^\s]*$/i.test(s); }
  function looksTimestamp(s) { return /^\d{4}-\d{1,2}-\d{1,2}(?:[Tt]|[ \t]+)\d{1,2}:\d{2}:\d{2}(\.\d*)?(?:[ \t]*(Z|[-+]\d{1,2}(:?\d{2})?))?$/.test(s) || /^\d{4}-\d{1,2}-\d{1,2}$/.test(s); }

  function validate(doc) {
    var out = [];
    function add(level, key, msg) { out.push({ level: level, key: key, msg: msg }); }
    function str(k) { var v = doc[k]; return v === null || v === undefined ? '' : String(v); }
    var lay = str('eventlayout').toLowerCase();
    var newLayout = lay === 'poster' || lay === 'rail' || lay === 'tabs';

    if (blankVal(doc.name)) { add('error', 'name', 'The event needs a name.'); }
    if (blankVal(doc.date)) { add('error', 'date', 'The event needs a date.'); }
    else if (typeof doc.date !== 'string' || !looksTimestamp(doc.date)) { add('error', 'date', 'Use the form 2027-05-15 08:00:00 -0000 so the site reads it as a date.'); }
    else if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [-+]\d{4}$/.test(doc.date)) { add('warn', 'date', 'The site style is 2027-05-15 08:00:00 -0000 (with a + or - before the time zone).'); }
    if (blankVal(doc.logo)) { add('warn', 'logo', 'No logo. The page shows an empty frame.'); }
    else if (!/^(\/|https?:\/\/)/.test(str('logo'))) { add('error', 'logo', 'Start the logo with / (a path on this site) or https://.'); }

    ['virtual', 'physical', 'hybrid', 'callforspeakers', 'eventcountdown', 'precons'].forEach(function (k) {
      if (doc[k] !== undefined && doc[k] !== null && typeof doc[k] !== 'boolean') { add('error', k, 'Set this to true or false without quotes. "' + doc[k] + '" is read as text.'); }
    });
    if (doc.virtual !== true && doc.physical !== true && doc.hybrid !== true) { add('warn', 'physical', 'None of in person, virtual or hybrid is set to true.'); }
    if (lay && !newLayout) { add('error', 'eventlayout', '"' + doc.eventlayout + '" is not a layout. Use poster, rail, tabs, or leave it blank.'); }
    ['colorprimary', 'colorsecondary', 'colorbutton', 'colorlink'].forEach(function (k) {
      if (blankVal(doc[k])) { return; }
      if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(str(k))) { add('error', k, 'Use a hex color such as #133F4C.'); return; }
      if (!newLayout) { add('info', k, 'Colors only apply to the poster, side rail and tabs layouts.'); }
      var c = contrastOnWhite(str(k));
      if ((k === 'colorlink' || k === 'colorprimary') && c < 3) { add('warn', k, 'This color is hard to read on white (contrast ' + c.toFixed(1) + ':1). Pick a darker one.'); }
    });
    if (newLayout && blankVal(doc.colorprimary)) { add('info', 'colorprimary', 'No colors set. The Day of Data colors are used.'); }

    function payment(typeKey, urlKey, what) {
      var t = str(typeKey).toLowerCase(), u = str(urlKey);
      if (t && t !== 'url' && t !== 'zeffy') { add('error', typeKey, 'Use zeffy, url, or leave it blank.'); }
      if (t === 'zeffy') {
        if (!u) { add('error', urlKey, 'Zeffy is selected, so add the Zeffy form address.'); }
        else if (u.indexOf('zeffy.com') < 0) { add('error', urlKey, 'This is not a Zeffy address.'); }
        else if (u.indexOf('/embed/') < 0) { add('warn', urlKey, 'Use the embed address for ' + what + ': https://www.zeffy.com/embed/ticketing/your-form'); }
      } else if (u.indexOf('zeffy.com/embed/') >= 0) {
        add('warn', typeKey, 'The ' + what + ' address is a Zeffy embed address. Set the type to Zeffy to embed the form.');
      }
    }
    payment('registrationtype', 'registrationurl', 'registration');
    payment('sponsorpaymenttype', 'sponsorpaymenturl', 'sponsorships');
    payment('preconregistrationtype', 'preconregistrationurl', 'pre-cons');

    URL_KEYS.forEach(function (k) {
      var v = doc[k];
      if (blankVal(v)) { return; }
      v = String(v);
      if (k === 'preconspeakerimageurl1' || k === 'preconspeakerimageurl2' || k === 'preconspeakerimageurl3') {
        v.split(',').forEach(function (p) { p = p.trim(); if (p && !/^(\/|https?:\/\/)/.test(p)) { add('error', k, 'Each photo needs a full address or a path starting with /.'); } });
        return;
      }
      if (/\s/.test(v.trim())) { add('error', k, 'Addresses cannot contain spaces.'); return; }
      if (!isAbsUrl(v)) { add('error', k, 'Use a full address that starts with https://.'); return; }
      if (/^http:\/\//i.test(v)) { add('info', k, 'This address uses http. Use https if the site supports it.'); }
    });

    /* Sessionize */
    var st = str('sessionizetype').toLowerCase();
    if (st && st !== 'json' && st !== 'embed') { add('error', 'sessionizetype', 'Use json or leave it blank.'); }
    ['speakerlisturl', 'submittedsessionurl', 'scheduleurl'].forEach(function (k) {
      var v = str(k);
      if (!v) { return; }
      var isJson = /sessionize\.com\/api\/v2\/[^/]+\/view\//i.test(v);
      if (st === 'json' && !isJson) { add('warn', k, 'Sessionize JSON is selected, but this is not a JSON endpoint (https://sessionize.com/api/v2/YOUR-ID/view/...).'); }
      if (st !== 'json' && isJson) { add('warn', k, 'This is a Sessionize JSON endpoint. Set Sessionize data to JSON, or use the embed address.'); }
      if (st === 'json' && isJson) {
        var want = { speakerlisturl: /\/view\/Speakers/i, submittedsessionurl: /\/view\/(Sessions|All)/i, scheduleurl: /\/view\/(GridSmart|Sessions|All)/i }[k];
        if (!want.test(v)) { add('info', k, 'Usually this ends in ' + { speakerlisturl: '/view/Speakers', submittedsessionurl: '/view/Sessions', scheduleurl: '/view/GridSmart' }[k] + '.'); }
      }
    });
    if (st === 'json' && !newLayout) { add('info', 'sessionizetype', 'JSON endpoints are drawn only by the poster, side rail and tabs layouts.'); }
    if (doc.callforspeakers === true && blankVal(doc.callforspeakersurl)) { add('warn', 'callforspeakersurl', 'The call for speakers is on, but there is no address to submit sessions.'); }
    var cfs = str('callforspeakersenddate').trim();
    if (cfs) {
      var okNew = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(\s|$)/.test(cfs) || /^\d{4}-\d{2}-\d{2}/.test(cfs);
      if (newLayout && !okNew) { add('warn', 'callforspeakersenddate', 'The newer layouts read 03/31/2027 or 2027-03-31. Other forms may not close the call for speakers on time.'); }
      if (!newLayout && /^\d{1,2}\/\d{1,2}\/\d{4}/.test(cfs)) { add('warn', 'callforspeakersenddate', 'The classic page reads slashes day first, so 03/05/2027 means 3 May, and 03/31/2027 is not understood. Use 31 Mar 2027 or 2027-03-31.'); }
      var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(cfs);
      if (m && (+m[1] > 12 || +m[2] > 31)) { add('error', 'callforspeakersenddate', 'This date is not valid as month/day/year.'); }
    }
    if (doc.scheduleurl && doc.submittedsessionurl && newLayout) { add('info', 'scheduleurl', 'The schedule is set, so the Sessions section is hidden and View schedule shows.'); }

    /* Pre-cons */
    [1, 2, 3].forEach(function (n) {
      var nm = doc['preconname' + n];
      var any = PRECON_FIELDS.some(function (pf) { return !blankVal(doc[pf.s + n]); });
      if (any && blankVal(nm)) { add('warn', 'preconname' + n, 'Pre-con ' + n + ' has details but no title, so it will not show.'); }
      if (!blankVal(nm) && blankVal(doc['precondescription' + n])) { add('info', 'precondescription' + n, 'Pre-con ' + n + ' has no description.'); }
      if (!blankVal(nm) && str('preconregistrationtype') !== 'zeffy' && blankVal(doc['preconregurl' + n])) { add('info', 'preconregurl' + n, 'Pre-con ' + n + ' has no register address, so it has no Register button.'); }
    });

    /* Sponsors */
    if (doc.sponsors !== null && doc.sponsors !== undefined && !Array.isArray(doc.sponsors)) { add('error', 'sponsors', 'Sponsors must be a list.'); }
    (Array.isArray(doc.sponsors) ? doc.sponsors : []).forEach(function (s, i) {
      var k = 'sponsors.' + i;
      if (!isObj(s)) { add('error', k, 'Sponsor ' + (i + 1) + ' is not written as link, type, image lines.'); return; }
      if (blankVal(s.image)) { add('warn', k + '.image', 'Sponsor ' + (i + 1) + ' has no logo image.'); }
      else if (!/^(\/|https?:\/\/)/.test(String(s.image))) { add('error', k + '.image', 'Sponsor ' + (i + 1) + ': start the image with / or https://.'); }
      if (blankVal(s.link)) { add('warn', k + '.link', 'Sponsor ' + (i + 1) + ' has no website link.'); }
      else if (!isAbsUrl(String(s.link))) { add('error', k + '.link', 'Sponsor ' + (i + 1) + ': use a full address that starts with https://.'); }
      if (blankVal(s.type)) { add('info', k + '.type', 'Sponsor ' + (i + 1) + ' has no level, so it is listed under "Sponsor".'); }
      ['width', 'height'].forEach(function (d) { if (!blankVal(s[d]) && typeof s[d] !== 'number') { add('warn', k + '.' + d, 'Sponsor ' + (i + 1) + ': ' + d + ' should be a number.'); } });
    });

    /* Organizers */
    if (!Array.isArray(doc.organizers) || !doc.organizers.length) { add('warn', 'organizers', 'No organizers. The Contact section will be empty.'); }
    (Array.isArray(doc.organizers) ? doc.organizers : []).forEach(function (o, i) {
      var k = 'organizers.' + i;
      if (!isObj(o)) { add('error', k, 'Organizer ' + (i + 1) + ' is not written as name, email lines.'); return; }
      if (blankVal(o.name)) { add('warn', k + '.name', 'Organizer ' + (i + 1) + ' has no name.'); }
      if (!blankVal(o.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(o.email))) { add('error', k + '.email', 'Organizer ' + (i + 1) + ': this email address does not look right.'); }
      if (!blankVal(o.twitter) && /[@/]/.test(String(o.twitter))) { add('warn', k + '.twitter', 'Organizer ' + (i + 1) + ': give the X / Twitter handle only, without @ or a link.'); }
      ['linkedin', 'url'].forEach(function (u) { if (!blankVal(o[u]) && !isAbsUrl(String(o[u]))) { add('error', k + '.' + u, 'Organizer ' + (i + 1) + ': use a full address that starts with https://.'); } });
    });

    /* Social */
    if (isObj(doc.social)) {
      ['twitter', 'facebook', 'instagram', 'tiktok', 'pinterest'].forEach(function (s) { var v = doc.social[s]; if (!blankVal(v) && /^https?:|^@|\//.test(String(v))) { add('warn', 'social.' + s, 'Give the ' + s + ' handle or page name only. The site adds the rest of the address.'); } });
      ['linkedin', 'meetup', 'youtube'].forEach(function (s) { var v = doc.social[s]; if (!blankVal(v) && !isAbsUrl(String(v))) { add('error', 'social.' + s, 'Use the full ' + s + ' address that starts with https://.'); } });
    }
    if (isObj(doc.volunteers) && !blankVal(doc.volunteers.volunteerurl) && !isAbsUrl(String(doc.volunteers.volunteerurl))) { add('error', 'volunteers.volunteerurl', 'Use a full address that starts with https://.'); }

    /* HTML fields */
    Object.keys(FIELD_BY_KEY).forEach(function (k) {
      var f = FIELD_BY_KEY[k];
      if (f.type !== 'html' || blankVal(doc[k])) { return; }
      tagProblems(String(doc[k])).forEach(function (p) { add('warn', k, p); });
      if (/<script\b/i.test(String(doc[k])) && ['countdownscript', 'eventbriteembed', 'schedulehtml'].indexOf(k) < 0) { add('warn', k, 'This text has a <script> tag. Scripts in descriptions are usually a mistake.'); }
    });
    if (blankVal(doc.eventlocation) && doc.physical === true) { add('warn', 'eventlocation', 'In-person event with no location.'); }
    if (!blankVal(doc.capacity) && typeof doc.capacity !== 'number') { add('warn', 'capacity', 'Capacity is usually a number.'); }

    /* Dates and what will show */
    var ev = typeof doc.date === 'string' ? Date.parse(doc.date.replace(' ', 'T').replace(/ ([-+]\d{2})(\d{2})$/, '$1:$2')) : NaN;
    if (!isNaN(ev) && ev + 86400000 < Date.now()) { add('info', 'date', 'This event is in the past, so registration and the call for speakers are hidden.'); }
    if (!state.post && state.key) { add('info', 'name', 'There is no event post in _posts for ' + state.key + ', so this data has no page yet.'); }
    if (state.text && docCount(state.text) > 1) { add('warn', 'other', 'This file has more than one YAML document (a second --- line). The site reads only the first one.'); }
    if (!blankVal(doc.redirect) || doc.layout === 'redirect') { add('warn', 'other', 'This looks like a redirect page, not event data. Redirect files belong in the site root, not in _data/events.'); }
    var unknown = Object.keys(doc).filter(function (k) { return !FIELD_BY_KEY[k]; });
    if (unknown.length) { add('info', 'other', 'Kept as is: ' + unknown.join(', ') + '.'); }
    return out;
  }

  function runValidation() {
    var list = $('#dod-ed-checks');
    var results = validate(state.doc || {});
    state.checks = results;
    $all('.dod-ed-msg').forEach(function (m) { if (m.getAttribute('data-msg-for') !== 'dod-ed-other' || !m.classList.contains('is-error')) { m.textContent = ''; m.className = 'dod-ed-msg'; } });
    $all('.has-error, .has-warn').forEach(function (x) { x.classList.remove('has-error', 'has-warn'); });
    list.innerHTML = '';
    var counts = { error: 0, warn: 0, info: 0 };
    var order = { error: 0, warn: 1, info: 2 };
    results.sort(function (a, b) { return order[a.level] - order[b.level]; });
    results.forEach(function (r) {
      counts[r.level]++;
      var id = r.key === 'other' ? 'dod-ed-other' : fieldId(r.key);
      var msg = $('[data-msg-for="' + id + '"]');
      if (msg && r.level !== 'info') { msg.textContent = (msg.textContent ? msg.textContent + ' ' : '') + r.msg; msg.className = 'dod-ed-msg is-' + r.level; var row = msg.closest('.dod-ed-field'); if (row) { row.classList.add(r.level === 'error' ? 'has-error' : 'has-warn'); } }
      var label = r.level === 'error' ? 'Fix' : (r.level === 'warn' ? 'Check' : 'Note');
      var li = el('li', { class: 'dod-ed-check is-' + r.level }, [el('span', { class: 'dod-ed-check__lvl', text: label }), el('span', { text: ' ' + r.msg + ' ' }), el('code', { text: r.key })]);
      li.addEventListener('click', function () { focusKey(r.key); });
      li.tabIndex = 0;
      li.addEventListener('keydown', function (e) { if (e.key === 'Enter') { focusKey(r.key); } });
      list.appendChild(li);
    });
    if (state.writeMode > 0) {
      counts.warn++;
      list.insertBefore(el('li', { class: 'dod-ed-check is-warn' }, [el('span', { class: 'dod-ed-check__lvl', text: 'Check' }), el('span', { text: ' The editor rewrote the whole file to keep it valid, so the change will look bigger than it is. Review the changes before saving.' })]), list.firstChild);
    }
    if (!results.length) { list.appendChild(el('li', { class: 'dod-ed-check is-ok', text: 'No problems found.' })); }
    var sum = $('#dod-ed-checksum');
    sum.innerHTML = '';
    sum.appendChild(el('span', { class: 'badge ' + (counts.error ? 'badge-danger' : 'badge-success'), text: counts.error + ' to fix' }));
    sum.appendChild(document.createTextNode(' '));
    sum.appendChild(el('span', { class: 'badge badge-warning', text: counts.warn + ' to check' }));
    sum.appendChild(document.createTextNode(' '));
    sum.appendChild(el('span', { class: 'badge badge-light', text: counts.info + (counts.info === 1 ? ' note' : ' notes') }));
    $all('[data-needs-valid]').forEach(function (b) { b.disabled = counts.error > 0; });
    var tabBadge = $('#dod-ed-tab-review .badge');
    if (tabBadge) { tabBadge.textContent = counts.error ? String(counts.error) : ''; tabBadge.hidden = !counts.error; }
  }
  function focusKey(key) {
    selectTab('form');
    var target = document.getElementById(fieldId(key)) || $('[data-key="' + fieldId(key) + '"]') || $('[data-key="' + fieldId(key.split('.').slice(0, 2).join('.')) + '"]') || $('[data-key="' + fieldId(key.split('.')[0]) + '"]');
    if (key === 'other') { target = $('#dod-ed-sec-other'); }
    if (!target) { return; }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    var focusable = target.matches('input,select,textarea') ? target : target.querySelector('input,select,textarea');
    var html = target.closest ? target.closest('.dod-ed-html') || (target.querySelector && target.querySelector('.dod-ed-html')) : null;
    if (html && !html.querySelector('.dod-ed-visual').hidden) { focusable = html.querySelector('.dod-ed-visual'); }
    else if (focusable && focusable.closest('.dod-ed-field') && focusable.closest('.dod-ed-field').querySelector('.dod-ed-visual:not([hidden])')) { focusable = focusable.closest('.dod-ed-field').querySelector('.dod-ed-visual'); }
    if (focusable) { setTimeout(function () { focusable.focus({ preventScroll: true }); }, 300); }
  }

  /* Online checks: images load, Sessionize endpoints answer with JSON. */
  function onlineChecks() {
    var out = $('#dod-ed-online');
    out.innerHTML = '';
    var doc = state.doc || {};
    var jobs = [];
    function row(text, cls) { var li = el('li', { class: 'dod-ed-check ' + cls, text: text }); out.appendChild(li); return li; }
    function img(label, src) {
      var li = row('Checking ' + label + '...', 'is-info');
      jobs.push(new Promise(function (resolve) {
        var i = new Image();
        var t = setTimeout(function () { li.textContent = label + ': no answer after 10 seconds (' + src + ')'; li.className = 'dod-ed-check is-warn'; resolve(); }, 10000);
        i.onload = function () { clearTimeout(t); li.textContent = label + ' loads (' + i.naturalWidth + ' x ' + i.naturalHeight + ').'; li.className = 'dod-ed-check is-ok'; resolve(); };
        i.onerror = function () { clearTimeout(t); li.textContent = label + ' does not load: ' + src; li.className = 'dod-ed-check is-error'; resolve(); };
        i.src = assetUrl(src);
      }));
    }
    if (!blankVal(doc.logo)) { img('Logo', String(doc.logo)); }
    (Array.isArray(doc.sponsors) ? doc.sponsors : []).forEach(function (s, i) { if (isObj(s) && !blankVal(s.image)) { img('Sponsor ' + (i + 1) + ' logo', String(s.image)); } });
    [1, 2, 3].forEach(function (n) { String(doc['preconspeakerimageurl' + n] || '').split(',').forEach(function (p) { p = p.trim(); if (p) { img('Pre-con ' + n + ' speaker photo', p); } }); });
    if (String(doc.sessionizetype || '').toLowerCase() === 'json') {
      ['speakerlisturl', 'submittedsessionurl', 'scheduleurl'].forEach(function (k) {
        var u = doc[k];
        if (blankVal(u)) { return; }
        var li = row('Checking ' + k + '...', 'is-info');
        jobs.push(fetch(String(u)).then(function (r) { if (!r.ok) { throw new Error('HTTP ' + r.status); } return r.json(); }).then(function (j) {
          var n = Array.isArray(j) ? j.length : 0;
          var detail = k === 'submittedsessionurl' && Array.isArray(j) ? j.reduce(function (a, g) { return a + ((g && g.sessions) ? g.sessions.length : 0); }, 0) + ' sessions' : (Array.isArray(j) ? n + ' items' : 'answered');
          li.textContent = k + ' answers with JSON (' + detail + ').';
          li.className = 'dod-ed-check is-ok';
        }).catch(function (e) { li.textContent = k + ' did not answer with JSON (' + e.message + ').'; li.className = 'dod-ed-check is-error'; }));
      });
    }
    if (!jobs.length) { row('Nothing to check online.', 'is-info'); }
    return Promise.all(jobs);
  }

  /* ================= Preview ================= */
  var templateCache = {};
  function templateSource() {
    var repo = $('#dod-ed-tplrepo').value.trim() || CFG.upstream;
    var branch = $('#dod-ed-tplbranch').value.trim() || CFG.upstreamBranch;
    return { repo: repo, branch: branch };
  }
  function loadTemplates() {
    var src = templateSource();
    var id = src.repo + '@' + src.branch;
    if (!templateCache[id]) {
      templateCache[id] = Promise.all([
        fetchFile(src.repo, src.branch, '_layouts/event.html'),
        fetchFile(src.repo, src.branch, '_includes/eventlayout.html'),
        fetchFile(src.repo, src.branch, CFG.dataDir + 'SQLSattemplate.yml').catch(function () { return { text: '' }; })
      ]).then(function (r) { return { event: r[0].text.replace(/^---[\s\S]*?---\s*\n/, ''), eventlayout: r[1].text, datatpl: r[2].text }; })
        .catch(function (e) { delete templateCache[id]; throw e; });
    }
    return templateCache[id];
  }
  function assetUrl(p) {
    p = String(p).trim();
    if (/^[a-z][a-z0-9+.-]*:/i.test(p) || p.indexOf('//') === 0) { return p; }
    return CFG.assetOrigin + CFG.baseurl + (p.charAt(0) === '/' ? '' : '/') + p;
  }
  function withDates(v) {
    if (typeof v === 'string') { return looksTimestamp(v) ? (window.DodLiquid.fromYamlTimestamp(v, CFG.timezone) || v) : v; }
    if (Array.isArray(v)) { return v.map(withDates); }
    if (isObj(v)) { var o = {}; Object.keys(v).forEach(function (k) { o[k] = withDates(v[k]); }); return o; }
    return v;
  }
  function absolutize(html) {
    var origin = CFG.assetOrigin + CFG.baseurl;
    return html.replace(/(\s(?:src|href|poster|data-src|action)\s*=\s*)(["'])\/(?!\/)/gi, '$1$2' + origin + '/')
      .replace(/url\((["']?)\/(?!\/)/gi, 'url($1' + origin + '/');
  }
  var previewSeq = 0;
  function renderPreview() {
    var frame = $('#dod-ed-frame');
    var msg = $('#dod-ed-previewmsg');
    if (!state.doc) { return; }
    var seq = ++previewSeq;
    msg.textContent = 'Building the preview...';
    msg.className = 'dod-ed-previewmsg';
    loadTemplates().then(function (tpl) {
      if (seq !== previewSeq) { return; }
      var simDate = $('#dod-ed-simdate').value;
      var nowMs = Date.now();
      if (simDate) { var p = simDate.split('-'); nowMs = Date.UTC(+p[0], +p[1] - 1, +p[2], 16, 0, 0); }
      var lq = new window.DodLiquid({
        timezone: CFG.timezone,
        baseurl: CFG.assetOrigin + CFG.baseurl,
        siteurl: '',
        includes: {
          'eventlayout.html': tpl.eventlayout,
          'header.html': '<div class="intro-header"><div class="container-md"><div class="row"><div class="col-xl-8 offset-xl-2 col-lg-10 offset-lg-1"><div class="page-heading"><h1>{{ page.title }}</h1>{% if page.subtitle %}<hr class="small"><span class="page-subheading">{{ page.subtitle }}</span>{% endif %}</div></div></div></div></div>',
          'social-share.html': '', 'comments.html': ''
        }
      });
      lq.now = function () { return window.DodLiquid.time(nowMs); };
      var key = state.key || 'preview';
      var events = {};
      events[key] = withDates(state.doc);
      var post = state.post || {};
      var html = lq.render(tpl.event, {
        site: { time: window.DodLiquid.time(nowMs), data: { events: events }, title: 'Day of Data', baseurl: CFG.baseurl },
        page: { title: post.title || state.doc.name || key, subtitle: post.subtitle || '', tags: post.tags || [], data: key, url: post.url || '' }
      });
      var origin = CFG.assetOrigin + CFG.baseurl;
      var shim = simDate ? '<script>(function(){var D=Date,off=' + nowMs + '-D.now();function F(){if(!(this instanceof F)){return new D(D.now()+off).toString();}var a=[].slice.call(arguments);if(!a.length){return new D(D.now()+off);}return new (Function.prototype.bind.apply(D,[null].concat(a)))();}F.prototype=D.prototype;F.now=function(){return D.now()+off;};F.UTC=D.UTC;F.parse=D.parse;window.Date=F;})();<\/script>' : '';
      var doc = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' + shim +
        '<link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.4.1/css/bootstrap.min.css">' +
        '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.12.1/css/all.min.css">' +
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Lora:400,700,400italic,700italic|Open+Sans:400,600,700,800">' +
        '<link rel="stylesheet" href="' + origin + '/assets/css/bootstrap-social.css">' +
        '<link rel="stylesheet" href="' + origin + '/assets/css/beautifuljekyll.css">' +
        '<style>body{padding-top:0}.intro-header{margin-top:1rem}</style></head><body>' +
        absolutize(html) + '</body></html>';
      frame.srcdoc = doc;
      var errs = lq.errors.filter(function (e) { return !/Include not available in preview: (comments|social-share)\.html/.test(e); });
      var src = templateSource();
      msg.textContent = 'Preview of ' + (state.file || 'this file') + ' using the page templates from ' + src.repo + ' @ ' + src.branch + (simDate ? ', as if today were ' + simDate : '') + '. Links and forms work; nothing is saved.' + (errs.length ? ' Template notes: ' + errs.slice(0, 3).join('; ') : '');
    }).catch(function (e) {
      msg.textContent = 'The preview could not load the page templates: ' + e.message;
      msg.className = 'dod-ed-previewmsg text-danger';
    });
  }
  var schedulePreview = debounce(renderPreview, 700);

  /* ================= Review: diff ================= */
  function lineDiff(a, b) {
    var A = a.replace(/\r\n?/g, '\n').split('\n'), B = b.replace(/\r\n?/g, '\n').split('\n');
    var pre = 0;
    while (pre < A.length && pre < B.length && A[pre] === B[pre]) { pre++; }
    var suf = 0;
    while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) { suf++; }
    var a2 = A.slice(pre, A.length - suf), b2 = B.slice(pre, B.length - suf);
    var n = a2.length, m = b2.length;
    var ops = [];
    if (n * m > 4000000) {
      a2.forEach(function (l) { ops.push(['-', l]); });
      b2.forEach(function (l) { ops.push(['+', l]); });
    } else {
      var L = [];
      for (var i = 0; i <= n; i++) { L.push(new Uint16Array(m + 1)); }
      for (var x = n - 1; x >= 0; x--) { for (var y = m - 1; y >= 0; y--) { L[x][y] = a2[x] === b2[y] ? L[x + 1][y + 1] + 1 : Math.max(L[x + 1][y], L[x][y + 1]); } }
      var p = 0, q = 0;
      while (p < n && q < m) {
        if (a2[p] === b2[q]) { ops.push([' ', a2[p]]); p++; q++; }
        else if (L[p + 1][q] >= L[p][q + 1]) { ops.push(['-', a2[p]]); p++; }
        else { ops.push(['+', b2[q]]); q++; }
      }
      while (p < n) { ops.push(['-', a2[p++]]); }
      while (q < m) { ops.push(['+', b2[q++]]); }
    }
    var all = A.slice(0, pre).map(function (l) { return [' ', l]; }).concat(ops).concat(A.slice(A.length - suf).map(function (l) { return [' ', l]; }));
    return all;
  }
  function renderDiff(ops) {
    var CONTEXT = 3, keep = [];
    ops.forEach(function (o, i) { if (o[0] !== ' ') { for (var j = Math.max(0, i - CONTEXT); j <= Math.min(ops.length - 1, i + CONTEXT); j++) { keep[j] = true; } } });
    var out = [], gap = false, ln = 0, rn = 0, adds = 0, dels = 0;
    ops.forEach(function (o, i) {
      if (o[0] !== '+') { ln++; }
      if (o[0] !== '-') { rn++; }
      if (o[0] === '+') { adds++; }
      if (o[0] === '-') { dels++; }
      if (!keep[i]) { if (!gap) { out.push('<div class="dod-ed-diff__gap">...</div>'); gap = true; } return; }
      gap = false;
      var cls = o[0] === '+' ? 'is-add' : (o[0] === '-' ? 'is-del' : '');
      out.push('<div class="dod-ed-diff__ln ' + cls + '"><span class="dod-ed-diff__no">' + (o[0] === '+' ? '' : ln) + '</span><span class="dod-ed-diff__no">' + (o[0] === '-' ? '' : rn) + '</span><span class="dod-ed-diff__mk">' + (o[0] === ' ' ? '' : o[0]) + '</span><span class="dod-ed-diff__tx">' + esc(o[1]) + '</span></div>');
    });
    return { html: out.join(''), adds: adds, dels: dels };
  }
  function updateReview() {
    var box = $('#dod-ed-diff');
    if (!box || !state.doc) { return; }
    if (state.text === state.loadedText) { box.innerHTML = '<p class="text-muted p-3 mb-0">No changes yet. Edit the form or the YAML, and the changes show here.</p>'; $('#dod-ed-diffsum').textContent = ''; return; }
    var d = renderDiff(lineDiff(state.loadedText, state.text));
    box.innerHTML = d.html;
    $('#dod-ed-diffsum').textContent = d.adds + (d.adds === 1 ? ' line' : ' lines') + ' added, ' + d.dels + ' removed, compared with the file as it was loaded.';
  }

  /* ================= Save: download, copy, GitHub ================= */
  function download() {
    var blob = new Blob([state.text], { type: 'text/yaml;charset=utf-8' });
    var a = el('a', { href: URL.createObjectURL(blob), download: state.file || 'event.yml' });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    flash('#dod-ed-savemsg', 'Downloaded ' + (state.file || 'event.yml') + '. Put it in _data/events/ in your copy of the site.');
  }
  function copyText() {
    var done = function () { flash('#dod-ed-savemsg', 'Copied the YAML. Paste it over the whole file in the GitHub editor.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(state.text).then(done, fallback); } else { fallback(); }
    function fallback() { var ta = $('#dod-ed-raw'); ta.value = state.text; selectTab('yaml'); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { flash('#dod-ed-savemsg', 'Select all on the YAML tab and copy it.'); } }
  }
  function flash(sel, text, isError) { var m = $(sel); m.textContent = text; m.className = 'dod-ed-savemsg' + (isError ? ' text-danger' : ' text-success'); }

  /* ---- GitHub ---- */
  var gh = {
    user: null, fork: null,
    token: function () { return SS.get('token') || LS.get('token', null); }
  };
  function ghFetch(method, path, body) {
    var token = gh.token();
    var headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (token) { headers.Authorization = 'Bearer ' + token; }
    if (body !== undefined) { headers['Content-Type'] = 'application/json'; }
    return fetch(CFG.api + path, { method: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' }).then(function (r) {
      return r.text().then(function (t) {
        var j = null;
        try { j = t ? JSON.parse(t) : null; } catch (e) { j = { message: t }; }
        if (!r.ok) {
          var err = new Error((j && j.message) || ('GitHub answered ' + r.status));
          err.status = r.status; err.body = j;
          if (j && j.errors && j.errors.length) { err.message += ': ' + j.errors.map(function (x) { return x.message || x.code; }).join('; '); }
          throw err;
        }
        return j;
      });
    });
  }
  function ghConnect() {
    var input = $('#dod-ed-token');
    var t = input.value.trim();
    if (t) {
      if ($('#dod-ed-remember').checked) { LS.set('token', t); SS.del('token'); } else { SS.set('token', t); LS.del('token'); }
      input.value = '';
    }
    if (!gh.token()) { flash('#dod-ed-ghmsg', 'Paste a GitHub token first.', true); return Promise.resolve(); }
    flash('#dod-ed-ghmsg', 'Checking your token...');
    return ghFetch('GET', '/user').then(function (u) {
      gh.user = u;
      return findFork().then(function () {
        updateGhUi();
        flash('#dod-ed-ghmsg', 'Signed in as ' + u.login + '.');
      });
    }).catch(function (e) {
      gh.user = null;
      flash('#dod-ed-ghmsg', e.status === 401 ? 'GitHub did not accept that token. Check it and try again.' : 'Could not sign in: ' + e.message, true);
      updateGhUi();
    });
  }
  function ghForget() {
    SS.del('token'); LS.del('token');
    gh.user = null; gh.fork = null;
    updateGhUi();
    flash('#dod-ed-ghmsg', 'The token is removed from this browser.');
  }
  function findFork() {
    var name = CFG.upstream.split('/')[1];
    return ghFetch('GET', '/repos/' + gh.user.login + '/' + name).then(function (r) {
      if (r.full_name.toLowerCase() === CFG.upstream.toLowerCase() || (r.parent && r.parent.full_name.toLowerCase() === CFG.upstream.toLowerCase()) || (r.source && r.source.full_name.toLowerCase() === CFG.upstream.toLowerCase())) { gh.fork = r; }
      else { gh.fork = null; }
    }).catch(function (e) { if (e.status === 404) { gh.fork = null; return; } throw e; }).then(function () {
      if (gh.fork) { return listBranches(gh.fork.full_name); }
    });
  }
  function listBranches(repo) {
    return ghFetch('GET', '/repos/' + repo + '/branches?per_page=100').then(function (list) {
      var dl = $('#dod-ed-branches');
      dl.innerHTML = '';
      var sel = $('#dod-ed-ghbranch');
      var keep = sel.value;
      sel.innerHTML = '';
      list.forEach(function (b) { dl.appendChild(el('option', { value: b.name })); sel.appendChild(el('option', { value: b.name, text: b.name })); });
      if (keep && list.some(function (b) { return b.name === keep; })) { sel.value = keep; }
      else if (state.source && state.source.repo === repo && list.some(function (b) { return b.name === state.source.branch; })) { sel.value = state.source.branch; }
    }).catch(function () { /* branch list is a convenience */ });
  }
  function targetRepo() {
    var mode = $('#dod-ed-ghtarget').value;
    if (mode === 'upstream') { return CFG.upstream; }
    return gh.fork ? gh.fork.full_name : (gh.user ? gh.user.login + '/' + CFG.upstream.split('/')[1] : null);
  }
  function updateGhUi() {
    var signed = !!gh.user;
    $('#dod-ed-ghsignin').hidden = signed;
    $('#dod-ed-ghsigned').hidden = !signed;
    if (signed) {
      $('#dod-ed-ghwho').textContent = gh.user.login;
      $('#dod-ed-ghfork').textContent = gh.fork ? gh.fork.full_name : 'none yet (one is made when you commit)';
      $('#dod-ed-usefork').hidden = !gh.fork;
    }
    updateGhTargets();
  }
  function updateGhTargets() {
    if (!state.key) { return; }
    var nb = $('#dod-ed-newbranch');
    if (!nb.value || nb.getAttribute('data-auto') === 'yes') {
      var d = new Date();
      nb.value = 'event-' + state.key.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
      nb.setAttribute('data-auto', 'yes');
    }
    var cm = $('#dod-ed-commitmsg');
    if (!cm.value || cm.getAttribute('data-auto') === 'yes') {
      cm.value = 'Update ' + ((state.doc && state.doc.name) || state.key) + ' event data';
      cm.setAttribute('data-auto', 'yes');
    }
    var mode = document.querySelector('input[name="dod-ed-branchmode"]:checked');
    $('#dod-ed-newbranchrow').hidden = mode && mode.value !== 'new';
    $('#dod-ed-oldbranchrow').hidden = !mode || mode.value !== 'existing';
    var repo = targetRepo();
    var link = $('#dod-ed-webedit');
    var br = $('#dod-ed-branch').value.trim() || CFG.upstreamBranch;
    var srcRepo = (state.source && state.source.repo) || CFG.upstream;
    link.href = 'https://github.com/' + srcRepo + '/edit/' + br + '/' + dataPath(state.key);
    link.textContent = 'Open ' + state.file + ' in the GitHub editor (' + srcRepo + ' @ ' + br + ')';
    if (repo) { $('#dod-ed-ghrepo').textContent = repo; }
  }

  function waitForRepo(full, tries) {
    return ghFetch('GET', '/repos/' + full).catch(function (e) {
      if (e.status === 404 && tries > 0) { return new Promise(function (res) { setTimeout(res, 2500); }).then(function () { return waitForRepo(full, tries - 1); }); }
      throw e;
    });
  }
  function ensureFork() {
    if ($('#dod-ed-ghtarget').value === 'upstream') { return ghFetch('GET', '/repos/' + CFG.upstream); }
    if (gh.fork) { return Promise.resolve(gh.fork); }
    progress('Making your fork of ' + CFG.upstream + '...');
    return ghFetch('POST', '/repos/' + CFG.upstream + '/forks', {}).then(function (r) {
      return waitForRepo(r.full_name, 12);
    }).then(function (r) { gh.fork = r; updateGhUi(); return r; });
  }
  function ensureBranch(repo, branch, fromExisting) {
    if (fromExisting) { return Promise.resolve(); }
    progress('Making branch ' + branch + ' from ' + CFG.upstream + ' @ ' + CFG.upstreamBranch + '...');
    return ghFetch('GET', '/repos/' + CFG.upstream + '/git/ref/heads/' + encodeURIComponent(CFG.upstreamBranch)).then(function (ref) {
      var sha = ref.object.sha;
      return ghFetch('POST', '/repos/' + repo + '/git/refs', { ref: 'refs/heads/' + branch, sha: sha }).catch(function (e) {
        if (e.status === 422 && /already exists/i.test(e.message)) { var er = new Error('Branch ' + branch + ' already exists in ' + repo + '. Pick "an existing branch" or give the new branch another name.'); er.stop = true; throw er; }
        if (e.status === 422 && repo !== CFG.upstream) {
          /* the fork does not have that commit yet: bring the fork's default branch up to date, then branch from it */
          return ghFetch('GET', '/repos/' + repo).then(function (info) {
            return ghFetch('POST', '/repos/' + repo + '/merge-upstream', { branch: info.default_branch }).catch(function () { return null; }).then(function () {
              return ghFetch('GET', '/repos/' + repo + '/git/ref/heads/' + encodeURIComponent(info.default_branch));
            });
          }).then(function (r2) { return ghFetch('POST', '/repos/' + repo + '/git/refs', { ref: 'refs/heads/' + branch, sha: r2.object.sha }); });
        }
        throw e;
      });
    });
  }
  function progress(text) { flash('#dod-ed-ghresult', text); }

  var pendingOverwrite = null;
  function commitToGitHub() {
    var result = $('#dod-ed-ghresult');
    if (!gh.user) { flash('#dod-ed-ghresult', 'Sign in with a GitHub token first.', true); return; }
    if (state.checks && state.checks.some(function (c) { return c.level === 'error'; })) { flash('#dod-ed-ghresult', 'Fix the problems marked "Fix" before committing.', true); return; }
    if (state.text === state.loadedText && !$('#dod-ed-ghforce').checked) { flash('#dod-ed-ghresult', 'There are no changes to commit.', true); return; }
    var modeEl = document.querySelector('input[name="dod-ed-branchmode"]:checked');
    var existing = modeEl && modeEl.value === 'existing';
    var branch = existing ? $('#dod-ed-ghbranch').value : $('#dod-ed-newbranch').value.trim();
    if (!branch) { flash('#dod-ed-ghresult', 'Give a branch name.', true); return; }
    if (!/^[A-Za-z0-9._\/-]+$/.test(branch) || /\.\.|\/\/|^\/|\/$|\.lock$|^-/.test(branch)) { flash('#dod-ed-ghresult', 'Use only letters, numbers, dashes, dots and slashes in the branch name.', true); return; }
    var message = $('#dod-ed-commitmsg').value.trim() || ('Update ' + state.file);
    var path = dataPath(state.key);
    var text = state.text;
    var btn = $('#dod-ed-commit');
    btn.disabled = true;
    var repo;
    result.innerHTML = '';
    ensureFork().then(function (r) {
      repo = r.full_name;
      return ensureBranch(repo, branch, existing);
    }).then(function () {
      progress('Reading ' + path + ' on ' + repo + ' @ ' + branch + '...');
      return ghFetch('GET', '/repos/' + repo + '/contents/' + encodeURI(path) + '?ref=' + encodeURIComponent(branch)).catch(function (e) { if (e.status === 404) { return null; } throw e; });
    }).then(function (cur) {
      var curText = cur && cur.content ? fromB64utf8(cur.content) : null;
      if (curText !== null && curText === text) { var same = new Error('That branch already has exactly this version of the file. Nothing to commit.'); same.stop = true; throw same; }
      var sameSource = state.source && state.source.repo === repo && state.source.branch === branch;
      var changedUnder = curText !== null && curText !== state.loadedText && (sameSource || !existing);
      if (changedUnder && pendingOverwrite !== repo + '@' + branch) {
        pendingOverwrite = repo + '@' + branch;
        var e2 = new Error('The file on ' + repo + ' @ ' + branch + ' is different from the version you loaded, so someone may have changed it. Load it again to start from that version, or press Commit again to replace it with yours.');
        e2.stop = true; throw e2;
      }
      pendingOverwrite = null;
      progress('Committing ' + path + '...');
      var body = { message: message, content: b64utf8(text), branch: branch };
      if (cur && cur.sha) { body.sha = cur.sha; }
      return ghFetch('PUT', '/repos/' + repo + '/contents/' + encodeURI(path), body);
    }).then(function (put) {
      var links = [];
      links.push(el('a', { href: put.commit.html_url, target: '_blank', rel: 'noopener noreferrer', text: 'See the commit' }));
      links.push(el('a', { href: 'https://github.com/' + repo + '/blob/' + branch + '/' + path, target: '_blank', rel: 'noopener noreferrer', text: 'See the file on ' + branch }));
      var head = repo === CFG.upstream ? branch : repo.split('/')[0] + ':' + branch;
      var compare = 'https://github.com/' + CFG.upstream + '/compare/' + CFG.upstreamBranch + '...' + (repo === CFG.upstream ? branch : repo.replace('/', ':') + ':' + branch) + '?expand=1';
      state.source = { key: state.key, repo: repo, branch: branch, sha: put.content.sha, kind: 'github' };
      state.loadedText = text;
      LS.del(draftKey());
      $('#dod-ed-repo').value = repo;
      $('#dod-ed-branch').value = branch;
      refreshText();
      var finish = function (prLink, note) {
        result.innerHTML = '';
        result.className = 'dod-ed-savemsg text-success';
        result.appendChild(el('strong', { text: 'Committed to ' + repo + ' @ ' + branch + '. ' }));
        links.concat(prLink ? [prLink] : []).forEach(function (a, i) { if (i) { result.appendChild(document.createTextNode(' | ')); } result.appendChild(a); });
        if (note) { result.appendChild(el('div', { class: 'text-muted small mt-1', text: note })); }
        status('Editing ' + state.file + ' from ' + repo + ' @ ' + branch + ' (' + put.content.sha.slice(0, 7) + ').');
        listBranches(repo);
      };
      if (!$('#dod-ed-pr').checked) {
        finish(el('a', { href: compare, target: '_blank', rel: 'noopener noreferrer', text: 'Open a pull request' }), 'No pull request was opened. Use the link when you are ready.');
        return;
      }
      progress('Opening a pull request...');
      var prBody = ($('#dod-ed-prbody').value.trim() || 'Event data update for ' + state.file + '.') + '\n\nMade with the event data editor (' + window.location.origin + CFG.baseurl + '/eventeditor/).';
      return ghFetch('POST', '/repos/' + CFG.upstream + '/pulls', { title: message, head: head, base: CFG.upstreamBranch, body: prBody, maintainer_can_modify: repo !== CFG.upstream }).then(function (pr) {
        finish(el('a', { href: pr.html_url, target: '_blank', rel: 'noopener noreferrer', text: 'Pull request #' + pr.number }));
      }).catch(function (e) {
        if (e.status === 422 && /already exists/i.test(e.message)) {
          return ghFetch('GET', '/repos/' + CFG.upstream + '/pulls?state=open&head=' + encodeURIComponent(repo.split('/')[0] + ':' + branch)).then(function (list) {
            finish(list && list[0] ? el('a', { href: list[0].html_url, target: '_blank', rel: 'noopener noreferrer', text: 'Pull request #' + list[0].number + ' (updated)' }) : el('a', { href: compare, target: '_blank', rel: 'noopener noreferrer', text: 'Open a pull request' }), 'This branch already had an open pull request, so the new commit was added to it.');
          });
        }
        finish(el('a', { href: compare, target: '_blank', rel: 'noopener noreferrer', text: 'Open a pull request' }), 'GitHub did not let this token open the pull request (' + e.message + '). Your commit is saved. Use the link to open the pull request on GitHub.');
      });
    }).catch(function (e) {
      flash('#dod-ed-ghresult', (e.stop ? '' : 'GitHub stopped the commit: ') + e.message + (e.status === 403 || e.status === 404 ? ' Check that the token can write to ' + (repo || 'your fork') + '.' : ''), true);
    }).then(function () { btn.disabled = false; runValidation(); });
  }

  /* ================= Tabs ================= */
  var currentTab = 'form';
  function selectTab(name) {
    currentTab = name;
    $all('[data-tab-btn]').forEach(function (b) { var on = b.getAttribute('data-tab-btn') === name; b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    $all('[data-tab]').forEach(function (p) { p.hidden = p.getAttribute('data-tab') !== name; });
    if (name === 'yaml' && state.doc && !state.rawDirty) { $('#dod-ed-raw').value = state.text; }
    if (name === 'preview') { renderPreview(); }
    if (name === 'review') { updateReview(); updateGhTargets(); }
  }

  /* ================= Wire up ================= */
  function init() {
    fillPicker('');
    $('#dod-ed-repo').value = CFG.upstream;
    $('#dod-ed-branch').value = CFG.upstreamBranch;
    $('#dod-ed-tplrepo').value = CFG.upstream;
    $('#dod-ed-tplbranch').value = CFG.upstreamBranch;
    $('#dod-ed-filter').addEventListener('input', function () { fillPicker(this.value); });
    $('#dod-ed-event').addEventListener('change', function () { if (this.value) { loadEvent(this.value); } });
    $('#dod-ed-load').addEventListener('click', function () { var k = $('#dod-ed-event').value; if (!k) { showLoadError('Pick an event first.'); return; } loadEvent(k); });
    $('#dod-ed-file').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) { return; }
      var key = f.name.replace(/\.ya?ml$/i, '');
      f.text().then(function (t) { openText(t, { key: key, repo: null, branch: null, sha: null, kind: 'file' }); });
      this.value = '';
    });
    $all('[data-tab-btn]').forEach(function (b) { b.addEventListener('click', function () { selectTab(b.getAttribute('data-tab-btn')); }); });
    $('#dod-ed-advanced').addEventListener('change', function () { if (state.doc) { buildForm(); runValidation(); } });
    [['#dod-ed-hlempty', 'hl-empty', 'hlempty', 'yes'], ['#dod-ed-onlyempty', 'only-empty', 'onlyempty', 'no']].forEach(function (c) {
      var box = $(c[0]);
      box.checked = LS.get(c[2], c[3]) === 'yes';
      box.addEventListener('change', function () { LS.set(c[2], box.checked ? 'yes' : 'no'); $('#dod-ed-form').classList.toggle(c[1], box.checked); });
    });
    $('#dod-ed-layoutsel').addEventListener('change', function () {
      if (!state.doc) { return; }
      setVal('eventlayout', this.value || null);
      var f = document.getElementById(fieldId('eventlayout'));
      if (f) { f.value = this.value; }
      markUnused();
    });
    var raw = $('#dod-ed-raw');
    raw.addEventListener('input', function () { state.rawDirty = true; $('#dod-ed-rawstate').textContent = 'Changed here. Press Apply to form to use it.'; });
    $('#dod-ed-applyraw').addEventListener('click', function () { if (applyRaw()) { $('#dod-ed-rawstate').textContent = 'Applied.'; } });
    $('#dod-ed-resetraw').addEventListener('click', function () { raw.value = state.text; state.rawDirty = false; $('#dod-ed-rawerr').hidden = true; $('#dod-ed-rawstate').textContent = ''; });
    $('#dod-ed-revert').addEventListener('click', function () { if (window.confirm('Throw away every change and go back to the file as it was loaded?')) { setBase(state.loadedText); buildForm(); refreshText(); LS.del(draftKey()); } });
    $('#dod-ed-refresh').addEventListener('click', renderPreview);
    $('#dod-ed-simdate').addEventListener('change', renderPreview);
    $('#dod-ed-tplrepo').addEventListener('change', function () { renderPreview(); loadTemplateKeys(); });
    $('#dod-ed-tplbranch').addEventListener('change', function () { renderPreview(); loadTemplateKeys(); });
    $all('[data-width]').forEach(function (b) { b.addEventListener('click', function () { $all('[data-width]').forEach(function (x) { x.classList.toggle('active', x === b); }); $('#dod-ed-framewrap').style.maxWidth = b.getAttribute('data-width'); }); });
    $('#dod-ed-download').addEventListener('click', download);
    $('#dod-ed-copy').addEventListener('click', copyText);
    $('#dod-ed-online-run').addEventListener('click', onlineChecks);
    $('#dod-ed-connect').addEventListener('click', ghConnect);
    $('#dod-ed-token').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ghConnect(); } });
    $('#dod-ed-forget').addEventListener('click', ghForget);
    $('#dod-ed-commit').addEventListener('click', commitToGitHub);
    $('#dod-ed-usefork').addEventListener('click', function () { if (gh.fork) { $('#dod-ed-repo').value = gh.fork.full_name; $('#dod-ed-tplrepo').value = gh.fork.full_name; status('Load from and preview templates now point at your fork. Pick a branch and press Load.'); } });
    $('#dod-ed-ghtarget').addEventListener('change', function () { var repo = targetRepo(); if (repo && gh.user) { listBranches(repo); } updateGhTargets(); });
    $all('input[name="dod-ed-branchmode"]').forEach(function (r) { r.addEventListener('change', updateGhTargets); });
    $('#dod-ed-newbranch').addEventListener('input', function () { this.setAttribute('data-auto', 'no'); });
    $('#dod-ed-commitmsg').addEventListener('input', function () { this.setAttribute('data-auto', 'no'); });
    $('#dod-ed-pr').checked = LS.get('openpr', 'yes') === 'yes';
    $('#dod-ed-pr').addEventListener('change', function () { LS.set('openpr', this.checked ? 'yes' : 'no'); $('#dod-ed-prbodyrow').hidden = !this.checked; });
    $('#dod-ed-prbodyrow').hidden = !$('#dod-ed-pr').checked;
    window.addEventListener('beforeunload', function (e) { if (state.doc && state.text !== state.loadedText) { e.preventDefault(); e.returnValue = ''; } });

    /* ?event=SQLSat1168&repo=owner/name&branch=main opens straight into an event */
    var qs = new URLSearchParams(window.location.search);
    if (qs.get('repo')) { $('#dod-ed-repo').value = qs.get('repo'); }
    if (qs.get('branch')) { $('#dod-ed-branch').value = qs.get('branch'); }
    if (gh.token()) { ghConnect(); }
    var ev = qs.get('event');
    if (ev) { $('#dod-ed-event').value = ev; loadEvent(ev); }
  }

  init();
  window.DodEventEditor = { state: state, serialize: safeSerialize, splitBlocks: splitBlocks, validate: validate, setBase: setBase, refresh: refreshText, CFG: CFG };
})();
