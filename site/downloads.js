/* Fills the download buttons from the newest GitHub release, so the page never
   points at the installer of a version that has been superseded.

   Every anchor carries data-download="mac" or "win"; the text it shows is
   rewritten from the asset that was found. If the request fails (offline, rate
   limited, no release yet) the buttons fall back to the releases page instead of
   linking a file name that may not exist. */
(() => {
  const REPO = 'HybridRCG/PopBar';
  const RELEASES = `https://github.com/${REPO}/releases/latest`;

  const anchorsFor = (kind) => Array.from(document.querySelectorAll(`[data-download="${kind}"]`));

  function megabytes(bytes) {
    return `${Math.round(Number(bytes) / (1024 * 1024))} MB`;
  }

  /** Rewrites one download button: its href, its label and its sub-label. */
  function apply(kind, asset, release, meta) {
    for (const anchor of anchorsFor(kind)) {
      const label = anchor.querySelector('[data-role="label"]');
      const sub = anchor.querySelector('[data-role="meta"]');
      if (asset) {
        anchor.href = asset.browser_download_url;
        anchor.removeAttribute('title');
        // A card shows the file name; the hero shows what it is for.
        if (label) label.textContent = label.dataset.card ? asset.name : label.dataset.hero || label.textContent;
        if (sub && asset.size) sub.textContent = meta(asset);
        anchor.dataset.file = asset.name;
      } else {
        anchor.href = RELEASES;
        anchor.title = 'No installer for this platform in the newest release';
        if (label && label.dataset.card) label.textContent = 'See all releases';
        if (sub) sub.textContent = 'open the releases page';
      }
    }
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
  }

  async function load() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const release = await response.json();
      const assets = Array.isArray(release.assets) ? release.assets : [];
      const find = (extension) => assets.find((a) => String(a.name).toLowerCase().endsWith(extension));
      const mac = find('.dmg');
      const win = find('.exe');
      if (!mac && !win) throw new Error('no installers in the newest release');

      apply('mac', mac, release, (a) => `12+ · Apple Silicon & Intel · ${megabytes(a.size)}`);
      apply('win', win, release, (a) => `10 / 11 · 64-bit · ${megabytes(a.size)}`);

      const version = String(release.tag_name || '').replace(/^v/, '');
      for (const node of document.querySelectorAll('[data-version]')) {
        node.textContent = version || node.textContent;
      }
      for (const link of document.querySelectorAll('[data-release-link]')) {
        link.href = release.html_url || RELEASES;
      }
      document.documentElement.dataset.downloads = 'live';
    } catch (error) {
      fallback();
      document.documentElement.dataset.downloads = 'fallback';
      // Visible in the console only; the page still works, it just links the
      // releases page rather than a specific file.
      console.warn('PopBar site: using the releases page for downloads —', error && error.message);
    } finally {
      clearTimeout(timer);
    }
  }

  // Exposed so the fallback can be exercised without breaking the network.
  window.popbarDownloads = { load, fallback };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
