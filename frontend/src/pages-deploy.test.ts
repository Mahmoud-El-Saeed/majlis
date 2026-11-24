// Ticket 26: the SPA is served twice — by the compose reverse proxy locally
// and by Cloudflare Pages in production. The two must not drift. This pins
// the Pages `_headers` policy to infra/nginx.conf's `location /` block, and
// pins the deployment workflow to the ticket's contract: main only, the two
// Cloudflare secrets, and the production API base baked at build time.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoDir = resolve(frontendDir, '..')
const publicDir = resolve(frontendDir, 'public')

const read = (path: string): string => readFileSync(path, 'utf8')

/** `add_header Name "value" always;` pairs inside nginx's `location / { … }`. */
function nginxSpaHeaders(): Record<string, string> {
  const block = /location \/ \{([\s\S]*?)\n {4}\}/.exec(read(resolve(repoDir, 'infra/nginx.conf')))
  expect(block, 'infra/nginx.conf must keep a `location /` SPA block').not.toBeNull()
  const headers: Record<string, string> = {}
  for (const m of block![1].matchAll(/add_header\s+([A-Za-z-]+)\s+"([^"]*)"\s+always;/g)) {
    headers[m[1]] = m[2]
  }
  return headers
}

/** One path rule in a Pages `_headers` file, with its header lines in order. */
class Rule {
  readonly path: string
  readonly lines: string[]

  constructor(path: string, lines: string[]) {
    this.path = path
    this.lines = lines
  }

  /** Value a rule leaves behind: a `! Name` detach drops earlier values. */
  value(name: string): string | undefined {
    let value: string | undefined
    for (const line of this.lines) {
      if (line === `! ${name}`) value = undefined
      else if (line.startsWith(`${name}:`)) value = line.slice(name.length + 1).trim()
    }
    return value
  }

  /** Header names the rule ends up sending, detaches applied. */
  names(): string[] {
    const sent = new Set<string>()
    for (const line of this.lines) {
      if (line.startsWith('! ')) sent.delete(line.slice(2).trim())
      else sent.add(line.slice(0, line.indexOf(':')).trim())
    }
    return [...sent].sort()
  }
}

/** Pages `_headers` rules in file order; order is load-bearing (see below). */
function pagesRules(): Rule[] {
  const rules: Rule[] = []
  for (const raw of read(resolve(publicDir, '_headers')).split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim() || line.trim().startsWith('#')) continue
    if (/^\s/.test(line)) {
      expect(rules.length, 'a header line must follow a path').toBeGreaterThan(0)
      rules[rules.length - 1].lines.push(line.trim())
    } else {
      rules.push(new Rule(line.trim(), []))
    }
  }
  return rules
}

const ruleFor = (rules: Rule[], path: string): Rule => {
  const rule = rules.find((r) => r.path === path)
  expect(rule, `_headers must define a ${path} rule`).toBeDefined()
  return rule!
}

describe('Pages headers match the compose proxy (ADR-0010)', () => {
  it('stamps the same five headers, byte for byte', () => {
    const expected = nginxSpaHeaders()
    expect(Object.keys(expected).sort()).toEqual([
      'Content-Security-Policy',
      'Permissions-Policy',
      'Referrer-Policy',
      'X-Content-Type-Options',
      'X-Frame-Options',
    ])
    const all = ruleFor(pagesRules(), '/*')
    for (const [name, value] of Object.entries(expected)) {
      expect(all.value(name), `${name} must match infra/nginx.conf`).toBe(value)
    }
  })

  it('sends nothing beyond the proxy policy and its own cache split', () => {
    // The parity test above only proves nginx ⊆ _headers; without this, an
    // extra header could ride along — HSTS in particular is the zone's job
    // here, not the app's (ADR-0010).
    expect(ruleFor(pagesRules(), '/*').names()).toEqual([
      'Cache-Control',
      'Content-Security-Policy',
      'Permissions-Policy',
      'Referrer-Policy',
      'X-Content-Type-Options',
      'X-Frame-Options',
    ])
  })

  it('never caches HTML and caches hashed assets immutably', () => {
    const rules = pagesRules()
    const all = ruleFor(rules, '/*')
    const assets = ruleFor(rules, '/assets/*')
    expect(all.value('Cache-Control')).toBe('no-cache')
    // Repeated Cache-Control values are joined into conflicting directives,
    // so the narrower rule must detach first — and come after the broad one.
    expect(assets.lines).toContain('! Cache-Control')
    expect(assets.value('Cache-Control')).toBe('public, max-age=31536000, immutable')
    expect(rules.indexOf(all)).toBeLessThan(rules.indexOf(assets))
  })

  it('keeps the SPA fallback Pages serves for unknown paths', () => {
    // A top-level 404.html switches Pages out of SPA rendering; a catch-all
    // rewrite shadows real assets ("redirects are always followed").
    expect(existsSync(resolve(publicDir, '404.html'))).toBe(false)
    const redirects = resolve(publicDir, '_redirects')
    if (existsSync(redirects)) {
      for (const line of read(redirects).split('\n')) {
        expect(line.trim().startsWith('/*'), 'a /* rewrite would shadow /assets/*').toBe(false)
      }
    }
  })
  it('keeps _headers out of the compose image', () => {
    // Vite copies public/_headers into dist/. It is a Pages control file; the
    // compose proxy owns its headers (infra/nginx.conf, ADR-0010), so serving
    // it as a static asset would leak the wrong answer to the wrong server.
    expect(read(resolve(frontendDir, 'nginx.conf'))).toMatch(/location = \/_headers \{\s*return 404;/)
  })
})

describe('Pages deployment workflow (ticket 26)', () => {
  const workflow = read(resolve(repoDir, '.github/workflows/pages-deploy.yml'))

  it('publishes main only — no preview deployments', () => {
    expect(workflow).toMatch(/branches:\s*\[main\]/)
    expect(workflow).not.toMatch(/pull_request/)
    expect(workflow).toMatch(/--branch=main\b/)
    expect(workflow).toMatch(/--project-name=majlis-elsaeed\b/)
  })

  it('needs only the two Cloudflare secrets', () => {
    const used = [...workflow.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1])
    expect([...new Set(used)].sort()).toEqual(['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'])
  })

  it('bakes the production API base at build time', () => {
    expect(workflow).toMatch(/VITE_API_URL:\s*https:\/\/api\.majlis\.elsaeed\.dev\/api\/v1/)
  })

  it('cannot publish a build that did not pass', () => {
    const build = workflow.indexOf('bun run build')
    const artifact = workflow.indexOf('test -f dist/_headers')
    const publish = workflow.indexOf('name: Publish to Cloudflare Pages')
    expect(build).toBeGreaterThan(-1)
    // The artifact gate sits between them: a build that stopped copying
    // public/_headers must fail before the upload, not ship a policy-less site.
    expect(artifact).toBeGreaterThan(build)
    expect(publish).toBeGreaterThan(artifact)
    // One production publish at a time; a deploy is never cancelled mid-upload.
    expect(workflow).toMatch(/cancel-in-progress:\s*false/)
  })

  it('builds and publishes with pinned tooling', () => {
    for (const [, action] of workflow.matchAll(/uses:\s*(\S+)/g)) {
      expect(action, `${action} must be pinned to a full commit`).toMatch(/@[0-9a-f]{40}$/)
    }
    expect(workflow).toMatch(/wranglerVersion:\s*\d+\.\d+\.\d+$/m)
    // Same Bun as the compose image, so bun.lock resolves identically.
    expect(/bun-version:\s*(\S+)/.exec(workflow)?.[1]).toBe(
      /FROM oven\/bun:(\S+)/.exec(read(resolve(frontendDir, 'Dockerfile')))?.[1],
    )
  })
})
