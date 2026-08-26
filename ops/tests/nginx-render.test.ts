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
      expect(rendered).toContain('resolver 127.0.0.11 ipv6=off valid=5s;');
      expect(rendered).toContain('resolver_timeout 2s;');
      expect(rendered).toContain('set $storefront_api_upstream storefront-api-green:3001;');
      expect(rendered).toContain('set $admin_upstream admin-green:3000;');
      expect(rendered).toContain('set $storefront_upstream storefront-green:3002;');
      expect(rendered).toContain('proxy_pass http://$storefront_api_upstream;');
      expect(rendered).toContain('proxy_pass http://$admin_upstream;');
      expect(rendered).toContain('proxy_pass http://$storefront_upstream;');
      expect(rendered.match(/proxy_connect_timeout 2s;/g)).toHaveLength(4);
      expect(rendered.match(/client_max_body_size 1m;/g)).toHaveLength(2);
      expect(rendered).toContain('client_max_body_size 50m;');
      expect(rendered.match(/if \(\$http_next_action != ''\)/g)).toHaveLength(2);
      expect(rendered.match(/proxy_set_header X-Request-ID \$request_id;/g)).toHaveLength(4);
      expect(rendered.match(/proxy_hide_header X-Request-ID;/g)).toHaveLength(4);
      expect(rendered.match(/add_header X-Request-ID \$request_id always;/g)).toHaveLength(4);
      expect(rendered).toContain('location = /_next/image {');
      expect(rendered).toContain('proxy_cache storefront_images;');
      expect(rendered).toContain('proxy_cache_key "$scheme$host$request_uri";');
      expect(rendered).toContain('proxy_cache_lock on;');
      expect(rendered).toContain('proxy_cache_use_stale updating error timeout');
      expect(rendered).toContain("proxy_set_header Accept-Encoding '';");
      expect(rendered).toMatch(
        /location = \/_next\/image \{[\s\S]*?add_header X-Request-ID \$request_id always;/,
      );
      expect(rendered).toContain('add_header X-Bric-Image-Cache $upstream_cache_status always;');
      expect(rendered).not.toContain('location = /api/capi');
      expect(rendered).not.toContain('location = /api/meta/events');
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
