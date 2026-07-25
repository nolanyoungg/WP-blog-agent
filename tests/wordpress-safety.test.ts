import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBlogHtml, validateRenderedHtml } from '../src/wordpress/content.js';
import {
  parseWordPressPostResponse,
  parseWordPressPostsResponse,
  parseWordPressTermsResponse,
  WordPressClient
} from '../src/wordpress/client.js';
import { validDraftObject } from './helpers/blog-fixture.js';

const client = () => new WordPressClient({
  baseUrl: 'https://wordpress.example',
  username: 'agent',
  password: 'application-password',
  status: 'draft',
  allowHttp: false
});

test('renders validated Markdown and sanitizes it to a bounded WordPress HTML allowlist', () => {
  const linked = validDraftObject();
  linked.body = linked.body
    .replace('source material', '[source material](https://example.com/editorial-guide)')
    .replace('## Practical Steps or Examples', '```php\n<?php echo esc_html( $title ); ?>\n```\n\n## Practical Steps or Examples');
  const { html } = renderBlogHtml(linked);
  assert.match(html, /^<h1>A Reliable WordPress Publishing Workflow<\/h1>/);
  assert.match(html, /href="https:\/\/example.com\/editorial-guide"/);
  assert.match(html, /&lt;\?php echo esc_html/);
  assert.doesNotMatch(html, /<script|onload=|javascript:/i);
});

test('rejects active rendered HTML and executable URLs', () => {
  const unsafe = [
    '<?php echo "unsafe"; ?>',
    '<script>alert(1)</script>',
    '<style>body { display: none }</style>',
    '<iframe src="https://attacker.invalid"></iframe>',
    '<object data="https://attacker.invalid"></object>',
    '<embed src="https://attacker.invalid">',
    '<form action="https://attacker.invalid"><input></form>',
    '<p onclick="alert(1)">Unsafe</p>',
    '<a href="javascript:alert(1)">Unsafe</a>',
    '<img src="data:text/html;base64,PHNjcmlwdD4=" alt="Unsafe">',
    '<svg><a xlink:href="javascript:alert(1)">Unsafe</a></svg>'
  ];
  for (const html of unsafe) assert.throws(() => validateRenderedHtml(html), /prohibited|unsupported/i);
});

test('schema-checks WordPress term, duplicate-post, and created-post responses', () => {
  assert.equal(parseWordPressTermsResponse([{ id: 1, name: 'WordPress', slug: 'wordpress' }])[0]?.id, 1);
  assert.equal(parseWordPressPostsResponse([{ id: 2, link: 'https://wordpress.example/post' }])[0]?.id, 2);
  assert.deepEqual(parseWordPressPostResponse({ id: 3, link: 'https://wordpress.example/new-post' }), {
    id: 3,
    link: 'https://wordpress.example/new-post'
  });
  assert.throws(() => parseWordPressTermsResponse({ id: 1 }), /terms/);
  assert.throws(() => parseWordPressPostsResponse([{ id: 0, link: 'not-a-url' }]), /posts/);
  assert.throws(() => parseWordPressPostResponse({ id: '3', link: 'javascript:alert(1)' }), /post creation/);
});

test('performs no WordPress request when draft validation fails', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (async () => {
    requests += 1;
    throw new Error('fetch must not be called');
  }) as typeof fetch;
  try {
    const unsafe = validDraftObject();
    unsafe.body = unsafe.body.replace('## Conclusion', '<script>alert(1)</script>\n\n## Conclusion');
    await assert.rejects(client().post(unsafe), /raw HTML/);
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('does not POST when a WordPress lookup response fails schema validation', async () => {
  const originalFetch = globalThis.fetch;
  const methods: string[] = [];
  globalThis.fetch = (async (_input, init) => {
    methods.push(init?.method ?? 'GET');
    return new Response(JSON.stringify({ unexpected: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }) as typeof fetch;
  try {
    await assert.rejects(client().post(validDraftObject()), /Invalid WordPress posts response/);
    assert.deepEqual(methods, ['GET']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('does not POST when a WordPress term response fails schema validation', async () => {
  const originalFetch = globalThis.fetch;
  const methods: string[] = [];
  globalThis.fetch = (async (input, init) => {
    methods.push(init?.method ?? 'GET');
    if (String(input).includes('/posts?')) return new Response('[]', { status: 200 });
    return new Response(JSON.stringify({ unexpected: true }), { status: 200 });
  }) as typeof fetch;
  try {
    await assert.rejects(client().post(validDraftObject()), /Invalid WordPress terms response/);
    assert.equal(methods.includes('POST'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sends only the validated HTML and preserves duplicate-slug idempotency', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string; body?: string }> = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    requests.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });
    if (url.includes('/posts?')) return new Response('[]', { status: 200 });
    if (url.includes('/categories') || url.includes('/tags')) return new Response('[]', { status: 200 });
    return new Response(JSON.stringify({ id: 44, link: 'https://wordpress.example/reliable-wordpress-publishing-workflow' }), { status: 201 });
  }) as typeof fetch;
  try {
    const post = await client().post(validDraftObject());
    assert.equal(post.id, 44);
    const postRequest = requests.find(request => request.method === 'POST');
    assert.ok(postRequest?.body);
    const payload = JSON.parse(postRequest.body);
    assert.match(payload.content, /^<h1>/);
    assert.doesNotMatch(payload.content, /<script|on[a-z]+=/i);
    assert.equal(payload.slug, 'reliable-wordpress-publishing-workflow');

    requests.length = 0;
    globalThis.fetch = (async (input, init) => {
      requests.push({ url: String(input), method: init?.method ?? 'GET' });
      return new Response(JSON.stringify([{ id: 44, link: 'https://wordpress.example/reliable-wordpress-publishing-workflow' }]), { status: 200 });
    }) as typeof fetch;
    assert.equal((await client().post(validDraftObject())).id, 44);
    assert.deepEqual(requests.map(request => request.method), ['GET']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
