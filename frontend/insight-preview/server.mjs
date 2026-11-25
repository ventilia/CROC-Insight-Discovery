import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const host = '127.0.0.1';
const port = Number(process.env.CROC_FRONTEND_PORT || 4173);
const live = process.argv.includes('--live');
const password = process.env.CROC_DEMO_API_PASSWORD;
const uuid = '[\\da-f]{8}(?:-[\\da-f]{4}){3}-[\\da-f]{12}';
const apiRoute = new RegExp(`^/api/v1/(?:companies(?:/${uuid}/initiatives)?|initiatives/${uuid}/(?:graph|events))$`, 'i');
const files = new Map([
  ['/', ['index.html', 'text/html']],
  ['/index.html', ['index.html', 'text/html']],
  ['/styles.css', ['styles.css', 'text/css']],
  ['/theme.js', ['theme.js', 'text/javascript']],
  ['/app.mjs', ['app.mjs', 'text/javascript']],
  ['/api.mjs', ['api.mjs', 'text/javascript']],
  ['/demo.mjs', ['demo.mjs', 'text/javascript']],
  ['/graph.mjs', ['graph.mjs', 'text/javascript']],
  ['/vendor/d3-force-3d.mjs', ['vendor/d3-force-3d.mjs', 'text/javascript']],
  ['/examples/companies.json', ['../../backend/examples/companies.json', 'application/json']],
  ['/examples/initiatives.json', ['../../backend/examples/initiatives.json', 'application/json']],
  ['/examples/graph.json', ['../../backend/examples/graph.json', 'application/json']],
]);

function send(response, status, type, body) {
  response.writeHead(status, {
    'Content-Type': `${type}; charset=utf-8`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
}

function problem(response, status, title) {
  send(response, status, 'application/problem+json', JSON.stringify({ status, title }));
}

async function proxy(url, response) {
  if (!live) return problem(response, 503, 'Серверный режим отключён');
  try {
    const result = await fetch(`http://127.0.0.1:8080${url.pathname}${url.search}`, {
      headers: {
        Accept: 'application/json, application/problem+json',
        Authorization: `Basic ${Buffer.from(`demo-reader:${password}`).toString('base64')}`,
      },
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (result.status === 401) return problem(response, 401, 'Проверьте пароль демопрофиля');
    const type = result.headers.get('content-type')?.includes('problem+json') ? 'application/problem+json' : 'application/json';
    send(response, result.status, type, await result.text());
  } catch {
    problem(response, 502, 'Бэкенд недоступен на 127.0.0.1:8080');
  }
}

if (live && !password) {
  console.error('Для --live задайте CROC_DEMO_API_PASSWORD в окружении запуска.');
  process.exit(1);
}

createServer(async (request, response) => {
  if (request.method !== 'GET') return problem(response, 405, 'Поддерживается только GET');
  const url = new URL(request.url, `http://${host}:${port}`);
  if (url.pathname === '/config.json') {
    return send(response, 200, 'application/json', JSON.stringify({ live }));
  }
  if (apiRoute.test(url.pathname)) return proxy(url, response);

  const file = files.get(url.pathname);
  if (!file) return problem(response, 404, 'Страница не найдена');
  try {
    const content = await readFile(new URL(file[0], import.meta.url));
    send(response, 200, file[1], content);
  } catch {
    problem(response, 500, 'Локальный файл не найден');
  }
}).listen(port, host, () => {
  console.log(`КРОК Insight · http://${host}:${port} · ${live ? 'API' : 'демоданные'}`);
});
