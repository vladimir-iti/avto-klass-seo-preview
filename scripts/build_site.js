#!/usr/bin/env node
'use strict';

/**
 * Собирает статический хаб для просмотра серии статей «Права тракториста»
 * целиком — все 30 статей сразу, включая те, что на боевом сайте ещё
 * не вышли, — и страницу отчёта о серии.
 *
 * Это не боевой сайт и не публикация на нём. Все страницы закрыты
 * от поисковиков (noindex): тексты должны впервые появиться в поиске
 * на avtoklass-perm.ru, в день выхода по расписанию.
 *
 *   node preview/scripts/build_site.js
 *   python3 preview/scripts/check_site.py
 *
 * Markdown переводится в HTML тем же конвертером, что и на сайте
 * (site/scripts/blog-bundle.js), — статьи здесь выглядят так же.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CONTENT = path.join(ROOT, 'content-strategy');
const DRAFTS = path.join(CONTENT, 'drafts');
const QUEUE = path.join(ROOT, 'site', 'blog', 'queue.json');
const IMAGES = path.join(ROOT, 'site', 'src', 'images', 'blog');
const OUT = path.join(ROOT, 'preview', 'docs');

const PRODUCTION = 'https://avtoklass-perm.ru';

const { markdownToHtml, parseDraft } = require(path.join(ROOT, 'site', 'scripts', 'blog-bundle.js'));

const CLUSTERS = [
  { key: 'A', label: 'Категории и допуск' },
  { key: 'B', label: 'Обучение и экзамен' },
  { key: 'C', label: 'Техника и ответственность' },
  { key: 'D', label: 'Пермский край' },
];

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля',
  'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function humanDate(publishAt) {
  const [d, t] = publishAt.split(' ');
  const [y, m, day] = d.split('-').map(Number);
  return `${day} ${MONTHS[m - 1]} ${y}, ${t}`;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function page({ title, description, depth, content }) {
  const up = '../'.repeat(depth);
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="noindex, nofollow">
<link rel="stylesheet" href="${up}assets/style.css">
</head>
<body>
<div class="preview-banner">Предпросмотр серии — не боевой сайт. На <a href="${PRODUCTION}/blog/">avtoklass-perm.ru</a> статьи выходят по расписанию.</div>
<header class="site-header">
<div class="wrap">
<a class="home-link" href="${up}index.html">Авто-Класс — серия статей «Права тракториста» (предпросмотр)</a>
</div>
</header>
<main class="wrap">
${content}
</main>
<footer class="site-footer wrap">
<p>Отдельный хаб для просмотра серии из 30 статей целиком. Это не боевой сайт и не публикация на нём.</p>
</footer>
</body>
</html>
`;
}

/** Ссылки черновика: статьи серии — внутри хаба, остальное — на боевой сайт. */
function rewriteLinks(html, slugs) {
  return html
    .replace(/href="\/blog\/([a-z0-9-]+)\/"/g, (m, slug) =>
      slugs.has(slug) ? `href="../${slug}/index.html"` : `href="${PRODUCTION}/blog/${slug}/"`)
    .replace(/href="\/images\/blog\/([^"]+)"/g, 'href="../../assets/images/$1"')
    .replace(/href="(\/[^"]*)"/g, (m, p) => `href="${PRODUCTION}${p}" target="_blank" rel="noopener"`)
    .replace(/src="\/images\/blog\/([^"]+)"/g, 'src="../../assets/images/$1"');
}

function makeToc(html) {
  const heads = [...html.matchAll(/<h2>(.*?)<\/h2>/g)];
  if (heads.length < 4) return { html, toc: '' };
  let i = 0;
  const items = [];
  const out = html.replace(/<h2>(.*?)<\/h2>/g, (m, text) => {
    const id = `sec-${i++}`;
    items.push(`<li><a href="#${id}">${text.replace(/<[^>]+>/g, '')}</a></li>`);
    return `<h2 id="${id}">${text}</h2>`;
  });
  return {
    html: out,
    toc: `<nav class="toc" aria-label="Оглавление"><p class="toc-title">Оглавление</p><ol>${items.join('')}</ol></nav>`,
  };
}

/** В отчёте коды статей (A2, B10) — ссылки с заголовками: владельцу коды ничего не говорят. */
function linkIds(html, byId) {
  const idRe = /\b([A-D](?:[1-9]|10))\b/g;
  const repl = (m, id) => {
    const a = byId[id];
    return a ? `<a href="../articles/${a.slug}/index.html">«${esc(a.h1)}»</a>` : m;
  };
  const out = [];
  let pos = 0;
  for (const m of html.matchAll(/<code\b[\s\S]*?<\/code>|<a\b[\s\S]*?<\/a>|<[^>]+>/g)) {
    out.push(html.slice(pos, m.index).replace(idRe, repl), m[0]);
    pos = m.index + m[0].length;
  }
  out.push(html.slice(pos).replace(idRe, repl));
  return out.join('');
}

function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'assets', 'images'), { recursive: true });

  const queue = JSON.parse(fs.readFileSync(QUEUE, 'utf8'));
  const slugs = new Set(queue.articles.map((a) => a.slug));
  const byId = {};
  const usedImages = new Set();

  for (const entry of queue.articles) {
    const { meta, body } = parseDraft(fs.readFileSync(path.join(DRAFTS, entry.source), 'utf8'), entry.source);
    const images = [];
    let html = markdownToHtml(body, (src, alt) => {
      const name = src.replace(/^\/images\/blog\//, '');
      images.push(name);
      usedImages.add(name);
      const img = `<img src="${src}" alt="${esc(alt)}" loading="lazy" decoding="async">`;
      if (!name.endsWith('.svg')) return `<figure>${img}</figure>`;
      // Схемы открываются крупно по клику — тем же скриптом, что на сайте.
      return `<figure><a class="scheme-zoom" href="${src}" target="_blank" rel="noopener" ` +
        `aria-label="Открыть схему крупно: ${esc(alt)}">${img}` +
        '<span class="scheme-zoom__hint" aria-hidden="true">Увеличить</span></a></figure>';
    });
    html = rewriteLinks(html, slugs);
    const { html: withIds, toc } = makeToc(html);

    const article = Object.assign({}, entry, meta, { images });
    byId[entry.id] = article;

    const cluster = CLUSTERS.find((c) => c.key === entry.id[0]);
    const content =
      `<p class="breadcrumb"><a href="../../index.html">Все статьи</a> · ` +
      `<a href="../../index.html#cluster-${cluster.key.toLowerCase()}">${cluster.label}</a></p>` +
      `<article><h1>${esc(meta.h1)}</h1>` +
      `<p class="lede">${esc(meta.description)}</p>` +
      `<p class="breadcrumb">На сайте: ${humanDate(entry.publish_at)} (по Перми) — ` +
      `<a href="${PRODUCTION}/blog/${entry.slug}/">${PRODUCTION.replace('https://', '')}/blog/${entry.slug}/</a></p>` +
      toc + withIds + '</article>';

    const dir = path.join(OUT, 'articles', entry.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), page({
      title: `${meta.title} — Авто-Класс (предпросмотр)`,
      description: meta.description,
      depth: 2,
      content,
    }).replace('</body>', '<script src="../../assets/blog.js" defer></script>\n</body>'));
  }

  // --- главная хаба ---
  let content = '<h1>Предпросмотр серии статей «Права тракториста»</h1>' +
    `<p class="lede">${queue.articles.length} статей, сгруппированы по разделам. Отдельный хаб для просмотра ` +
    'серии целиком — не боевой сайт и не индексируется поисковиками.</p>' +
    '<a class="report-callout" href="report/index.html">' +
    '<span class="report-callout-label">Отчёт о серии статей</span>' +
    '<span class="report-callout-desc">Как устроена серия, на каких документах стоят её факты ' +
    'и как статьи выходят на сайте — понятными словами.</span></a>' +
    '<nav class="quicknav" aria-label="Разделы"><p class="quicknav-title">Разделы</p><ul class="quicknav-list">' +
    CLUSTERS.map((c) => `<li><a href="#cluster-${c.key.toLowerCase()}">${c.label}</a></li>`).join('') +
    '</ul></nav>';

  for (const c of CLUSTERS) {
    const items = queue.articles.filter((a) => a.id[0] === c.key).map((a) => byId[a.id]);
    content += `<section class="cluster" id="cluster-${c.key.toLowerCase()}"><h2>${c.label}</h2><ul class="article-list">`;
    for (const a of items) {
      const photo = a.images.find((i) => !i.endsWith('.svg')) || a.images[0];
      const thumb = photo
        ? `<a class="thumb-link" href="articles/${a.slug}/index.html"><img class="thumb" src="assets/images/${photo}" alt="" loading="lazy" decoding="async"></a>`
        : '';
      content += `<li>${thumb}<div class="article-list-text"><a href="articles/${a.slug}/index.html">${esc(a.h1)}</a>` +
        `<p class="desc">${esc(a.description)}</p>` +
        `<p class="desc">На сайте: ${humanDate(a.publish_at)}</p></div></li>`;
    }
    content += '</ul></section>';
  }

  fs.writeFileSync(path.join(OUT, 'index.html'), page({
    title: 'Предпросмотр серии статей «Права тракториста» — Авто-Класс',
    description: 'Хаб для просмотра 30 статей серии целиком.',
    depth: 0,
    content,
  }));

  // --- отчёт ---
  const reportMd = fs.readFileSync(path.join(CONTENT, 'report_content.md'), 'utf8');
  const h1 = (reportMd.match(/^# (.+)$/m) || [])[1] || 'Отчёт о серии статей';
  let reportHtml = markdownToHtml(reportMd.replace(/^# .+\n/m, ''), () => '');
  reportHtml = linkIds(reportHtml, byId);
  const { html: reportWithIds, toc: reportToc } = makeToc(reportHtml);
  fs.mkdirSync(path.join(OUT, 'report'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'report', 'index.html'), page({
    title: 'Отчёт о серии статей — Авто-Класс (предпросмотр)',
    description: 'Что сделано в серии из 30 статей и на чём стоят её факты.',
    depth: 1,
    content: '<p class="breadcrumb"><a href="../index.html">Все статьи</a> · Отчёт</p>' +
      `<article><h1>${esc(h1)}</h1>${reportToc}${reportWithIds}</article>`,
  }));

  // --- статика ---
  for (const name of usedImages) fs.copyFileSync(path.join(IMAGES, name), path.join(OUT, 'assets', 'images', name));
  fs.copyFileSync(path.join(__dirname, 'style.css'), path.join(OUT, 'assets', 'style.css'));
  fs.copyFileSync(path.join(ROOT, 'site', 'src', 'js', 'blog.js'), path.join(OUT, 'assets', 'blog.js'));
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
  fs.writeFileSync(path.join(OUT, '404.html'), page({
    title: 'Страница не найдена — Авто-Класс (предпросмотр)',
    description: 'Страница не найдена.',
    depth: 0,
    content: '<h1>Страница не найдена</h1><p><a href="index.html">Вернуться к списку статей</a></p>',
  }));

  console.log(`Собрано статей: ${queue.articles.length}, картинок: ${usedImages.size} → ${path.relative(ROOT, OUT)}/`);
}

main();
