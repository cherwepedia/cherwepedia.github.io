'use strict';
/**
 * Мини-реализация Liquid (подмножество, которое используют шаблоны этого сайта).
 * Нужна только для локального предпросмотра без Ruby/Jekyll. Реальная сборка — Jekyll на GitHub Pages.
 */

const NIL = null;

class Engine {
  constructor(opts) {
    this.opts = opts; // { includes: (name)=>string, site, markdownify }
    this.cache = new Map();
  }

  /* ------------------------------ tokenizer ------------------------------ */
  tokenize(src) {
    const re = /(\{\{-?[\s\S]*?-?\}\}|\{%-?[\s\S]*?-?%\})/g;
    const parts = src.split(re);
    const tokens = [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p) continue;
      if (i % 2 === 0) { tokens.push({ t: 'text', v: p }); continue; }
      if (p.startsWith('{{')) {
        const trimL = p[2] === '-', trimR = p[p.length - 3] === '-';
        tokens.push({ t: 'out', v: p.slice(2 + (trimL ? 1 : 0), p.length - 2 - (trimR ? 1 : 0)).trim(), trimL, trimR });
      } else {
        const trimL = p[2] === '-', trimR = p[p.length - 3] === '-';
        tokens.push({ t: 'tag', v: p.slice(2 + (trimL ? 1 : 0), p.length - 2 - (trimR ? 1 : 0)).trim(), trimL, trimR });
      }
    }
    // whitespace control
    for (let i = 0; i < tokens.length; i++) {
      const k = tokens[i];
      if (k.t === 'text') continue;
      if (k.trimL && tokens[i - 1] && tokens[i - 1].t === 'text') tokens[i - 1].v = tokens[i - 1].v.replace(/\s+$/, '');
      if (k.trimR && tokens[i + 1] && tokens[i + 1].t === 'text') tokens[i + 1].v = tokens[i + 1].v.replace(/^\s+/, '');
    }
    return tokens.filter(k => !(k.t === 'text' && k.v === ''));
  }

  /* -------------------------------- parser ------------------------------- */
  parse(src, name) {
    const tokens = this.tokenize(src);
    let pos = 0;
    const parseBlock = (stopTags) => {
      const nodes = [];
      while (pos < tokens.length) {
        const k = tokens[pos];
        if (k.t === 'text') { nodes.push({ type: 'text', v: k.v }); pos++; continue; }
        if (k.t === 'out') { nodes.push({ type: 'out', expr: k.v, src: name }); pos++; continue; }
        const m = /^(\w+)\s*([\s\S]*)$/.exec(k.v);
        const tag = m ? m[1] : '';
        const rest = m ? m[2] : '';
        if (stopTags && stopTags.includes(tag)) return { nodes, stop: tag, rest };
        pos++;
        switch (tag) {
          case 'comment': {
            let depth = 1;
            while (pos < tokens.length) {
              const t = tokens[pos++];
              if (t.t === 'tag') {
                if (/^comment\b/.test(t.v)) depth++;
                else if (/^endcomment\b/.test(t.v)) { if (--depth === 0) break; }
              }
            }
            break;
          }
          case 'raw': {
            let txt = '';
            while (pos < tokens.length) {
              const t = tokens[pos++];
              if (t.t === 'tag' && /^endraw\b/.test(t.v)) break;
              txt += t.t === 'text' ? t.v : t.t === 'out' ? '{{' + t.v + '}}' : '{%' + t.v + '%}';
            }
            nodes.push({ type: 'text', v: txt });
            break;
          }
          case 'assign': {
            const mm = /^([\w.-]+)\s*=\s*([\s\S]+)$/.exec(rest);
            if (!mm) throw new Error(`assign syntax in ${name}: ${k.v}`);
            nodes.push({ type: 'assign', name: mm[1], expr: mm[2] });
            break;
          }
          case 'capture': {
            const r = parseBlock(['endcapture']); pos++;
            nodes.push({ type: 'capture', name: rest.trim(), body: r.nodes });
            break;
          }
          case 'if': case 'unless': {
            const branches = [];
            let cond = rest;
            let els = null;
            for (;;) {
              const r = parseBlock(['elsif', 'else', 'endif', 'endunless']);
              branches.push({ cond, body: r.nodes });
              pos++;
              if (r.stop === 'elsif') { cond = r.rest; continue; }
              if (r.stop === 'else') {
                const r2 = parseBlock(['endif', 'endunless']); pos++;
                els = r2.nodes;
              }
              break;
            }
            nodes.push({ type: tag, branches, els });
            break;
          }
          case 'for': {
            const mm = /^(\w+)\s+in\s+(.+?)((?:\s+(?:limit|offset)\s*:\s*[^\s]+|\s+reversed)*)\s*$/.exec(rest);
            if (!mm) throw new Error(`for syntax in ${name}: ${k.v}`);
            const opts = {};
            (mm[3] || '').replace(/(limit|offset)\s*:\s*([^\s]+)/g, (_, a, b) => { opts[a] = b; });
            opts.reversed = /\breversed\b/.test(mm[3] || '');
            const r = parseBlock(['else', 'endfor']);
            let els = null;
            pos++;
            if (r.stop === 'else') { const r2 = parseBlock(['endfor']); pos++; els = r2.nodes; }
            nodes.push({ type: 'for', v: mm[1], coll: mm[2], opts, body: r.nodes, els });
            break;
          }
          case 'include': {
            const mm = /^([^\s]+)([\s\S]*)$/.exec(rest);
            const params = [];
            (mm[2] || '').replace(/([\w-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s%]+)/g, (_, a, b) => { params.push([a, b]); });
            nodes.push({ type: 'include', file: mm[1].replace(/^["']|["']$/g, ''), params });
            break;
          }
          default:
            throw new Error(`Unknown tag "${tag}" in ${name}`);
        }
      }
      return { nodes, stop: null };
    };
    return parseBlock(null).nodes;
  }

  compile(src, name) {
    return this.parse(src, name);
  }

  /* ------------------------------- renderer ------------------------------ */
  render(nodes, scope) {
    const ctx = { scopes: [scope] };
    return this.run(nodes, ctx);
  }

  run(nodes, ctx) {
    let out = '';
    for (const n of nodes) {
      switch (n.type) {
        case 'text': out += n.v; break;
        case 'out': out += this.toStr(this.evalExpr(n.expr, ctx, n.src)); break;
        case 'assign': ctx.scopes[0][n.name] = this.evalExpr(n.expr, ctx); break;
        case 'capture': ctx.scopes[0][n.name] = this.run(n.body, ctx); break;
        case 'if': case 'unless': {
          let done = false;
          for (let i = 0; i < n.branches.length; i++) {
            let c = this.evalCond(n.branches[i].cond, ctx);
            if (n.type === 'unless' && i === 0) c = !c;
            if (c) { out += this.run(n.branches[i].body, ctx); done = true; break; }
          }
          if (!done && n.els) out += this.run(n.els, ctx);
          break;
        }
        case 'for': {
          let arr = this.evalExpr(n.coll, ctx);
          if (arr && !Array.isArray(arr) && typeof arr === 'object') arr = Object.values(arr);
          if (!Array.isArray(arr)) arr = [];
          arr = arr.slice();
          const off = n.opts.offset ? Number(this.evalExpr(n.opts.offset, ctx)) : 0;
          if (off) arr = arr.slice(off);
          if (n.opts.limit) arr = arr.slice(0, Number(this.evalExpr(n.opts.limit, ctx)));
          if (n.opts.reversed) arr.reverse();
          if (!arr.length) { if (n.els) out += this.run(n.els, ctx); break; }
          const len = arr.length;
          for (let i = 0; i < len; i++) {
            const loopScope = {
              [n.v]: arr[i],
              forloop: { index: i + 1, index0: i, rindex: len - i, rindex0: len - i - 1, first: i === 0, last: i === len - 1, length: len },
            };
            ctx.scopes.push(loopScope);
            out += this.run(n.body, ctx);
            ctx.scopes.pop();
          }
          break;
        }
        case 'include': {
          const params = {};
          for (const [k, v] of n.params) params[k] = this.evalExpr(v, ctx);
          let nodes2 = this.cache.get(n.file);
          if (!nodes2) {
            const src = this.opts.includes(n.file);
            nodes2 = this.compile(src, n.file);
            this.cache.set(n.file, nodes2);
          }
          ctx.scopes.push({ include: params });
          out += this.run(nodes2, ctx);
          ctx.scopes.pop();
          break;
        }
        default: throw new Error('bad node ' + n.type);
      }
    }
    return out;
  }

  /* ------------------------------ expressions ---------------------------- */
  splitTop(str, sepRe) {
    // делит строку по разделителю вне кавычек
    const out = []; let cur = ''; let q = null;
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (q) { cur += c; if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; cur += c; continue; }
      const m = sepRe.exec(str.slice(i));
      if (m && m.index === 0 && m[0].length) { out.push(cur); cur = ''; i += m[0].length - 1; continue; }
      cur += c;
    }
    out.push(cur);
    return out;
  }

  evalExpr(expr, ctx) {
    const segs = this.splitTop(expr, /^\|(?!\|)/);
    let val = this.evalAtom(segs[0].trim(), ctx);
    for (let i = 1; i < segs.length; i++) {
      const s = segs[i].trim();
      const m = /^(\w+)\s*(?::\s*([\s\S]*))?$/.exec(s);
      if (!m) throw new Error('bad filter: ' + s);
      const args = m[2] ? this.splitTop(m[2], /^,/).map(a => this.evalAtom(a.trim(), ctx)) : [];
      val = this.applyFilter(m[1], val, args, ctx);
    }
    return val;
  }

  evalAtom(s, ctx) {
    s = s.trim();
    if (s === '') return NIL;
    if (/^'.*'$/s.test(s) || /^".*"$/s.test(s)) return s.slice(1, -1);
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s === 'nil' || s === 'null') return NIL;
    if (s === 'empty' || s === 'blank') return { __empty: true };
    return this.lookup(s, ctx);
  }

  lookup(path, ctx) {
    // разбор a.b[0].c["x"]
    const re = /([^.\[\]]+)|\[(?:"([^"]*)"|'([^']*)'|([^\]]+))\]/g;
    const parts = [];
    let m;
    let first = true;
    while ((m = re.exec(path))) {
      if (m[1] !== undefined) parts.push({ k: m[1].trim(), lit: true });
      else if (m[2] !== undefined) parts.push({ k: m[2], lit: true });
      else if (m[3] !== undefined) parts.push({ k: m[3], lit: true });
      else parts.push({ k: m[4], lit: false });
    }
    let cur;
    for (let i = 0; i < parts.length; i++) {
      let key = parts[i].k;
      if (!parts[i].lit) key = this.evalAtom(key, ctx);
      if (i === 0) {
        cur = undefined;
        for (let s = ctx.scopes.length - 1; s >= 0; s--) {
          if (Object.prototype.hasOwnProperty.call(ctx.scopes[s], key)) { cur = ctx.scopes[s][key]; break; }
        }
        if (cur === undefined) cur = NIL;
        continue;
      }
      cur = this.prop(cur, key);
    }
    return cur === undefined ? NIL : cur;
  }

  prop(obj, key) {
    if (obj === NIL || obj === undefined) return NIL;
    if (key === 'size') {
      if (Array.isArray(obj) || typeof obj === 'string') return obj.length;
      if (typeof obj === 'object') return Object.keys(obj).length;
    }
    if (Array.isArray(obj)) {
      if (key === 'first') return obj[0] === undefined ? NIL : obj[0];
      if (key === 'last') return obj.length ? obj[obj.length - 1] : NIL;
      if (typeof key === 'number' || /^-?\d+$/.test(String(key))) { const v = obj[Number(key)]; return v === undefined ? NIL : v; }
      return NIL;
    }
    if (typeof obj === 'string') {
      if (key === 'first') return obj[0] || NIL;
      if (key === 'last') return obj.slice(-1) || NIL;
      return NIL;
    }
    if (typeof obj === 'object') { const v = obj[key]; return v === undefined ? NIL : v; }
    return NIL;
  }

  truthy(v) { return !(v === NIL || v === undefined || v === false); }

  evalCond(cond, ctx) {
    // Liquid: and/or вычисляются справа налево без приоритетов
    const parts = [];
    const ops = [];
    let cur = ''; let q = null;
    const s = cond.trim();
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { cur += c; if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; cur += c; continue; }
      const m = /^\s+(and|or)\s+/.exec(s.slice(i));
      if (m) { parts.push(cur); ops.push(m[1]); cur = ''; i += m[0].length - 1; continue; }
      cur += c;
    }
    parts.push(cur);
    let result = this.evalCompare(parts[parts.length - 1], ctx);
    for (let i = parts.length - 2; i >= 0; i--) {
      const left = this.evalCompare(parts[i], ctx);
      result = ops[i] === 'and' ? (left && result) : (left || result);
    }
    return result;
  }

  evalCompare(s, ctx) {
    s = s.trim();
    const m = /^([\s\S]+?)\s+(==|!=|<>|<=|>=|<|>|contains)\s+([\s\S]+)$/.exec(s);
    if (!m) return this.truthy(this.evalExpr(s, ctx));
    const a = this.evalExpr(m[1], ctx), b = this.evalExpr(m[3], ctx);
    switch (m[2]) {
      case '==': return this.eq(a, b);
      case '!=': case '<>': return !this.eq(a, b);
      case '<': return a !== NIL && b !== NIL && a < b;
      case '>': return a !== NIL && b !== NIL && a > b;
      case '<=': return a !== NIL && b !== NIL && a <= b;
      case '>=': return a !== NIL && b !== NIL && a >= b;
      case 'contains':
        if (Array.isArray(a)) return a.includes(b);
        if (typeof a === 'string') return b !== NIL && a.includes(String(b));
        return false;
    }
    return false;
  }

  eq(a, b) {
    if (b && b.__empty) return a === NIL || a === '' || (Array.isArray(a) && !a.length);
    if (a && a.__empty) return b === NIL || b === '' || (Array.isArray(b) && !b.length);
    if (a === undefined) a = NIL; if (b === undefined) b = NIL;
    return a === b;
  }

  toStr(v) {
    if (v === NIL || v === undefined) return '';
    if (Array.isArray(v)) return v.map(x => this.toStr(x)).join('');
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  /* -------------------------------- filters ------------------------------ */
  applyFilter(name, v, args, ctx) {
    const S = (x) => this.toStr(x);
    const site = this.opts.site;
    const isEmpty = (x) => x === NIL || x === undefined || x === false || x === '' || (Array.isArray(x) && x.length === 0);
    const arg = (i) => args[i];
    switch (name) {
      case 'default': return isEmpty(v) ? arg(0) : v;
      case 'escape': return S(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      case 'escape_once': return S(v).replace(/&(?!#?\w+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      case 'xml_escape': return S(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      case 'strip_html': return S(v).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, '');
      case 'strip_newlines': return S(v).replace(/\r?\n/g, '');
      case 'normalize_whitespace': return S(v).replace(/\s+/g, ' ');
      case 'strip': return S(v).trim();
      case 'lstrip': return S(v).replace(/^\s+/, '');
      case 'rstrip': return S(v).replace(/\s+$/, '');
      case 'downcase': return S(v).toLowerCase();
      case 'upcase': return S(v).toUpperCase();
      case 'capitalize': { const s = S(v); return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); }
      case 'append': return S(v) + S(arg(0));
      case 'prepend': return S(arg(0)) + S(v);
      case 'replace': return S(v).split(S(arg(0))).join(S(arg(1)));
      case 'remove': return S(v).split(S(arg(0))).join('');
      case 'split': { const s = S(v); const sep = S(arg(0)); if (s === '') return []; const r = sep === '' ? s.split('') : s.split(sep); while (r.length && r[r.length - 1] === '') r.pop(); return r; }
      case 'join': return (Array.isArray(v) ? v : []).map(S).join(arg(0) === undefined ? ' ' : S(arg(0)));
      case 'size': return v === NIL ? 0 : (Array.isArray(v) || typeof v === 'string') ? v.length : typeof v === 'object' ? Object.keys(v).length : 0;
      case 'first': return Array.isArray(v) ? (v.length ? v[0] : NIL) : NIL;
      case 'last': return Array.isArray(v) ? (v.length ? v[v.length - 1] : NIL) : NIL;
      case 'reverse': return Array.isArray(v) ? v.slice().reverse() : v;
      case 'slice': { const s = typeof v === 'string' || !Array.isArray(v) ? S(v) : v; let st = Number(arg(0)); const len = arg(1) === undefined ? 1 : Number(arg(1)); if (st < 0) st = s.length + st; return Array.isArray(s) ? s.slice(st, st + len) : s.substr(st, len); }
      case 'truncate': { const n = Number(arg(0)); const el = arg(1) === undefined ? '...' : S(arg(1)); const s = S(v); if (s.length <= n) return s; return s.slice(0, Math.max(0, n - el.length)) + el; }
      case 'truncatewords': { const n = Number(arg(0)); const el = arg(1) === undefined ? '...' : S(arg(1)); const w = S(v).trim().split(/\s+/); return w.length <= n ? w.join(' ') : w.slice(0, n).join(' ') + el; }
      case 'number_of_words': { const t = S(v).trim(); return t ? t.split(/\s+/).length : 0; }
      case 'plus': return Number(v) + Number(arg(0));
      case 'minus': return Number(v) - Number(arg(0));
      case 'times': return Number(v) * Number(arg(0));
      case 'divided_by': return Math.floor(Number(v) / Number(arg(0)));
      case 'modulo': return Number(v) % Number(arg(0));
      case 'jsonify': return JSON.stringify(v === undefined ? NIL : v);
      case 'markdownify': return this.opts.markdownify(S(v));
      case 'relative_url': { const s = S(v); const b = site.baseurl || ''; return b + (s.startsWith('/') ? s : '/' + s); }
      case 'absolute_url': { const s = S(v); const b = site.baseurl || ''; return site.url + b + (s.startsWith('/') ? s : '/' + s); }
      case 'uri_escape': { const s = S(v); try { return encodeURI(decodeURI(s)); } catch (e) { return encodeURI(s); } }
      case 'date': return this.date(v, S(arg(0)));
      case 'date_to_xmlschema': return this.date(v, '%Y-%m-%dT%H:%M:%S+00:00');
      case 'date_to_string': return this.date(v, '%d %b %Y');
      case 'where': {
        const key = S(arg(0)), want = arg(1);
        return (Array.isArray(v) ? v : []).filter(it => {
          const val = it && typeof it === 'object' ? it[key] : undefined;
          if (Array.isArray(val)) return val.includes(want);
          return val === want || (want === true && val === true);
        });
      }
      case 'where_exp': {
        const varName = S(arg(0)), expr = S(arg(1));
        return (Array.isArray(v) ? v : []).filter(it => {
          ctx.scopes.push({ [varName]: it });
          const r = this.evalCond(expr, ctx);
          ctx.scopes.pop();
          return r;
        });
      }
      case 'sort': { const key = arg(0); return (Array.isArray(v) ? v.slice() : []).sort((a, b) => { const x = key ? a[key] : a, y = key ? b[key] : b; return x < y ? -1 : x > y ? 1 : 0; }); }
      case 'uniq': return Array.isArray(v) ? [...new Set(v)] : v;
      case 'concat': return (Array.isArray(v) ? v : []).concat(arg(0) || []);
      default: throw new Error('Unknown filter: ' + name);
    }
  }

  date(v, fmt) {
    let d;
    if (v === 'now' || v === 'today') d = new Date();
    else if (v instanceof Date) d = v;
    else if (v === NIL || v === undefined || v === '') return '';
    else d = new Date(v);
    if (isNaN(d)) return '';
    const p2 = (n) => String(n).padStart(2, '0');
    const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return fmt.replace(/%([YmdHMSsbBy%e])/g, (_, c) => {
      switch (c) {
        case 'Y': return d.getUTCFullYear();
        case 'y': return p2(d.getUTCFullYear() % 100);
        case 'm': return p2(d.getUTCMonth() + 1);
        case 'd': return p2(d.getUTCDate());
        case 'e': return String(d.getUTCDate());
        case 'H': return p2(d.getUTCHours());
        case 'M': return p2(d.getUTCMinutes());
        case 'S': return p2(d.getUTCSeconds());
        case 's': return String(Math.floor(d.getTime() / 1000));
        case 'b': case 'B': return mon[d.getUTCMonth()];
        case '%': return '%';
      }
    });
  }
}

module.exports = { Engine };
