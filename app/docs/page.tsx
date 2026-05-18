// Public docs page — explains how Noztos works, what we store, how
// it's protected, and what stays on the user's machine. Same visual
// language as public/landing.html so the brand experience is unified:
// Space Grotesk + JetBrains Mono, oklch dark palette, scanlines and
// ambient grid. Single scrollable page with anchored sections, left
// table of contents, no client-side interactivity required.

export const metadata = {
  title: 'noztos — docs',
  description: 'How Noztos works, what we store, and how it stays yours.',
}

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'what-we-store', label: 'What we store' },
  { id: 'encryption', label: 'Encryption & access' },
  { id: 'cloud-mode', label: 'Cloud mode' },
  { id: 'privacy', label: 'Privacy & deletion' },
  { id: 'faq', label: 'FAQ' },
]

export default function DocsPage() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500&display=swap');
        :root {
          --bg:       oklch(0.13 0.008 255);
          --bg-2:     oklch(0.16 0.009 255);
          --bg-3:     oklch(0.19 0.01  255);
          --fg:       oklch(0.96 0.005 255);
          --muted:    oklch(0.62 0.012 255);
          --muted-2:  oklch(0.45 0.012 255);
          --line:     oklch(0.26 0.012 255);
          --line-2:   oklch(0.22 0.012 255);
          --accent:   oklch(0.88 0.19 130);
          --accent-2: oklch(0.70 0.18 130);
          --display:  'Space Grotesk', ui-sans-serif, system-ui, sans-serif;
          --mono:     'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        html, body { background: var(--bg); color: var(--fg); margin: 0; padding: 0; overflow-x: hidden; }
        body { font-family: var(--display); -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
        ::selection { background: var(--accent); color: #000; }
        .docs-grid {
          display: grid; grid-template-columns: 220px 1fr; gap: 80px;
          max-width: 1080px; margin: 0 auto; padding: 56px 28px 120px;
        }
        @media (max-width: 860px) {
          .docs-grid { grid-template-columns: 1fr; gap: 48px; }
          .docs-toc { display: none; }
        }
        .docs-toc {
          position: sticky; top: 80px; align-self: start;
          font-family: var(--mono); font-size: 11px;
          text-transform: uppercase; letter-spacing: 0.1em;
        }
        .docs-toc ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
        .docs-toc a { color: var(--muted); transition: color 0.15s; }
        .docs-toc a:hover { color: var(--fg); }
        .docs-toc .toc-label { color: var(--muted-2); margin-bottom: 14px; display: block; }
        .docs-content h2 {
          font-family: var(--display); font-weight: 500;
          font-size: clamp(28px, 3.4vw, 40px);
          letter-spacing: -0.02em; line-height: 1.15;
          margin: 64px 0 18px;
        }
        .docs-content h2:first-of-type { margin-top: 0; }
        .docs-content h3 {
          font-family: var(--display); font-weight: 500;
          font-size: 18px; letter-spacing: -0.01em;
          color: var(--accent);
          margin: 32px 0 10px;
        }
        .docs-content p {
          font-size: 15px; line-height: 1.65; color: var(--muted);
          max-width: 64ch; margin: 0 0 14px;
        }
        .docs-content p strong { color: var(--fg); font-weight: 500; }
        .docs-content .lede {
          font-size: 18px; line-height: 1.5; color: var(--fg);
          margin-bottom: 32px;
        }
        .docs-content ul { color: var(--muted); padding-left: 22px; margin: 0 0 18px; line-height: 1.65; max-width: 64ch; }
        .docs-content ul li { margin-bottom: 6px; }
        .docs-content ul li strong { color: var(--fg); font-weight: 500; }
        .docs-content code {
          font-family: var(--mono); font-size: 13px;
          background: var(--bg-2); padding: 1px 6px; border-radius: 3px;
          color: var(--accent); border: 1px solid var(--line-2);
        }
        .docs-content .callout {
          border: 1px solid var(--line); background: var(--bg-2);
          padding: 16px 18px; margin: 24px 0; border-left: 2px solid var(--accent);
          font-size: 14px; color: var(--muted); line-height: 1.6;
          border-radius: 0 4px 4px 0;
        }
        .docs-content .callout strong { color: var(--fg); }
        .docs-content table {
          width: 100%; border-collapse: collapse; margin: 18px 0;
          font-size: 13px; color: var(--muted);
        }
        .docs-content table th, .docs-content table td {
          border: 1px solid var(--line); padding: 10px 12px; text-align: left;
        }
        .docs-content table th {
          font-family: var(--mono); font-size: 11px; font-weight: 500;
          text-transform: uppercase; letter-spacing: 0.08em;
          color: var(--fg); background: var(--bg-2);
        }
        .docs-content table td strong { color: var(--fg); font-weight: 500; }
        .docs-hero-label {
          font-family: var(--mono); font-size: 11px;
          text-transform: uppercase; letter-spacing: 0.18em;
          color: var(--accent); margin-bottom: 16px;
        }
        .docs-hero-title {
          font-family: var(--display); font-weight: 500;
          font-size: clamp(40px, 5vw, 64px);
          letter-spacing: -0.03em; line-height: 0.98;
          margin: 0 0 18px;
        }
      `}</style>

      {/* Ambient + scanlines — same as landing/login */}
      <div
        aria-hidden
        style={{
          position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
          background:
            'radial-gradient(1200px 600px at 80% -10%, oklch(0.88 0.19 130 / 0.06), transparent 60%),' +
            'radial-gradient(900px 500px at 10% 110%, oklch(0.55 0.18 260 / 0.05), transparent 60%),' +
            'linear-gradient(var(--line-2) 1px, transparent 1px) 0 0 / 100% 64px,' +
            'linear-gradient(90deg, var(--line-2) 1px, transparent 1px) 0 0 / 64px 100%',
          maskImage: 'radial-gradient(ellipse at 50% 30%, black 30%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 30%, black 30%, transparent 80%)',
          opacity: 0.45,
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
          background: 'repeating-linear-gradient(to bottom, transparent 0 2px, oklch(1 0 0 / 0.012) 2px 3px)',
          mixBlendMode: 'overlay',
        }}
      />

      {/* Nav — same shape as landing/login so brand doesn't shift. */}
      <nav
        style={{
          position: 'sticky', top: 0, zIndex: 10,
          borderBottom: '1px solid var(--line)',
          background: 'oklch(0.13 0.008 255 / 0.7)', backdropFilter: 'blur(8px)',
        }}
      >
        <div style={{
          maxWidth: 1280, margin: '0 auto',
          padding: '14px 28px',
          display: 'flex', alignItems: 'center', gap: 32,
        }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--fg)', fontFamily: 'var(--display)', fontWeight: 600, fontSize: 18, letterSpacing: '-0.01em', textDecoration: 'none' }}>
            noztos
          </a>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
            docs
          </span>
          <a
            href="/login"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '9px 14px 9px 16px',
              border: '1px solid var(--accent)',
              background: 'oklch(0.88 0.19 130 / 0.1)',
              color: 'var(--accent)',
              fontFamily: 'var(--mono)', fontSize: 12,
              letterSpacing: '0.04em', textTransform: 'uppercase',
              textDecoration: 'none',
            }}
          >
            Start now →
          </a>
        </div>
      </nav>

      <main style={{ position: 'relative', zIndex: 5 }}>
        <div className="docs-grid">
          {/* Left TOC */}
          <aside className="docs-toc">
            <span className="toc-label">On this page</span>
            <ul>
              {SECTIONS.map((s) => (
                <li key={s.id}><a href={`#${s.id}`}>{s.label}</a></li>
              ))}
            </ul>
          </aside>

          {/* Content */}
          <article className="docs-content">
            <div className="docs-hero-label">how it works</div>
            <h1 className="docs-hero-title">A delegation IDE,<br/>built on trust.</h1>
            <p className="lede">
              Noztos runs as a local agent on your machine and as a cloud sandbox
              when you need to be portable. This page explains how that works,
              what we store, and how it&apos;s protected.
            </p>

            <h2 id="overview">Overview</h2>
            <p>
              Noztos has two execution surfaces — <strong>local</strong> and <strong>cloud</strong> — and you switch
              between them with one click. Your work stays continuous because
              the worktree state is mirrored, encrypted, between the two.
            </p>
            <ul>
              <li><strong>Local</strong> — a small companion daemon runs on your Mac. Claude Code or any supported engine spawns there using your existing subscription. Free, no token charge from us.</li>
              <li><strong>Cloud</strong> — an isolated Linux sandbox we provision on demand. Same files, same branch, same commit. Costs tokens + compute that come out of your credits or plan.</li>
            </ul>

            <h2 id="architecture">Architecture</h2>
            <p>
              Three pieces talk to each other over HTTPS / SSE. None of them
              talk to each other directly — everything routes through the
              Noztos server so authorisation, encryption, and routing decisions
              happen in one place.
            </p>
            <ul>
              <li><strong>Companion daemon</strong> (local). Installed via npm, runs in your shell. Spawns the AI agent, watches your worktrees, mirrors state to our server.</li>
              <li><strong>Noztos web app</strong>. The chat, file explorer, terminal, workflows — everything you interact with lives here. Nothing happens in the browser that the daemon (or cloud sandbox) doesn&apos;t execute.</li>
              <li><strong>Cloud sandbox</strong>. Spun up on demand. Materialises your worktree bit-perfect from the encrypted mirror, runs the same agent there.</li>
            </ul>
            <div className="callout">
              The web app is a thin orchestrator. It never holds your source
              code in memory. Every Edit, Read, Bash, or git operation is
              executed by the daemon or the sandbox — we just route results
              to your browser.
            </div>

            <h2 id="what-we-store">What we store</h2>
            <p>
              We store the minimum needed to make the local↔cloud switch
              instant + your chat history portable across devices. Everything
              else stays on your machine.
            </p>
            <h3>In Postgres</h3>
            <ul>
              <li><strong>Account & projects</strong>. Email, name, repos you connected, worktrees you created.</li>
              <li><strong>Chat sessions & messages</strong>. The full transcript of every conversation, including tool calls and their results. Survives across devices and engine swaps.</li>
              <li><strong>Tasks & workflow runs</strong>. The state of every delegated job — pending, running, done — with the iteration history.</li>
              <li><strong>Worktree mirror</strong>. A content-addressed map of files in your active worktrees: <code>path → SHA-256 hash → encrypted blob</code>. Lets cloud reconstruct a bit-perfect copy when you switch.</li>
            </ul>
            <h3>Never stored</h3>
            <ul>
              <li><strong>Local git history</strong> beyond what&apos;s needed to replay unpushed commits on cloud. Your <code>.git</code> directory stays on your Mac.</li>
              <li><strong>Files git ignores</strong> (<code>node_modules</code>, <code>.next</code>, build artifacts, secrets in <code>.env</code> that you don&apos;t opt-in to mirror).</li>
              <li><strong>Your subscription credentials</strong>. Claude OAuth tokens stay in your Mac keychain — they never leave your machine.</li>
            </ul>

            <h2 id="encryption">Encryption & access</h2>
            <p>
              Every byte of source code we store is encrypted with a per-user
              key. Even with full database access, a Noztos engineer cannot
              read your files without separate access to our KMS — which is
              audited and 2FA-gated.
            </p>
            <table>
              <thead>
                <tr><th>Layer</th><th>What it protects</th></tr>
              </thead>
              <tbody>
                <tr><td><strong>TLS in transit</strong></td><td>All HTTPS. Daemon, browser, sandbox.</td></tr>
                <tr><td><strong>Postgres at rest</strong></td><td>Disk-level AES-256 (Supabase).</td></tr>
                <tr><td><strong>Per-user DEK</strong></td><td>Each user gets a unique data encryption key. File contents are AES-256-GCM encrypted with it before write.</td></tr>
                <tr><td><strong>KMS-wrapped master</strong></td><td>The DEKs themselves are wrapped by a master key in a hardware-backed KMS. Master never leaves the KMS.</td></tr>
                <tr><td><strong>Row-Level Security</strong></td><td>Postgres policies enforce that user A can never query user B&apos;s rows, even on an app bug.</td></tr>
                <tr><td><strong>Hash integrity</strong></td><td>Every blob is re-hashed on read; corrupted or tampered data fails closed.</td></tr>
                <tr><td><strong>Audit log</strong></td><td>Internal access to KMS or admin endpoints is logged. Reads on production data require 2FA.</td></tr>
              </tbody>
            </table>
            <div className="callout">
              <strong>We do not train models on your code.</strong> Your data
              is not used to improve our agents or any third-party model.
              The AI calls go directly to Anthropic / OpenAI under our keys
              (or yours, depending on mode); the providers&apos; own
              no-training policy applies.
            </div>

            <h2 id="cloud-mode">Cloud mode</h2>
            <p>
              When you click <strong>Continue in the cloud</strong> on a worktree,
              we provision an isolated Linux sandbox from a trusted provider
              (E2B). It runs only your worktree. We materialise the files by
              fetching the encrypted blobs, decrypting them inside the sandbox,
              and verifying every byte by SHA-256.
            </p>
            <ul>
              <li><strong>One sandbox per worktree.</strong> No shared state between projects, no cross-contamination between users.</li>
              <li><strong>Ephemeral.</strong> Sandboxes are torn down when you switch back to local or after a long idle period. No persistent disk.</li>
              <li><strong>Network egress.</strong> Sandboxes can install dependencies and reach the public internet — the same as your laptop would. We don&apos;t pin them to a closed network so your code can actually run.</li>
            </ul>

            <h2 id="privacy">Privacy & deletion</h2>
            <p>
              You own your data. You can delete it at any time from the account
              settings page.
            </p>
            <ul>
              <li><strong>Right to erasure.</strong> Deleting your account revokes your DEK in our KMS — every encrypted byte we still hold becomes mathematically unreadable, immediately. A background sweep purges the actual rows within 7 days.</li>
              <li><strong>Worktree deletion.</strong> Removing a worktree drops its mirror state and any active sandbox. Chat history + tasks are preserved (you can opt to wipe those individually).</li>
              <li><strong>Data export.</strong> Export your chats, tasks, and worktree manifest at any time as JSON.</li>
            </ul>

            <h2 id="faq">FAQ</h2>
            <h3>Do you read my code?</h3>
            <p>
              No. Source code lives encrypted, scoped per user, behind RLS.
              An engineer with database access sees ciphertext, not your
              files. Decrypting requires separate access to the KMS, which
              is audited.
            </p>
            <h3>What happens if my Mac is offline?</h3>
            <p>
              Your daemon queues operations locally and resyncs when it
              reconnects. If you can&apos;t bring local back, switch the worktree
              to cloud — the encrypted mirror lets the sandbox pick up exactly
              where you left off.
            </p>
            <h3>Can I bring my own API key?</h3>
            <p>
              Yes. In cloud mode you can configure an Anthropic or OpenAI
              key on the project. That way we never see the tokens you spend.
            </p>
            <h3>Can I self-host?</h3>
            <p>
              Not yet. Enterprise self-hosted is on the roadmap once we hit
              compliance milestones (SOC 2 / ISO 27001). Until then, talk to
              us about a private deployment if you have a specific need.
            </p>
            <h3>What region is my data stored in?</h3>
            <p>
              Currently AWS us-west-2 (via Supabase Postgres). EU residency is
              planned alongside enterprise.
            </p>
          </article>
        </div>
      </main>
    </>
  )
}
