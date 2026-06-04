import express from 'express';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Ensure dist was produced by `vite build` (not dev index.html).
 */
export function assertProductionDist(distDir) {
  const indexPath = join(distDir, 'index.html');
  if (!existsSync(indexPath)) {
    throw new Error(`Missing production build at ${indexPath}. Run: npm run build`);
  }
  const html = readFileSync(indexPath, 'utf8');
  if (/index\.tsx/i.test(html)) {
    throw new Error(
      `${indexPath} references index.tsx — run: npm run build and deploy dist/ output`
    );
  }
  if (!html.includes('/assets/')) {
    throw new Error(`${indexPath} has no /assets/ bundle — run: npm run build`);
  }
}

export function installProductionStatic(app, distDir) {
  assertProductionDist(distDir);
  const indexPath = join(distDir, 'index.html');
  const assetsDir = join(distDir, 'assets');

  app.use((req, res, next) => {
    if (/\.(tsx|ts|jsx)$/i.test(req.path)) {
      res.status(404).type('text/plain').send('Not found');
      return;
    }
    next();
  });

  app.use(
    express.static(distDir, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        } else if (filePath.startsWith(assetsDir)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    })
  );

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.sendFile(indexPath, (err) => {
      if (err) next(err);
    });
  });
}
