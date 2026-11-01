import { describe, expect, it } from 'vitest';
import { loader, welcomeDestination } from './private-welcome';

describe('private builder entry', () => {
  it('only redirects the new bare homepage, preserving old projects, workspace and prompt deep links', () => {
    expect(welcomeDestination('https://builder.tzsvthosting.com/')).toBe('/nyito');

    for (const url of [
      'https://builder.tzsvthosting.com/muhely',
      'https://builder.tzsvthosting.com/chat/6',
      'https://builder.tzsvthosting.com/?prompt=Build',
      'https://xzmy2phls5uwuhltjhadbcbg.187.126.2.206.sslip.io/',
      'https://builder.tzsvthosting.com.example.org/',
    ]) {
      expect(welcomeDestination(url)).toBeNull();
    }
  });

  it('serves a small script-free entry with workspace and legacy-project links', async () => {
    const response = loader();
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'");

    const html = await response.text();
    expect(html).toContain('href="/muhely"');
    expect(html).toContain('https://xzmy2phls5uwuhltjhadbcbg.187.126.2.206.sslip.io/');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<iframe');
  });
});
