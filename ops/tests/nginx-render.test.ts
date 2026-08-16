import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const renderer = resolve(workspaceRoot, 'ops/scripts/render-nginx-config.py');
const template = resolve(workspaceRoot, 'ops/nginx/templates/default.conf.template');

describe('production Nginx renderer', () => {
  it('renders one canonical template with request correlation and ACME support', () => {
    const outputDirectory = mkdtempSync(join(tmpdir(), 'bric-nginx-'));
    const output = join(outputDirectory, 'default.conf');

    try {
      const result = spawnSync('python3', [renderer, template, output, 'green'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          BRIC_API_DOMAIN: 'api.example.com',
          BRIC_API_CERT_NAME: 'example.com',
          BRIC_ADMIN_DOMAIN: 'admin.example.com',
          BRIC_ADMIN_CERT_NAME: 'example.com',
          BRIC_STOREFRONT_DOMAIN: 'www.example.com',
          BRIC_STOREFRONT_APEX_DOMAIN: 'example.com',
          BRIC_STOREFRONT_CERT_NAME: 'example.com',
        },
      });

      expect(result.status).toBe(0);
      const rendered = readFileSync(output, 'utf8');
      expect(rendered).not.toContain('${');
      expect(rendered).toContain(
        'server_name api.example.com admin.example.com www.example.com example.com;',
      );
      expect(rendered).toContain('listen 80 default_server;');
      expect(rendered).toContain('listen 443 ssl default_server;');
      expect(rendered).toContain('ssl_reject_handshake on;');
      expect(rendered).toContain('location ^~ /.well-known/acme-challenge/');
      expect(rendered).toContain('proxy_pass http://storefront-api-green:3001;');
      expect(rendered).toContain('proxy_pass http://storefront-green:3002;');
      expect(rendered.match(/client_max_body_size 1m;/g)).toHaveLength(2);
      expect(rendered).toContain('client_max_body_size 50m;');
      expect(rendered.match(/if \(\$http_next_action != ''\)/g)).toHaveLength(2);
      expect(rendered.match(/proxy_set_header X-Request-ID \$request_id;/g)).toHaveLength(5);
      expect(rendered.match(/add_header X-Request-ID \$request_id always;/g)).toHaveLength(3);
    } finally {
      rmSync(outputDirectory, { recursive: true, force: true });
    }
  });

  it('rejects an invalid deployment slot', () => {
    const outputDirectory = mkdtempSync(join(tmpdir(), 'bric-nginx-'));

    try {
      const result = spawnSync(
        'python3',
        [renderer, template, join(outputDirectory, 'default.conf'), 'canary'],
        { encoding: 'utf8' },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('invalid slot: canary');
    } finally {
      rmSync(outputDirectory, { recursive: true, force: true });
    }
  });
});
