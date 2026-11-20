/* A small Liquid 4 renderer for the event data editor preview (eventeditor.html).
   It covers the tags and filters the event templates use (_layouts/event.html and
   _includes/eventlayout.html), with Ruby Liquid 4.0.4 / Jekyll 3 behavior:
   assign, capture, if/elsif/else, unless, case/when, for (limit, offset, reversed),
   break, continue, comment, raw, include, and the common standard + Jekyll filters.
   Usage:
     var lq = new DodLiquid({ timezone: 'America/Toronto', baseurl: '', includes: { 'eventlayout.html': src } });
     var html = lq.render(templateSource, { site: {...}, page: {...} });
   Dates: pass DodLiquid.time(ms, offsetMinutes) or DodLiquid.dateOnly('2027-03-31') objects. */
(function (global) {
  'use strict';

  /* ---------- Ruby-like values ---------- */
  function LTime(ms, offsetMin, kind) {
    this.ms = ms;
    this.offsetMin = (offsetMin === undefined) ? null : offsetMin; // null = site time zone
    this.kind = kind || 'time'; // 'time' or 'date'
  }
  function EmptyLit() {}
  function BlankLit() {}
  var EMPTY = new EmptyLit();
  var BLANK = new BlankLit();

  function isHash(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof LTime) && !(v instanceof Range); }
  function Range(a, b) { this.a = a; this.b = b; }
  Range.prototype.toArray = function () { var out = []; for (var i = this.a; i <= this.b; i++) { out.push(i); } return out; };

  function pad(n, w, ch) { var s = String(Math.abs(n)); while (s.length < w) { s = (ch || '0') + s; } return (n < 0 ? '-' : '') + s; }

  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  /* Offset (minutes east of UTC) of a time zone at an instant, using Intl. */
  var dtfCache = {};
  function tzOffsetAt(ms, tz) {
    if (!tz || tz === 'UTC') { return 0; }
    var f = dtfCache[tz];
    if (!f) {
      try {
        f = dtfCache[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } catch (e) { return 0; }
    }
    var p = {};
    f.formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    var asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
  }
  /* Wall clock time in a zone -> epoch ms. */
  function zonedToMs(y, mo, d, h, mi, s, tz) {
    var guess = Date.UTC(y, mo - 1, d, h, mi, s);
    var off = tzOffsetAt(guess, tz);
    var ms = guess - off * 60000;
    var off2 = tzOffsetAt(ms, tz);
    if (off2 !== off) { ms = guess - off2 * 60000; }
    return ms;
  }

  function parts(t, tz) {
    var off = t.kind === 'date' ? 0 : (t.offsetMin === null ? tzOffsetAt(t.ms, tz) : t.offsetMin);
    var d = new Date(t.ms + off * 60000);
    return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), wd: d.getUTCDay(), off: off, ms: t.ms,
      yday: Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1 };
  }
  function offStr(off, colon) { var sign = off < 0 ? '-' : '+'; var a = Math.abs(off); return sign + pad(Math.floor(a / 60), 2) + (colon ? ':' : '') + pad(a % 60, 2); }

  function strftime(t, fmt, tz) {
    var p = parts(t, tz);
    return fmt.replace(/%([-_0^#]?)(\d*)([a-zA-Z%])/g, function (m, flag, width, c) {
      var v, num = true, w = 2;
      switch (c) {
        case 'Y': v = p.y; w = 4; break;
        case 'C': v = Math.floor(p.y / 100); break;
        case 'y': v = p.y % 100; break;
        case 'm': v = p.mo; break;
        case 'd': v = p.d; break;
        case 'e': v = p.d; if (!flag) { flag = '_'; } break;
        case 'j': v = p.yday; w = 3; break;
        case 'H': v = p.h; break;
        case 'k': v = p.h; if (!flag) { flag = '_'; } break;
        case 'I': v = (p.h % 12) || 12; break;
        case 'l': v = (p.h % 12) || 12; if (!flag) { flag = '_'; } break;
        case 'M': v = p.mi; break;
        case 'S': v = p.s; break;
        case 'L': v = p.ms % 1000; w = 3; break;
        case 'u': v = p.wd || 7; w = 1; break;
        case 'w': v = p.wd; w = 1; break;
        case 's': v = Math.floor(p.ms / 1000); w = 1; break;
        case 'A': num = false; v = DAYS[p.wd]; break;
        case 'a': num = false; v = DAYS[p.wd].slice(0, 3); break;
        case 'B': num = false; v = MONTHS[p.mo - 1]; break;
        case 'b': case 'h': num = false; v = MONTHS[p.mo - 1].slice(0, 3); break;
        case 'p': num = false; v = p.h < 12 ? 'AM' : 'PM'; if (flag === '#') { v = v.toLowerCase(); } break;
        case 'P': num = false; v = p.h < 12 ? 'am' : 'pm'; break;
        case 'z': num = false; v = offStr(p.off, false); break;
        case 'Z': num = false; v = t.kind === 'date' ? '+00:00' : (t.offsetMin === null ? '' : (t.offsetMin === 0 ? 'UTC' : '')); break;
        case 'F': num = false; v = pad(p.y, 4) + '-' + pad(p.mo, 2) + '-' + pad(p.d, 2); break;
        case 'D': case 'x': num = false; v = pad(p.mo, 2) + '/' + pad(p.d, 2) + '/' + pad(p.y % 100, 2); break;
        case 'T': case 'X': num = false; v = pad(p.h, 2) + ':' + pad(p.mi, 2) + ':' + pad(p.s, 2); break;
        case 'R': num = false; v = pad(p.h, 2) + ':' + pad(p.mi, 2); break;
        case 'r': num = false; v = pad((p.h % 12) || 12, 2) + ':' + pad(p.mi, 2) + ':' + pad(p.s, 2) + ' ' + (p.h < 12 ? 'AM' : 'PM'); break;
        case 'c': num = false; v = DAYS[p.wd].slice(0, 3) + ' ' + MONTHS[p.mo - 1].slice(0, 3) + ' ' + pad(p.d, 2, ' ') + ' ' + pad(p.h, 2) + ':' + pad(p.mi, 2) + ':' + pad(p.s, 2) + ' ' + p.y; break;
        case '%': return '%';
        default: return m;
      }
      if (!num) { return flag === '^' ? String(v).toUpperCase() : String(v); }
      if (width) { w = parseInt(width, 10); }
      if (flag === '-') { return String(v); }
      if (flag === '_') { return pad(v, w, ' '); }
      return pad(v, w, '0');
    });
  }

  /* ---------- Ruby-like conversions ---------- */
  function numToS(n) {
    if (typeof n !== 'number') { return String(n); }
    if (!isFinite(n)) { return n > 0 ? 'Infinity' : (n < 0 ? '-Infinity' : 'NaN'); }
    return String(n);
  }
  function inspect(v) {
    if (v === null || v === undefined) { return 'nil'; }
    if (typeof v === 'string') { return JSON.stringify(v); }
    if (Array.isArray(v)) { return '[' + v.map(inspect).join(', ') + ']'; }
    if (isHash(v)) { return '{' + Object.keys(v).map(function (k) { return JSON.stringify(k) + '=>' + inspect(v[k]); }).join(', ') + '}'; }
    return toS(v);
  }
  function toS(v, tz) {
    if (v === null || v === undefined) { return ''; }
    if (typeof v === 'string') { return v; }
    if (typeof v === 'number') { return numToS(v); }
    if (typeof v === 'boolean') { return v ? 'true' : 'false'; }
    if (v instanceof LTime) {
      if (v.kind === 'date') { return strftime(v, '%Y-%m-%d', tz); }
      return strftime(v, '%Y-%m-%d %H:%M:%S %z', tz);
    }
    if (v instanceof Range) { return v.a + '..' + v.b; }
    if (Array.isArray(v) || isHash(v)) { return inspect(v); }
    return String(v);
  }
  function outputToS(v, tz) {
    if (Array.isArray(v)) { return v.map(function (x) { return outputToS(x, tz); }).join(''); }
    return toS(v, tz);
  }
  function toNumber(v) {
    if (typeof v === 'number') { return v; }
    if (typeof v === 'string') {
      var s = v.trim();
      if (/^-?\d+\.\d+$/.test(s)) { return parseFloat(s); }
      var m = /^\s*[+-]?\d+/.exec(v.replace(/_/g, ''));
      return m ? parseInt(m[0], 10) : 0;
    }
    return 0;
  }
  function isEmptyVal(v) {
    if (typeof v === 'string' || Array.isArray(v)) { return v.length === 0; }
    if (isHash(v)) { return Object.keys(v).length === 0; }
    return false;
  }
  function truthy(v) { return !(v === null || v === undefined || v === false); }

  /* Ruby String#split */
  function rubySplit(str, pat) {
    var out;
    if (pat === ' ') {
      out = str.trim().split(/\s+/);
      if (out.length === 1 && out[0] === '') { out = []; }
    } else if (pat === '') {
      out = str.split('');
    } else {
      out = str.split(pat);
    }
    while (out.length && out[out.length - 1] === '') { out.pop(); }
    return out;
  }

  /* ---------- Lexer for tag and output markup ---------- */
  var TOKEN_RE = /\s*(?:("[^"]*"|'[^']*')|(-?\d+(?:\.\d+)?)(?![\w])|(==|!=|<>|<=|>=|<|>)|(\.\.)|([|:,=\[\]().])|([A-Za-z_][\w-]*\??))/y;
  function lex(src) {
    var toks = [], m;
    TOKEN_RE.lastIndex = 0;
    var pos = 0;
    while (pos < src.length) {
      TOKEN_RE.lastIndex = pos;
      m = TOKEN_RE.exec(src);
      if (!m || m[0].length === 0) {
        if (/^\s*$/.test(src.slice(pos))) { break; }
        throw new Error('Liquid syntax error near: ' + src.slice(pos, pos + 30));
      }
      pos = TOKEN_RE.lastIndex;
      if (m[1] !== undefined) { toks.push({ t: 'str', v: m[1].slice(1, -1) }); }
      else if (m[2] !== undefined) { toks.push({ t: 'num', v: m[2].indexOf('.') >= 0 ? parseFloat(m[2]) : parseInt(m[2], 10) }); }
      else if (m[3] !== undefined) { toks.push({ t: 'cmp', v: m[3] }); }
      else if (m[4] !== undefined) { toks.push({ t: 'dotdot', v: '..' }); }
      else if (m[5] !== undefined) { toks.push({ t: m[5], v: m[5] }); }
      else if (m[6] !== undefined) { toks.push({ t: 'id', v: m[6] }); }
    }
    return toks;
  }

  function Parser(toks) { this.toks = toks; this.i = 0; }
  Parser.prototype.peek = function (o) { return this.toks[this.i + (o || 0)]; };
  Parser.prototype.next = function () { return this.toks[this.i++]; };
  Parser.prototype.eof = function () { return this.i >= this.toks.length; };
  Parser.prototype.accept = function (t, v) {
    var k = this.peek();
    if (k && k.t === t && (v === undefined || k.v === v)) { this.i++; return k; }
    return null;
  };
  Parser.prototype.expect = function (t, v) {
    var k = this.accept(t, v);
    if (!k) { throw new Error('Liquid syntax error: expected ' + (v || t)); }
    return k;
  };
  /* primary expression */
  Parser.prototype.expr = function () {
    var k = this.next();
    if (!k) { throw new Error('Liquid syntax error: missing expression'); }
    if (k.t === 'str') { return { k: 'lit', v: k.v }; }
    if (k.t === 'num') { return { k: 'lit', v: k.v }; }
    if (k.t === '(') {
      var a = this.expr();
      this.expect('dotdot');
      var b = this.expr();
      this.expect(')');
      return { k: 'range', a: a, b: b };
    }
    if (k.t === '[') {
      /* [ "key" ] at the start of a lookup */
      var first = this.expr();
      this.expect(']');
      return this.path({ k: 'var', root: first, dyn: true, segs: [] });
    }
    if (k.t === 'id') {
      switch (k.v) {
        case 'true': return { k: 'lit', v: true };
        case 'false': return { k: 'lit', v: false };
        case 'nil': case 'null': return { k: 'lit', v: null };
        case 'empty': return { k: 'lit', v: EMPTY };
        case 'blank': return { k: 'lit', v: BLANK };
      }
      return this.path({ k: 'var', root: k.v, segs: [] });
    }
    throw new Error('Liquid syntax error near ' + k.v);
  };
  Parser.prototype.path = function (node) {
    for (;;) {
      if (this.accept('.')) {
        var id = this.next();
        if (!id || (id.t !== 'id' && id.t !== 'num')) { throw new Error('Liquid syntax error after "."'); }
        node.segs.push({ k: 'lit', v: String(id.v) });
      } else if (this.peek() && this.peek().t === '[') {
        this.next();
        node.segs.push(this.expr());
        this.expect(']');
      } else { break; }
    }
    return node;
  };
  /* expression with filters */
  Parser.prototype.filtered = function () {
    var base = this.expr();
    var filters = [];
    while (this.accept('|')) {
      var name = this.expect('id').v;
      var args = [], kw = {};
      if (this.accept(':')) {
        do {
          if (this.peek() && this.peek().t === 'id' && this.peek(1) && this.peek(1).t === ':') {
            var kn = this.next().v; this.next();
            kw[kn] = this.expr();
          } else {
            args.push(this.expr());
          }
        } while (this.accept(','));
      }
      filters.push({ name: name, args: args, kw: kw });
    }
    return { base: base, filters: filters };
  };
  /* condition: a op b [and|or ...] */
  Parser.prototype.condition = function () {
    var items = [], ops = [];
    for (;;) {
      var left = this.expr();
      var cmp = null, right = null;
      var k = this.peek();
      if (k && (k.t === 'cmp' || (k.t === 'id' && k.v === 'contains'))) {
        this.next(); cmp = k.v; right = this.expr();
      }
      items.push({ left: left, op: cmp, right: right });
      var j = this.peek();
      if (j && j.t === 'id' && (j.v === 'and' || j.v === 'or')) { this.next(); ops.push(j.v); continue; }
      break;
    }
    return { items: items, ops: ops };
  };

  /* ---------- Template parsing ---------- */
  var SPLIT_RE = /(\{%-?[\s\S]*?-?%\}|\{\{-?[\s\S]*?-?\}\})/;

  function tokenize(src) {
    var raw = src.split(SPLIT_RE);
    var toks = [];
    for (var i = 0; i < raw.length; i++) {
      var s = raw[i];
      if (s === '') { continue; }
      if (s.indexOf('{%') === 0) {
        var lt = s.charAt(2) === '-', rt = s.charAt(s.length - 3) === '-';
        var inner = s.slice(lt ? 3 : 2, rt ? -3 : -2).trim();
        var mm = /^(\w+)\s*([\s\S]*)$/.exec(inner) || [null, '', ''];
        toks.push({ t: 'tag', name: mm[1], markup: mm[2], lt: lt, rt: rt, src: s });
      } else if (s.indexOf('{{') === 0) {
        var lt2 = s.charAt(2) === '-', rt2 = s.charAt(s.length - 3) === '-';
        toks.push({ t: 'out', markup: s.slice(lt2 ? 3 : 2, rt2 ? -3 : -2).trim(), lt: lt2, rt: rt2 });
      } else {
        toks.push({ t: 'text', v: s });
      }
    }
    /* whitespace control */
    for (var j = 0; j < toks.length; j++) {
      var tk = toks[j];
      if (tk.t === 'text') { continue; }
      if (tk.lt && j > 0 && toks[j - 1].t === 'text') { toks[j - 1].v = toks[j - 1].v.replace(/\s+$/, ''); }
      if (tk.rt && j + 1 < toks.length && toks[j + 1].t === 'text') { toks[j + 1].v = toks[j + 1].v.replace(/^\s+/, ''); }
    }
    return toks;
  }

  function parseTemplate(src) {
    var toks = tokenize(src);
    var pos = 0;

    /* blank: Liquid 4 drops the output of a block whose bodies hold only whitespace and assign/capture/comment tags. */
    function parseBody(stops) {
      var nodes = [], blank = true;
      while (pos < toks.length) {
        var tk = toks[pos];
        if (tk.t === 'text') { nodes.push({ k: 'text', v: tk.v }); blank = blank && /^\s*$/.test(tk.v); pos++; continue; }
        if (tk.t === 'out') { nodes.push({ k: 'out', f: new Parser(lex(tk.markup)).filtered() }); blank = false; pos++; continue; }
        if (stops && stops.indexOf(tk.name) >= 0) { return { nodes: nodes, stop: tk, blank: blank }; }
        pos++;
        var node = parseTag(tk);
        blank = blank && !!node.blank;
        nodes.push(node);
      }
      if (stops) { throw new Error('Liquid syntax error: missing {% ' + stops[stops.length - 1] + ' %}'); }
      return { nodes: nodes, stop: null, blank: blank };
    }

    function skipRawUntil(endName, nestName) {
      var depth = 1, buf = '';
      while (pos < toks.length) {
        var tk = toks[pos++];
        if (tk.t === 'tag' && nestName && tk.name === nestName) { depth++; }
        if (tk.t === 'tag' && tk.name === endName) { depth--; if (depth === 0) { return buf; } }
        buf += tk.t === 'text' ? tk.v : (tk.src || ('{{' + tk.markup + '}}'));
      }
      throw new Error('Liquid syntax error: missing {% ' + endName + ' %}');
    }

    function parseTag(tk) {
      var p, r, node;
      switch (tk.name) {
        case 'assign': {
          var am = /^([\w-]+)\s*=\s*([\s\S]*)$/.exec(tk.markup);
          if (!am) { throw new Error('Liquid syntax error in assign: ' + tk.markup); }
          return { k: 'assign', blank: true, name: am[1], f: new Parser(lex(am[2])).filtered() };
        }
        case 'capture': {
          var name = tk.markup.trim().replace(/^['"]|['"]$/g, '');
          r = parseBody(['endcapture']); pos++;
          return { k: 'capture', blank: true, name: name, body: r.nodes };
        }
        case 'if': case 'unless': {
          node = { k: 'if', neg: tk.name === 'unless', branches: [], elseBody: null, block: true, blank: true };
          var cond = new Parser(lex(tk.markup)).condition();
          var endName = 'end' + tk.name;
          for (;;) {
            r = parseBody(['elsif', 'else', endName]);
            node.branches.push({ cond: cond, body: r.nodes });
            node.blank = node.blank && r.blank;
            pos++;
            if (r.stop.name === 'elsif') { cond = new Parser(lex(r.stop.markup)).condition(); continue; }
            if (r.stop.name === 'else') {
              var r2 = parseBody([endName]); pos++;
              node.elseBody = r2.nodes;
              node.blank = node.blank && r2.blank;
            }
            break;
          }
          return node;
        }
        case 'case': {
          node = { k: 'case', subject: new Parser(lex(tk.markup)).expr(), whens: [], elseBody: null, block: true };
          r = parseBody(['when', 'else', 'endcase']); pos++;
          node.blank = r.blank;
          var stop = r.stop;
          while (stop.name !== 'endcase') {
            if (stop.name === 'when') {
              p = new Parser(lex(stop.markup));
              var vals = [p.expr()];
              while (p.accept(',') || p.accept('id', 'or')) { vals.push(p.expr()); }
              r = parseBody(['when', 'else', 'endcase']); pos++;
              node.whens.push({ vals: vals, body: r.nodes });
              node.blank = node.blank && r.blank;
              stop = r.stop;
            } else {
              r = parseBody(['endcase']); pos++;
              node.elseBody = r.nodes;
              node.blank = node.blank && r.blank;
              stop = r.stop;
            }
          }
          return node;
        }
        case 'for': {
          p = new Parser(lex(tk.markup));
          var v = p.expect('id').v;
          p.expect('id', 'in');
          node = { k: 'for', v: v, coll: p.expr(), reversed: false, limit: null, offset: null, body: null, elseBody: null, block: true };
          while (!p.eof()) {
            var a = p.next();
            if (a.t === 'id' && a.v === 'reversed') { node.reversed = true; }
            else if (a.t === 'id' && (a.v === 'limit' || a.v === 'offset')) { p.expect(':'); node[a.v] = p.expr(); }
            else if (a.t === ',') { continue; }
          }
          r = parseBody(['else', 'endfor']); pos++;
          node.body = r.nodes;
          node.blank = r.blank;
          if (r.stop.name === 'else') { var r3 = parseBody(['endfor']); pos++; node.elseBody = r3.nodes; node.blank = node.blank && r3.blank; }
          return node;
        }
        case 'break': return { k: 'break' };
        case 'continue': return { k: 'continue' };
        case 'comment': skipRawUntil('endcomment', 'comment'); return { k: 'noop', blank: true };
        case 'raw': { var rv = skipRawUntil('endraw', null); return { k: 'text', v: rv, blank: rv === '' }; }
        case 'include': {
          var im = /^(\{\{[\s\S]*?\}\}|"[^"]*"|'[^']*'|[^\s]+)\s*([\s\S]*)$/.exec(tk.markup.trim());
          var params = [];
          var pre = /([\w-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s]+)/g, pm;
          while ((pm = pre.exec(im[2] || '')) !== null) { params.push({ name: pm[1], e: new Parser(lex(pm[2])).expr() }); }
          return { k: 'include', file: im[1].replace(/^['"]|['"]$/g, ''), params: params };
        }
        case 'increment': case 'decrement':
          return { k: tk.name, name: tk.markup.trim() };
        default:
          throw new Error('Liquid: unknown tag {% ' + tk.name + ' %}');
      }
    }

    return parseBody(null).nodes;
  }

  /* ---------- Rendering ---------- */
  function BreakSignal(kind) { this.kind = kind; }

  function DodLiquid(opts) {
    opts = opts || {};
    this.tz = opts.timezone || 'UTC';
    this.baseurl = opts.baseurl || '';
    this.siteurl = opts.siteurl || '';
    this.includes = opts.includes || {};
    this.cache = {};
    this.errors = [];
    this.filters = makeFilters(this);
  }
  DodLiquid.time = function (ms, offsetMin) { return new LTime(ms, offsetMin === undefined ? null : offsetMin, 'time'); };
  DodLiquid.dateOnly = function (y, m, d) { return new LTime(Date.UTC(y, m - 1, d), 0, 'date'); };
  DodLiquid.LTime = LTime;
  DodLiquid.toS = toS;
  /* A YAML timestamp string -> LTime, the way Psych reads unquoted timestamps. Returns null if not a timestamp. */
  DodLiquid.fromYamlTimestamp = function (s, tz) {
    if (typeof s !== 'string') { return null; }
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (m) { return DodLiquid.dateOnly(+m[1], +m[2], +m[3]); }
    m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[Tt]|[ \t]+)(\d{1,2}):(\d{2}):(\d{2})(\.\d*)?(?:[ \t]*(Z|[-+]\d{1,2}(?::?\d{2})?))?$/.exec(s);
    if (!m) { return null; }
    var frac = m[7] ? Math.round(parseFloat(m[7]) * 1000) : 0;
    if (!m[8]) { return new LTime(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) + frac, 0); } /* Psych reads a time with no zone as UTC */
    var off = 0;
    if (m[8] !== 'Z' && m[8] !== 'z') {
      var om = /^([-+])(\d{1,2})(?::?(\d{2}))?$/.exec(m[8]);
      off = (om[1] === '-' ? -1 : 1) * (parseInt(om[2], 10) * 60 + parseInt(om[3] || '0', 10));
    }
    return new LTime(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) + frac - off * 60000, off);
  };

  DodLiquid.prototype.parse = function (src) {
    if (!this.cache[src]) { this.cache[src] = parseTemplate(src); }
    return this.cache[src];
  };

  DodLiquid.prototype.render = function (src, vars) {
    this.errors = [];
    var ctx = { scopes: [vars || {}], counters: {} };
    return this.renderNodes(this.parse(src), ctx);
  };

  DodLiquid.prototype.lookupRoot = function (ctx, name) {
    for (var i = ctx.scopes.length - 1; i >= 0; i--) {
      if (Object.prototype.hasOwnProperty.call(ctx.scopes[i], name)) { return ctx.scopes[i][name]; }
    }
    return null;
  };

  function getProp(obj, key) {
    if (obj === null || obj === undefined) { return null; }
    if (Array.isArray(obj)) {
      if (typeof key === 'number') { var idx = key < 0 ? obj.length + key : key; return idx >= 0 && idx < obj.length ? obj[idx] : null; }
      if (key === 'size') { return obj.length; }
      if (key === 'first') { return obj.length ? obj[0] : null; }
      if (key === 'last') { return obj.length ? obj[obj.length - 1] : null; }
      return null;
    }
    if (obj instanceof Range) { return getProp(obj.toArray(), key); }
    if (typeof obj === 'string') { return key === 'size' ? obj.length : null; }
    if (isHash(obj)) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) { var v = obj[key]; return v === undefined ? null : v; }
      if (key === 'size') { return Object.keys(obj).length; }
      if (key === 'first') { var ks = Object.keys(obj); return ks.length ? [ks[0], obj[ks[0]]] : null; }
      return null;
    }
    return null;
  }

  DodLiquid.prototype.evalExpr = function (e, ctx) {
    if (e.k === 'lit') { return e.v; }
    if (e.k === 'range') { return new Range(toNumber(this.evalExpr(e.a, ctx)), toNumber(this.evalExpr(e.b, ctx))); }
    var obj = e.dyn ? this.lookupRoot(ctx, toS(this.evalExpr(e.root, ctx))) : this.lookupRoot(ctx, e.root);
    for (var i = 0; i < e.segs.length; i++) {
      var key = this.evalExpr(e.segs[i], ctx);
      obj = getProp(obj, key);
    }
    return obj === undefined ? null : obj;
  };

  DodLiquid.prototype.evalFiltered = function (f, ctx) {
    var v = this.evalExpr(f.base, ctx);
    for (var i = 0; i < f.filters.length; i++) {
      var fl = f.filters[i];
      var fn = this.filters[fl.name];
      var args = fl.args.map(function (a) { return this.evalExpr(a, ctx); }, this);
      if (!fn) { this.errors.push('Unknown filter: ' + fl.name); continue; }
      v = fn.apply(null, [v].concat(args));
    }
    return v === undefined ? null : v;
  };

  function equalVals(a, b) {
    if (b instanceof EmptyLit || b instanceof BlankLit) { var t = a; a = b; b = t; }
    if (a instanceof EmptyLit) { return b !== null && b !== undefined && isEmptyVal(b) && typeof b !== 'number'; }
    if (a instanceof BlankLit) { return b === null || b === undefined || b === false || (typeof b === 'string' ? /^\s*$/.test(b) : isEmptyVal(b)); }
    if (a === null || a === undefined) { return b === null || b === undefined; }
    if (b === null || b === undefined) { return false; }
    if (a instanceof LTime && b instanceof LTime) { return a.ms === b.ms; }
    if (typeof a !== typeof b) { return false; }
    if (Array.isArray(a)) { return Array.isArray(b) && a.length === b.length && a.every(function (x, i) { return equalVals(x, b[i]); }); }
    if (isHash(a)) { return JSON.stringify(a) === JSON.stringify(b); }
    return a === b;
  }

  DodLiquid.prototype.evalCond = function (c, ctx) {
    var self = this;
    function one(it) {
      var l = self.evalExpr(it.left, ctx);
      if (!it.op) { return l; }
      var r = self.evalExpr(it.right, ctx);
      switch (it.op) {
        case '==': return equalVals(l, r);
        case '!=': case '<>': return !equalVals(l, r);
        case 'contains':
          if (truthy(l) && truthy(r)) {
            if (typeof l === 'string') { return l.indexOf(toS(r)) >= 0; }
            if (Array.isArray(l)) { return l.some(function (x) { return equalVals(x, r); }); }
            if (isHash(l)) { return Object.prototype.hasOwnProperty.call(l, r); }
          }
          return false;
        default: {
          if (l === null || l === undefined || r === null || r === undefined || isHash(l) || isHash(r) || typeof l === 'boolean' || typeof r === 'boolean') { return null; }
          if (l instanceof LTime) { l = l.ms; } if (r instanceof LTime) { r = r.ms; }
          if (typeof l !== typeof r) { self.errors.push('Liquid error: comparison of ' + typeof l + ' with ' + typeof r + ' failed'); return null; }
          switch (it.op) {
            case '<': return l < r; case '>': return l > r; case '<=': return l <= r; case '>=': return l >= r;
          }
        }
      }
      return null;
    }
    /* Liquid chains right to left: a and b or c == a and (b or c) */
    var n = c.items.length;
    var res = one(c.items[n - 1]);
    for (var i = n - 2; i >= 0; i--) {
      var op = c.ops[i];
      var left = one(c.items[i]);
      res = op === 'and' ? (truthy(left) ? res : left) : (truthy(left) ? left : res);
    }
    return truthy(res);
  };

  DodLiquid.prototype.renderNodes = function (nodes, ctx) {
    var out = '';
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var piece = this.renderNode(n, ctx);
      if (!(n.block && n.blank)) { out += piece; }
    }
    return out;
  };

  /* One node. Blocks whose bodies are blank still run (for their assigns), but renderNodes drops their output. */
  DodLiquid.prototype.renderNode = function (n, ctx) {
    var out = '';
    switch (n.k) {
        case 'text': out += n.v; break;
        case 'noop': break;
        case 'out': out += outputToS(this.evalFiltered(n.f, ctx), this.tz); break;
        case 'assign': ctx.scopes[0][n.name] = this.evalFiltered(n.f, ctx); break;
        case 'capture': ctx.scopes[0][n.name] = this.renderNodes(n.body, ctx); break;
        case 'if': {
          var done = false;
          for (var b = 0; b < n.branches.length; b++) {
            var ok = this.evalCond(n.branches[b].cond, ctx);
            if (n.neg && b === 0) { ok = !ok; }
            if (ok) { out += this.renderNodes(n.branches[b].body, ctx); done = true; break; }
          }
          if (!done && n.elseBody) { out += this.renderNodes(n.elseBody, ctx); }
          break;
        }
        case 'case': {
          var subj = this.evalExpr(n.subject, ctx), hit = false;
          for (var w = 0; w < n.whens.length; w++) {
            var wh = n.whens[w];
            if (wh.vals.some(function (ve) { return equalVals(subj, this.evalExpr(ve, ctx)); }, this)) { out += this.renderNodes(wh.body, ctx); hit = true; }
          }
          if (!hit && n.elseBody) { out += this.renderNodes(n.elseBody, ctx); }
          break;
        }
        case 'for': out += this.renderFor(n, ctx); break;
        case 'break': throw new BreakSignal('break');
        case 'continue': throw new BreakSignal('continue');
        case 'include': out += this.renderInclude(n, ctx); break;
        case 'increment': {
          var cv = ctx.counters[n.name] || 0; out += String(cv); ctx.counters[n.name] = cv + 1; break;
        }
        case 'decrement': {
          var dv = (ctx.counters[n.name] || 0) - 1; ctx.counters[n.name] = dv; out += String(dv); break;
        }
    }
    return out;
  };

  DodLiquid.prototype.renderFor = function (n, ctx) {
    var coll = this.evalExpr(n.coll, ctx);
    var items;
    if (coll instanceof Range) { items = coll.toArray(); }
    else if (Array.isArray(coll)) { items = coll.slice(); }
    else if (isHash(coll)) { items = Object.keys(coll).map(function (k) { return [k, coll[k]]; }); }
    else if (typeof coll === 'string' && coll !== '') { items = [coll]; }
    else { items = []; }
    var offset = n.offset ? toNumber(this.evalExpr(n.offset, ctx)) : 0;
    var limit = n.limit ? toNumber(this.evalExpr(n.limit, ctx)) : null;
    items = items.slice(offset, limit === null ? undefined : offset + limit);
    if (n.reversed) { items.reverse(); }
    if (!items.length) { return n.elseBody ? this.renderNodes(n.elseBody, ctx) : ''; }
    var out = '';
    var scope = {};
    ctx.scopes.push(scope);
    try {
      for (var i = 0; i < items.length; i++) {
        scope[n.v] = items[i];
        scope.forloop = { name: n.v, length: items.length, index: i + 1, index0: i, rindex: items.length - i, rindex0: items.length - i - 1, first: i === 0, last: i === items.length - 1 };
        try { out += this.renderNodes(n.body, ctx); }
        catch (sig) {
          if (!(sig instanceof BreakSignal)) { throw sig; }
          if (sig.kind === 'break') { break; }
        }
      }
    } finally { ctx.scopes.pop(); }
    return out;
  };

  DodLiquid.prototype.renderInclude = function (n, ctx) {
    var file = n.file;
    if (/^\{\{/.test(file)) { file = toS(this.evalFiltered(new Parser(lex(file.slice(2, -2).trim())).filtered(), ctx)); }
    var src = this.includes[file];
    if (src === undefined || src === null) { this.errors.push('Include not available in preview: ' + file); return ''; }
    if (typeof src === 'function') { src = src(); }
    var inc = {};
    n.params.forEach(function (p) { inc[p.name] = this.evalExpr(p.e, ctx); }, this);
    ctx.scopes.push({ include: inc });
    try { return this.renderNodes(this.parse(src), ctx); }
    finally { ctx.scopes.pop(); }
  };

  /* ---------- Filters (Liquid 4 standard + the Jekyll ones the site uses) ---------- */
  function htmlEscape(s) { return toS(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

  function makeFilters(eng) {
    function toDate(v) {
      if (v instanceof LTime) { return v; }
      if (v === null || v === undefined) { return null; }
      if (typeof v === 'number') { return new LTime(Math.floor(v) * 1000, null); }
      if (typeof v === 'string') {
        if (v === '') { return null; }
        var low = v.toLowerCase();
        if (low === 'now' || low === 'today') { return eng.now ? eng.now() : new LTime(Date.now(), null); }
        if (/^\d+$/.test(low)) { return new LTime(parseInt(low, 10) * 1000, null); }
        return parseTimeString(v.trim());
      }
      return null;
    }
    /* Ruby Time.parse for the date shapes event files use. Local times are in the site time zone.
       Like Ruby: 03/05/2027 is 3 May (day first), "31st May 2026", "Jan 10, 2026", "May 2027". */
    var MON3 = MONTHS.map(function (x) { return x.slice(0, 3).toLowerCase(); });
    function monthIndex(w) { var i = MON3.indexOf(String(w).slice(0, 3).toLowerCase()); return i < 0 ? -1 : i + 1; }
    function parseTimeString(s) {
      var y, mo, d, h = 0, mi = 0, se = 0, off = null, m;
      var rest = s.replace(/^(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*\.?,?\s*/i, '');
      /* time and zone at the end */
      var tm = /(?:^|[\sT])(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*([AaPp]\.?[Mm]\.?)?\s*(Z|UTC|GMT|[-+]?\d{2}:?\d{2})?\s*$/.exec(rest);
      if (tm) {
        h = +tm[1]; mi = +tm[2]; se = +(tm[3] || 0);
        if (tm[4]) { var pm = /^p/i.test(tm[4]); if (h > 12) { return null; } if (pm && h < 12) { h += 12; } if (!pm && h === 12) { h = 0; } }
        if (tm[5]) { if (/^(Z|UTC|GMT)$/i.test(tm[5])) { off = 0; } else { var om = /^([-+]?)(\d{2}):?(\d{2})$/.exec(tm[5]); off = (om[1] === '-' ? -1 : 1) * (+om[2] * 60 + +om[3]); } }
        rest = rest.slice(0, tm.index).trim();
      }
      if ((m = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/.exec(rest))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
      else if ((m = /^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/.exec(rest))) { d = +m[1]; mo = +m[2]; y = +m[3]; }
      else if ((m = /^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]+)\.?,?[\s-]+(\d{4})$/.exec(rest)) && monthIndex(m[2]) > 0) { d = +m[1]; mo = monthIndex(m[2]); y = +m[3]; }
      else if ((m = /^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/.exec(rest)) && monthIndex(m[1]) > 0) { mo = monthIndex(m[1]); d = +m[2]; y = +m[3]; }
      else if ((m = /^([A-Za-z]+)\.?,?\s+(\d{4})$/.exec(rest)) && monthIndex(m[1]) > 0) { mo = monthIndex(m[1]); d = 1; y = +m[2]; }
      else { return null; }
      var probe = new Date(Date.UTC(y, mo - 1, d));
      if (mo < 1 || mo > 12 || d < 1 || probe.getUTCDate() !== d || h > 23 || mi > 59 || se > 60) { return null; }
      if (off === null) { return new LTime(zonedToMs(y, mo, d, h, mi, se, eng.tz), null); }
      return new LTime(Date.UTC(y, mo - 1, d, h, mi, se) - off * 60000, off);
    }
    function strArg(a) { return toS(a, eng.tz); }
    function num(a) { return toNumber(a); }
    function mathOut(a, b, r) { return (Number.isInteger(a) && Number.isInteger(b)) ? Math.trunc(r) : r; }
    function prop(item, p) { return getProp(item, p); }

    return {
      default: function (v, d) { if (d === undefined) { d = ''; } return (!truthy(v) || isEmptyVal(v)) ? d : v; },
      size: function (v) { if (typeof v === 'string' || Array.isArray(v)) { return v.length; } if (isHash(v)) { return Object.keys(v).length; } return 0; },
      downcase: function (v) { return strArg(v).toLowerCase(); },
      upcase: function (v) { return strArg(v).toUpperCase(); },
      capitalize: function (v) { var s = strArg(v); return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); },
      strip: function (v) { return strArg(v).trim(); },
      lstrip: function (v) { return strArg(v).replace(/^\s+/, ''); },
      rstrip: function (v) { return strArg(v).replace(/\s+$/, ''); },
      split: function (v, p) { return rubySplit(strArg(v), strArg(p)); },
      join: function (v, sep) { if (sep === undefined) { sep = ' '; } return Array.isArray(v) ? v.map(strArg).join(strArg(sep)) : strArg(v); },
      first: function (v) { return Array.isArray(v) ? (v.length ? v[0] : null) : (isHash(v) ? getProp(v, 'first') : null); },
      last: function (v) { return Array.isArray(v) ? (v.length ? v[v.length - 1] : null) : null; },
      append: function (v, s) { return strArg(v) + strArg(s); },
      prepend: function (v, s) { return strArg(s) + strArg(v); },
      remove: function (v, s) { return strArg(v).split(strArg(s)).join(''); },
      remove_first: function (v, s) { return strArg(v).replace(strArg(s), ''); },
      replace: function (v, a, b) { return strArg(v).split(strArg(a)).join(strArg(b)); },
      replace_first: function (v, a, b) { return strArg(v).replace(strArg(a), function () { return strArg(b); }); },
      plus: function (a, b) { a = num(a); b = num(b); return mathOut(a, b, a + b); },
      minus: function (a, b) { a = num(a); b = num(b); return mathOut(a, b, a - b); },
      times: function (a, b) { a = num(a); b = num(b); return mathOut(a, b, a * b); },
      divided_by: function (a, b) { a = num(a); b = num(b); if (b === 0) { eng.errors.push('Liquid error: divided by 0'); return null; } return Number.isInteger(a) && Number.isInteger(b) ? Math.floor(a / b) : a / b; },
      modulo: function (a, b) { a = num(a); b = num(b); return b === 0 ? null : ((a % b) + b) % b; },
      abs: function (a) { return Math.abs(num(a)); },
      ceil: function (a) { return Math.ceil(num(a)); },
      floor: function (a) { return Math.floor(num(a)); },
      round: function (a, d) { var p = Math.pow(10, d ? num(d) : 0); return Math.round(num(a) * p) / p; },
      date: function (v, fmt) {
        if (fmt === undefined || fmt === null || strArg(fmt) === '') { return v; }
        var d = toDate(v);
        return d ? strftime(d, strArg(fmt), eng.tz) : v;
      },
      date_to_long_string: function (v) { var d = toDate(v); return d ? strftime(d, '%d %B %Y', eng.tz) : v; },
      date_to_string: function (v) { var d = toDate(v); return d ? strftime(d, '%d %b %Y', eng.tz) : v; },
      date_to_xmlschema: function (v) { var d = toDate(v); return d ? strftime(d, '%Y-%m-%dT%H:%M:%S', eng.tz) + offStr(parts(d, eng.tz).off, true) : v; },
      escape: function (v) { return v === null || v === undefined ? v : htmlEscape(v); },
      escape_once: function (v) { return htmlEscape(strArg(v).replace(/&(amp|lt|gt|quot|#39);/g, function (m, e) { return { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[e]; })); },
      xml_escape: function (v) { return v === null || v === undefined ? '' : strArg(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); },
      strip_html: function (v) { return strArg(v).replace(/<script[\s\S]*?<\/script>|<!--[\s\S]*?-->|<style[\s\S]*?<\/style>/gi, '').replace(/<[\s\S]*?>/g, ''); },
      strip_newlines: function (v) { return strArg(v).replace(/\r?\n/g, ''); },
      newline_to_br: function (v) { return strArg(v).replace(/\r?\n/g, '<br />\n'); },
      truncate: function (v, n, e) { var s = strArg(v); n = n === undefined ? 50 : num(n); e = e === undefined ? '...' : strArg(e); if (s.length <= n) { return s; } var l = Math.max(0, n - e.length); return s.slice(0, l) + e; },
      truncatewords: function (v, n, e) { var w = strArg(v).split(/\s+/).filter(Boolean); n = n === undefined ? 15 : Math.max(1, num(n)); e = e === undefined ? '...' : strArg(e); return w.length > n ? w.slice(0, n).join(' ') + e : strArg(v); },
      url_encode: function (v) { return v === null || v === undefined ? v : encodeURIComponent(strArg(v)).replace(/%20/g, '+'); },
      slice: function (v, s, l) { s = num(s); l = l === undefined ? 1 : num(l); if (Array.isArray(v)) { return v.slice(s < 0 ? v.length + s : s, (s < 0 ? v.length + s : s) + l); } var st = strArg(v); var b = s < 0 ? st.length + s : s; return st.substr(b, l); },
      reverse: function (v) { return Array.isArray(v) ? v.slice().reverse() : v; },
      compact: function (v, p) { return Array.isArray(v) ? v.filter(function (x) { return truthy(p ? prop(x, strArg(p)) : x); }) : v; },
      uniq: function (v) { if (!Array.isArray(v)) { return v; } var seen = []; return v.filter(function (x) { var k = JSON.stringify(x); if (seen.indexOf(k) >= 0) { return false; } seen.push(k); return true; }); },
      map: function (v, p) { return Array.isArray(v) ? v.map(function (x) { return prop(x, strArg(p)); }) : prop(v, strArg(p)); },
      sort: function (v, p) { if (!Array.isArray(v)) { return v; } var a = v.slice(); a.sort(function (x, y) { if (p !== undefined) { x = prop(x, strArg(p)); y = prop(y, strArg(p)); } if (x === y) { return 0; } if (x === null || x === undefined) { return 1; } if (y === null || y === undefined) { return -1; } return x < y ? -1 : 1; }); return a; },
      where: function (v, p, val) { if (!Array.isArray(v)) { return v; } return v.filter(function (x) { var pv = prop(x, strArg(p)); return val === undefined ? truthy(pv) : toS(pv) === toS(val); }); },
      group_by: function (v, p) {
        if (!Array.isArray(v)) { return []; }
        var groups = [], index = {};
        v.forEach(function (x) {
          var key = toS(prop(x, strArg(p)), eng.tz);
          if (!Object.prototype.hasOwnProperty.call(index, key)) { index[key] = groups.length; groups.push({ name: key, items: [], size: 0 }); }
          var g = groups[index[key]]; g.items.push(x); g.size = g.items.length;
        });
        return groups;
      },
      jsonify: function (v) { return JSON.stringify(v === undefined ? null : v, function (k, x) { return x instanceof LTime ? toS(x, eng.tz) : x; }); },
      relative_url: function (v) { var s = strArg(v); if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.indexOf('//') === 0) { return s; } var b = eng.baseurl.replace(/\/$/, ''); return b + (s.charAt(0) === '/' ? '' : '/') + s; },
      absolute_url: function (v) { var s = strArg(v); if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.indexOf('//') === 0) { return s; } var b = (eng.siteurl + eng.baseurl).replace(/\/$/, ''); return b + (s.charAt(0) === '/' ? '' : '/') + s; },
      markdownify: function (v) { return strArg(v); },
      slugify: function (v) { return strArg(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); },
      number_of_words: function (v) { return strArg(v).split(/\s+/).filter(Boolean).length; },
      array_to_sentence_string: function (v, c) { if (!Array.isArray(v)) { return v; } c = c === undefined ? 'and' : strArg(c); if (v.length < 2) { return v.map(strArg).join(''); } if (v.length === 2) { return strArg(v[0]) + ' ' + c + ' ' + strArg(v[1]); } return v.slice(0, -1).map(strArg).join(', ') + ', ' + c + ' ' + strArg(v[v.length - 1]); },
      inspect: function (v) { return inspect(v); }
    };
  }

  global.DodLiquid = DodLiquid;
  if (typeof module !== 'undefined' && module.exports) { module.exports = DodLiquid; }
})(typeof window !== 'undefined' ? window : globalThis);
