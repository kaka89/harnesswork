/**
 * Vite Dev Server 插件 — 为浏览器开发环境提供本地文件系统读写能力
 *
 * 仅在 `vite dev` 时生效，生产构建不包含此插件逻辑。
 * 注入 /__xingjing_fs/* 系列 HTTP 端点，供 file-ops.ts 降级调用。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { Plugin, ViteDevServer } from 'vite';

/** 将路径中的 ~ 展开为用户主目录 */
function expandTilde(p: string): string {
  if (!p.startsWith('~')) return p;
  const home = os.homedir();
  return p === '~' ? home : path.join(home, p.slice(2));
}

/** 安全读取 JSON body */
async function readJsonBody(req: import('node:http').IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

export function xingjingFsPlugin(): Plugin {
  return {
    name: 'xingjing-fs',
    apply: 'serve', // 仅 dev server 生效

    configureServer(server: ViteDevServer) {
      // 注册中间件（在 Vite 内部中间件之前）
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';

        if (!url.startsWith('/__xingjing_fs/')) {
          return next();
        }

        // 仅允许 POST
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        const route = url.replace('/__xingjing_fs/', '');
        const json = await readJsonBody(req);

        res.setHeader('Content-Type', 'application/json');

        try {
          switch (route) {
            case 'read': {
              const filePath = expandTilde(String(json.path ?? ''));
              if (!filePath) {
                res.end(JSON.stringify({ content: null }));
                return;
              }
              try {
                const content = await fs.readFile(filePath, 'utf-8');
                res.end(JSON.stringify({ content }));
              } catch {
                res.end(JSON.stringify({ content: null }));
              }
              return;
            }

            case 'write': {
              const filePath = expandTilde(String(json.path ?? ''));
              const content = String(json.content ?? '');
              if (!filePath) {
                res.end(JSON.stringify({ ok: false }));
                return;
              }
              try {
                // 自动创建父目录
                const dir = path.dirname(filePath);
                await fs.mkdir(dir, { recursive: true });
                await fs.writeFile(filePath, content, 'utf-8');
                res.end(JSON.stringify({ ok: true }));
              } catch {
                res.end(JSON.stringify({ ok: false }));
              }
              return;
            }

            case 'list': {
              const dirPath = expandTilde(String(json.path ?? ''));
              if (!dirPath) {
                res.end(JSON.stringify({ entries: [] }));
                return;
              }
              try {
                const entries = await fs.readdir(dirPath, { withFileTypes: true });
                const result = entries.map((entry) => ({
                  name: entry.name,
                  path: path.join(dirPath, entry.name),
                  type: entry.isDirectory() ? 'directory' : 'file',
                }));
                res.end(JSON.stringify({ entries: result }));
              } catch {
                res.end(JSON.stringify({ entries: [] }));
              }
              return;
            }

            case 'delete': {
              const filePath = expandTilde(String(json.path ?? ''));
              if (!filePath) {
                res.end(JSON.stringify({ ok: false }));
                return;
              }
              try {
                await fs.unlink(filePath);
                res.end(JSON.stringify({ ok: true }));
              } catch {
                res.end(JSON.stringify({ ok: false }));
              }
              return;
            }

            default:
              res.writeHead(404);
              res.end(JSON.stringify({ error: 'Not found' }));
          }
        } catch (e) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
    },
  };
}
