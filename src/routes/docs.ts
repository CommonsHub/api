import { Hono } from "hono";
import { marked } from "marked";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const docsApp = new Hono();

const DOCS_DIR = resolve(import.meta.dir, "../../docs");

// HTML wrapper for rendered markdown
function htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — CommonsHub API</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem 1rem;
      line-height: 1.6;
      color: #1a1a1a;
    }
    pre {
      background: #f6f8fa;
      padding: 1rem;
      border-radius: 6px;
      overflow-x: auto;
    }
    code {
      background: #f6f8fa;
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-size: 0.9em;
    }
    pre code {
      background: none;
      padding: 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 1rem 0;
    }
    th, td {
      border: 1px solid #d0d7de;
      padding: 0.5rem 0.75rem;
      text-align: left;
    }
    th {
      background: #f6f8fa;
    }
    a { color: #0969da; }
    h1, h2, h3 { margin-top: 1.5em; }
    nav { margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid #d0d7de; }
    nav a { margin-right: 1rem; }
  </style>
</head>
<body>
  <nav><a href="/v1/docs">docs</a></nav>
  ${body}
</body>
</html>`;
}

// Index: list all docs
docsApp.get("/", async (c) => {
  const files = await readdir(DOCS_DIR);
  const mdFiles = files.filter((f) => f.endsWith(".md")).sort();

  const items = mdFiles
    .map((f) => {
      const name = f.replace(/\.md$/, "");
      return `<li><a href="/v1/docs/${name}">${name}</a> (<a href="/v1/docs/${name}.md">raw</a>)</li>`;
    })
    .join("\n");

  const body = `<h1>CommonsHub API Docs</h1>\n<ul>\n${items}\n</ul>`;
  return c.html(htmlPage("Docs", body));
});

// Raw markdown (.md extension)
docsApp.get("/:name{.+\\.md$}", async (c) => {
  const name = c.req.param("name");
  const filePath = join(DOCS_DIR, name);

  // Prevent path traversal
  if (!resolve(filePath).startsWith(DOCS_DIR)) {
    return c.text("Forbidden", 403);
  }

  try {
    const content = await readFile(filePath, "utf-8");
    return c.body(content, 200, {
      "Content-Type": "text/markdown; charset=utf-8",
    });
  } catch {
    return c.text("Not found", 404);
  }
});

// Rendered HTML (no extension)
docsApp.get("/:name", async (c) => {
  const name = c.req.param("name");
  const filePath = join(DOCS_DIR, `${name}.md`);

  // Prevent path traversal
  if (!resolve(filePath).startsWith(DOCS_DIR)) {
    return c.text("Forbidden", 403);
  }

  try {
    const content = await readFile(filePath, "utf-8");
    const html = await marked(content);
    // Extract title from first # heading
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : name;
    return c.html(htmlPage(title, html));
  } catch {
    return c.text("Not found", 404);
  }
});

export { docsApp };
