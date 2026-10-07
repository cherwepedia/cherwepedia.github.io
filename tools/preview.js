'use strict';
/**
 * Локальный предпросмотр без Ruby: приближённо повторяет сборку Jekyll.
 *   node tools/preview.js            — собрать в _preview/ и запустить на http://localhost:4000
 *   node tools/preview.js --demo     — добавить демо-статьи из tools/demo-posts
 *   node tools/preview.js --build    — только собрать
 * Зависимости: npm i js-yaml marked
 * Настоящая сборка делается Jekyll'ом на GitHub Pages; это лишь быстрый просмотр дизайна.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const yaml = require('js-yaml');
const { marked } = require('marked');
const { Engine } = require('./liquid-lite');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '_preview');
const args = process.argv.slice(2);
const DEMO = args.includes('--demo');
const BUILD_ONLY = args.includes('--build');
const PORT = parseInt((args.find(a => a.startsWith('--port=')) || '--port=4000').split('=')[1], 10);

const read = (p) => fs.readFileSync(p, 'utf8');

function frontMatter(src) {
  const m = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/.exec(src);
  if (!m) return null;
  return { data: yaml.load(m[1]) || {}, body: m[2] };
}

const config = yaml.load(read(path.join(ROOT, '_config.yml')));
config.time = new Date();
config.baseurl = config.baseurl || '';
if (!args.includes('--real-url')) config.url = `http://localhost:${PORT}`;

const dataDir = path.join(ROOT, '_data');
const dataObj = {};
for (const f of fs.readdirSync(dataDir)) {
  if (/\.ya?ml$/.test(f)) dataObj[f.replace(/\.ya?ml$/, '')] = yaml.load(read(path.join(dataDir, f)));
}
config.data = dataObj;

marked.setOptions({ gfm: true, breaks: false });
function slugId(text) {
  return text.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/g, '').replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s+/g, '-');
}
function markdownify(s) {
  let html = marked.parse(s);
  html = html.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (m, l, t) => `<h${l} id="${slugId(t)}">${t}</h${l}>`);
  return html;
}

const engine = new Engine({
  site: config,
  markdownify,
  includes: (name) => read(path.join(ROOT, '_includes', name)),
});

function pageScope(extra) {
  return Object.assign({ site: config, jekyll: { environment: 'development' } }, extra);
}

function slugFromFile(file) {
  return file.replace(/\.(md|markdown|html)$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '');
}

/* ---------------- Посты ---------------- */
function loadPosts() {
  const dirs = [path.join(ROOT, '_posts')];
  if (DEMO) dirs.push(path.join(ROOT, 'tools', 'demo-posts'));
  const posts = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.md'))) {
      const fm = frontMatter(read(path.join(dir, f)));
      if (!fm) continue;
      const d = Object.assign({}, fm.data);
      const dm = /^(\d{4}-\d{2}-\d{2})-/.exec(f);
      d.date = d.date instanceof Date ? d.date : new Date(d.date || (dm && dm[1]) || Date.now());
      d.categories = Array.isArray(d.categories) ? d.categories : d.categories ? [d.categories] : [];
      const slug = slugFromFile(f);
      d.url = '/' + [...d.categories, slug].join('/') + '/';
      d.layout = d.layout || 'post';
      d._body = fm.body;
      d.path = f;
      posts.push(d);
    }
  }
  posts.sort((a, b) => b.date - a.date);
  return posts;
}

const posts = loadPosts();
config.posts = posts;

const cats = [];
for (const f of fs.readdirSync(path.join(ROOT, '_cats'))) {
  const fm = frontMatter(read(path.join(ROOT, '_cats', f)));
  const d = Object.assign({}, fm.data, { layout: 'category' });
  d.url = d.permalink;
  d._body = fm.body;
  cats.push(d);
}
config.cats = cats;

/* ---------------- Рендер ---------------- */
function renderBody(doc, isMd) {
  const nodes = engine.compile(doc._body, doc.path || doc.url);
  const html = engine.render(nodes, pageScope({ page: doc }));
  return isMd ? markdownify(html) : html;
}

for (const p of posts) {
  p.content = renderBody(p, true);
  const m = /<p>[\s\S]*?<\/p>/.exec(p.content);
  p.excerpt = m ? m[0] : '';
}
for (const c of cats) c.content = renderBody(c, true);

function layoutChain(doc, content) {
  let name = doc.layout;
  let html = content;
  while (name && name !== 'null' && name !== 'none') {
    const src = read(path.join(ROOT, '_layouts', name + '.html'));
    const fm = frontMatter(src);
    const body = fm ? fm.body : src;
    const nodes = engine.compile(body, 'layout:' + name);
    html = engine.render(nodes, pageScope({ page: doc, content: html }));
    name = fm && fm.data.layout;
  }
  return html;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

function outPath(url) {
  const clean = decodeURIComponent(url);
  if (clean.endsWith('/')) return path.join(OUT, clean, 'index.html');
  return path.join(OUT, clean);
}
function write(url, html) {
  const p = outPath(url);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, html);
}

for (const p of posts) write(p.url, layoutChain(p, p.content));
for (const c of cats) write(c.url, layoutChain(c, c.content));

const SKIP = new Set(['node_modules', 'tools', '.github', '_preview', '_site', 'Gemfile', 'README.md', 'package.json', 'package-lock.json']);
function walk(dir, rel) {
  for (const f of fs.readdirSync(dir)) {
    if (SKIP.has(f) || f.startsWith('_') || f.startsWith('.')) continue;
    const full = path.join(dir, f), r = rel ? rel + '/' + f : f;
    if (fs.statSync(full).isDirectory()) { walk(full, r); continue; }
    const buf = fs.readFileSync(full);
    const isText = /\.(html|xml|json|txt|md)$/i.test(f) || f === 'robots.txt';
    const fm = isText ? frontMatter(buf.toString('utf8')) : null;
    if (!fm) {
      const dest = path.join(OUT, r);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(full, dest);
      continue;
    }
    const d = Object.assign({}, fm.data);
    d._body = fm.body; d.path = r;
    let url = d.permalink || '/' + r;
    if (!d.permalink && /index\.html$/.test(r)) url = '/' + r.replace(/index\.html$/, '');
    d.url = url;
    const html = renderBody(d, /\.md$/.test(f));
    const layoutName = d.layout;
    const finalHtml = layoutName ? layoutChain(d, html) : html;
    write(url, finalHtml);
  }
}
walk(ROOT, '');

// проверки целостности
const problems = [];
for (const p of posts) if (!p.title) problems.push('нет title: ' + p.path);
console.log(`Собрано: ${posts.length} статей, ${cats.length} страниц рубрик → ${path.relative(process.cwd(), OUT)}`);
if (problems.length) console.log('Замечания:\n' + problems.join('\n'));

if (!BUILD_ONLY) {
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.xml': 'application/xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
  http.createServer((req, res) => {
    let u = decodeURIComponent(req.url.split('?')[0]);
    let f = path.join(OUT, u);
    if (!f.startsWith(OUT)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { f = path.join(OUT, '404.html'); res.statusCode = 404; }
    res.setHeader('Content-Type', types[path.extname(f)] || 'application/octet-stream');
    fs.createReadStream(f).pipe(res);
  }).listen(PORT, () => console.log(`Предпросмотр: http://localhost:${PORT}`));
}
