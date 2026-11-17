/* Fills the download buttons from web/downloads.json, which is written by
   `node scripts/make-manifest.js` when a release is published.

   That file exists for two reasons: the GitHub API allows 60 unauthenticated
   requests an hour per IP address, after which every visitor on that network
   silently got "See all releases"; and the release API knows the SHA-256 of each
   uploaded file, so the page can show a checksum nobody copied by hand.

   Order of preference:
     1. downloads.json (same origin, no rate limit, carries checksums)
     2. api.github.com (works even if nobody re-ran the manifest script)
     3. the releases page (no file name that might not exist)

   The button text never shows a version — it is fixed in the HTML — so it cannot
   go stale; only the href, the size and the checksum come from the release. */
(() => {
  const REPO = 'HybridRCG/PopBar';
  const RELEASES = `https://github.com/${REPO}/releases/latest`;
  const MANIFEST = 'downloads.json';

  const anchorsFor = (kind) => Array.from(document.querySelectorAll(`[data-download="${kind}"]`));

  function megabytes(bytes) {
    return `${Math.round(Number(bytes) / (1024 * 1024))} MB`;
  }

  /** Accepts either an API asset or a manifest entry. */
  function asAsset(asset) {
    if (!asset) return null;
    return {
      name: asset.name,
      url: asset.url || asset.browser_download_url,
      size: asset.size,
      sha256: asset.sha256 || String(asset.digest || '').replace(/^sha256:/, '') || null,
    };
  }

  /** Points one download button at the newest installer and fills its sub-label. */
  function apply(kind, asset, meta) {
    for (const anchor of anchorsFor(kind)) {
      const sub = anchor.querySelector('[data-role="meta"]');
      if (asset && asset.url) {
        anchor.href = asset.url;
        anchor.removeAttribute('title');
        if (sub && asset.size) sub.textContent = meta(asset);
        anchor.dataset.file = asset.name;
      } else {
        anchor.href = RELEASES;
        anchor.title = 'No installer for this platform in the newest release';
        const label = anchor.querySelector('[data-role="label"]');
        if (label) label.textContent = 'See all releases';
        if (sub) sub.textContent = 'open the releases page';
      }
    }
  }

  /** Shows the checksum, shortened, with the whole thing in the title. */
  function paintChecksums(assets) {
    for (const node of document.querySelectorAll('[data-sha]')) {
      const asset = assets[node.dataset.sha];
      if (!asset || !asset.sha256) {
        node.textContent = 'in the release notes';
        continue;
      }
      node.textContent = `${asset.sha256.slice(0, 16)}…`;
      node.title = asset.sha256;
      node.dataset.full = asset.sha256;
    }
  }

  function paint(version, releaseUrl, mac, win) {
    apply('mac', mac, (a) => `12+ · Apple Silicon & Intel · ${megabytes(a.size)}`);
    apply('win', win, (a) => `10 / 11 · 64-bit · ${megabytes(a.size)}`);
    paintChecksums({ mac, win });

    for (const node of document.querySelectorAll('[data-version]')) {
      if (version) node.textContent = version;
    }
    for (const link of document.querySelectorAll('[data-release-link]')) {
      link.href = releaseUrl || RELEASES;
    }
    document.documentElement.dataset.downloads = 'live';
  }

  function fallback() {
    for (const anchor of document.querySelectorAll('[data-download]')) {
      anchor.href = RELEASES;
      const label = anchor.querySelector('[data-role="label"]');
      const sub = anchor.querySelector('[data-role="meta"]');
      if (label) label.textContent = 'See all releases';
      if (sub) sub.textContent = 'GitHub';
    }
    for (const link of document.querySelectorAll('[data-release-link]')) link.href = RELEASES;
    document.documentElement.dataset.downloads = 'fallback';
  }

  async function readManifest() {
    // A timestamp in the query, because the host caches everything and the
    // manifest changes after every release.
    const response = await fetch(`${MANIFEST}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`manifest HTTP ${response.status}`);
    const manifest = await response.json();
    const mac = asAsset(manifest.assets && manifest.assets.mac);
    const win = asAsset(manifest.assets && manifest.assets.win);
    if (!mac && !win) throw new Error('manifest has no installers');
    return { version: manifest.version, releaseUrl: manifest.release, mac, win };
  }

  async function readApi() {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const release = await response.json();
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const find = (extension) => assets.find((a) => String(a.name).toLowerCase().endsWith(extension));
    const mac = asAsset(find('.dmg'));
    const win = asAsset(find('.exe'));
    if (!mac && !win) throw new Error('no installers in the newest release');
    return {
      version: String(release.tag_name || '').replace(/^v/, ''),
      releaseUrl: release.html_url,
      mac,
      win,
    };
  }

  async function load() {
    const problems = [];
    for (const source of [readManifest, readApi]) {
      try {
        const data = await source();
        paint(data.version, data.releaseUrl, data.mac, data.win);
        return;
      } catch (error) {
        problems.push(`${source.name}: ${error && error.message}`);
      }
    }
    fallback();
    // Visible in the console only; the page still works, it just links the
    // releases page rather than a specific file.
    console.warn('PopBar site: using the releases page for downloads —', problems.join('; '));
  }

  // Exposed so the fallback can be exercised without breaking the network.
  window.popbarDownloads = { load, fallback };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
