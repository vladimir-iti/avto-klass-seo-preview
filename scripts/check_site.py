#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Проверка собранного preview-сайта: битые ссылки, изображения, утечки служебного."""

import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BUILD = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "docs"))
CONTENT = os.path.join(ROOT, "content-strategy")


# Коды, совпадающие с настоящими терминами темы.
LEGIT_TERMS = {"A1"}


def all_html_files():
    for root, _, files in os.walk(BUILD):
        for f in files:
            if f.endswith(".html"):
                yield os.path.join(root, f)


def check():
    problems = []
    checked_links = 0
    checked_images = 0
    total_pages = 0

    for path in all_html_files():
        total_pages += 1
        html = open(path, encoding="utf-8").read()
        page_dir = os.path.dirname(path)

        # утечка служебного блока черновика: в черновиках он начинается
        # заголовком «## Служебный блок ...», то есть в HTML — <h2>Служебный блок
        # Простое упоминание словосочетания в тексте (отчёт объясняет, что это
        # такое) утечкой не является.
        if re.search(r"<h[1-6][^>]*>\s*Служебный блок", html, re.I):
            problems.append("SERVICE BLOCK LEAK: %s" % path)

        if 'name="robots"' not in html or "noindex" not in html:
            problems.append("MISSING noindex ROBOTS META: %s" % path)

        # bare technical ids visible as text (not inside href attribute values,
        # no leading zero — real ids are A1..D9 and B10)
        # <code> вырезаем целиком: там технические токены (H1, Title) —
        # намеренный термин разметки, а не утёкший идентификатор статьи
        visible_text = re.sub(r"<code\b.*?</code>", " ", html, flags=re.S | re.I)
        visible_text = re.sub(r"<[^>]+>", " ", visible_text)
        for m in re.finditer(r"\b([A-D](?:[1-9]|10))\b", visible_text):
            # A1 — ещё и мотоциклетная категория водительских прав: в статьях
            # серии это термин, а не код статьи.
            if m.group(1) in LEGIT_TERMS and "/articles/" in path:
                continue
            problems.append("BARE ID VISIBLE: %s -> %r context: %r" % (
                path, m.group(1), visible_text[max(0, m.start() - 40):m.start() + 10]))

        for href in re.findall(r'href="([^"]+)"', html):
            if href.startswith(("http://", "https://", "mailto:", "#")):
                continue
            checked_links += 1
            target = os.path.normpath(os.path.join(page_dir, href.split("#")[0]))
            if not os.path.isfile(target):
                problems.append("BROKEN LINK: %s -> %s (resolved: %s)" % (path, href, target))

        for src in re.findall(r'src="([^"]+)"', html):
            if src.startswith(("http://", "https://")):
                continue
            checked_images += 1
            target = os.path.normpath(os.path.join(page_dir, src))
            if not os.path.isfile(target):
                problems.append("BROKEN IMAGE: %s -> %s (resolved: %s)" % (path, src, target))

    # утечка служебных файлов пайплайна в собранный результат
    forbidden_names = ("strategy.json", "pipeline.json", "content-strategy")
    for root, dirs, files in os.walk(BUILD):
        for f in files:
            if f in forbidden_names:
                problems.append("PIPELINE STATE FILE LEAKED: %s" % os.path.join(root, f))
        for d in list(dirs):
            if d in forbidden_names:
                problems.append("PIPELINE STATE DIR LEAKED: %s" % os.path.join(root, d))

    # sitemap / robots.txt (если есть) не должны ссылаться на служебные пути
    for name in ("sitemap.xml", "robots.txt"):
        p = os.path.join(BUILD, name)
        if os.path.isfile(p):
            txt = open(p, encoding="utf-8").read()
            if "content-strategy" in txt or "pipeline.json" in txt:
                problems.append("SITEMAP/ROBOTS LEAK in %s" % p)

    # каждая статья из очереди публикации должна иметь страницу, и ни одной лишней
    queue_path = os.path.join(ROOT, "site", "blog", "queue.json")
    with open(queue_path, encoding="utf-8") as f:
        queue = json.load(f)
    slugs = set(a["slug"] for a in queue["articles"])
    for slug in sorted(slugs):
        if not os.path.isfile(os.path.join(BUILD, "articles", slug, "index.html")):
            problems.append("ARTICLE MISSING FROM BUILD: %s" % slug)
    for slug in os.listdir(os.path.join(BUILD, "articles")):
        if slug not in slugs:
            problems.append("UNEXPECTED ARTICLE IN BUILD: %s" % slug)

    print("Pages checked: %d" % total_pages)
    print("Links checked: %d" % checked_links)
    print("Images checked: %d" % checked_images)
    print()
    if problems:
        print("PROBLEMS FOUND: %d" % len(problems))
        for p in problems:
            print(" -", p)
        return 1
    print("No problems found.")
    return 0


if __name__ == "__main__":
    sys.exit(check())
