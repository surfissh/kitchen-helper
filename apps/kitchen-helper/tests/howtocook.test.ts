import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeHtmlEntities, htmlToPlainText } from "../app-src/recipe/http.ts";
import {
  extractMarkdownPath,
  extractPageTitle,
  searchUrlFor,
} from "../app-src/recipe/howtocook.ts";

const detailHtml = `<!doctype html><html><head><title>西红柿炒鸡蛋 | How To Cook</title></head>
<body><h1>西红柿炒鸡蛋</h1>
<a href="https://github.com/Anduin2017/HowToCook/edit/master/dishes/vegetable_dish/&#x897F;&#x7EA2;&#x67FF;&#x7092;&#x9E21;&#x86CB;.md">Edit on GitHub</a>
</body></html>`;

test("markdown edit links are decoded into repository paths", () => {
  const path = extractMarkdownPath(detailHtml);
  assert.equal(path, "dishes/vegetable_dish/西红柿炒鸡蛋.md");
});

test("detail page titles are cleaned", () => {
  assert.equal(extractPageTitle(detailHtml), "西红柿炒鸡蛋");
});

test("HTML helpers decode entities and strip scripts", () => {
  assert.equal(decodeHtmlEntities("&#x897F;&#x7EA2;&#x67FF; &amp; &#38;"), "西红柿 & &");
  const plain = htmlToPlainText("<script>alert(1)</script><h1>标题</h1><p>第一段</p><li>条目</li>");
  assert.match(plain, /标题/);
  assert.match(plain, /第一段/);
  assert.equal(/alert/.test(plain), false);
});

test("search URLs encode Chinese dish names", () => {
  assert.match(searchUrlFor("番茄炒蛋"), /Dashboard\/Index\?q=/);
  assert.match(searchUrlFor("番茄炒蛋"), /%E7%95%AA%E8%8C%84/);
});
