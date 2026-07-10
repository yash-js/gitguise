fetch('https://api.github.com/repos/yash-js/gitguise')
  .then((r) => r.json())
  .then((repo) => {
    const starEl = document.getElementById('star-count');
    if (starEl && repo.stargazers_count !== undefined) {
      starEl.textContent = `★ ${repo.stargazers_count}`;
    }
  })
  .catch(() => {});

const releasesUrl = 'https://github.com/yash-js/gitguise/releases';

async function fetchJson(url) {
  const r = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.json();
}

function pickAssetUrl(assets, predicate) {
  const a = (assets || []).find(predicate);
  return a?.browser_download_url || '';
}

async function getBestReleaseForDownloads() {
  // Prefer a release that actually has installer assets attached.
  // Stable releases may exist without assets if build/upload is still running.
  const candidates = [];
  try {
    candidates.push(await fetchJson('https://api.github.com/repos/yash-js/gitguise/releases/tags/edge'));
  } catch {
    /* ignore */
  }
  try {
    candidates.push(await fetchJson('https://api.github.com/repos/yash-js/gitguise/releases/latest'));
  } catch {
    /* ignore */
  }
  for (const r of candidates) {
    const assets = r?.assets || [];
    const hasInstallers = assets.some((a) =>
      a?.name?.endsWith('.exe') ||
      a?.name?.endsWith('.dmg') ||
      a?.name?.endsWith('.AppImage') ||
      a?.name?.endsWith('.deb')
    );
    if (hasInstallers) return r;
  }
  // Fallback: if neither has installers, return the latest candidate (if any).
  return candidates[0] || candidates[1] || null;
}

function deriveDisplayVersion(release) {
  const tag = release?.tag_name || '';
  // Prefer a clean semver tag like "v0.2.1".
  if (/^v?\d+\.\d+\.\d+/.test(tag)) return tag.startsWith('v') ? tag : `v${tag}`;
  // Otherwise try to parse a version out of the release name (e.g. "GitGuise v0.2.0 (edge-...)").
  const m = (release?.name || '').match(/v?\d+\.\d+\.\d+/);
  if (m) return m[0].startsWith('v') ? m[0] : `v${m[0]}`;
  return '';
}

getBestReleaseForDownloads()
  .then((release) => {
    if (!release) throw new Error('no release');

    const version = deriveDisplayVersion(release);

    if (version) {
      document.querySelectorAll('.version-badge').forEach((el) => {
        // Hero badge stays "free & open source"; only version-only badges get the tag.
        if (!el.textContent.includes('free')) el.textContent = version;
      });
    }

    const windowsUrl = pickAssetUrl(release.assets, (a) => a?.name?.endsWith('.exe'));
    const macUrl = pickAssetUrl(release.assets, (a) => a?.name?.endsWith('.dmg'));
    // Prefer .deb for Linux (more reliable on Ubuntu/Debian), fall back to AppImage.
    const debUrl = pickAssetUrl(release.assets, (a) => a?.name?.endsWith('.deb'));
    const appImageUrl = pickAssetUrl(release.assets, (a) => a?.name?.endsWith('.AppImage'));
    const linuxUrl = debUrl || appImageUrl;

    const setBtn = (id, url) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      if (url) {
        btn.href = url;
        btn.target = '_blank';
        btn.rel = 'noopener';
      } else {
        btn.href = releasesUrl;
        btn.removeAttribute('target');
        btn.removeAttribute('rel');
      }
    };

    setBtn('btn-windows-2', windowsUrl);
    setBtn('btn-mac-2', macUrl);
    setBtn('btn-linux-2', linuxUrl);

    // Secondary Linux link (AppImage) when we defaulted the main button to .deb.
    const linuxAlt = document.getElementById('btn-linux-appimage');
    if (linuxAlt) {
      if (debUrl && appImageUrl) {
        linuxAlt.href = appImageUrl;
        linuxAlt.target = '_blank';
        linuxAlt.rel = 'noopener';
        linuxAlt.hidden = false;
      } else {
        linuxAlt.hidden = true;
      }
    }

    // If a release exists but doesn't have matching assets yet, never leave links as "#".
    document.querySelectorAll('.download-btn').forEach((btn) => {
      if (!btn.href || btn.getAttribute('href') === '#') btn.href = releasesUrl;
    });
  })
  .catch(() => {
    document.querySelectorAll('.download-btn').forEach((btn) => {
      btn.href = releasesUrl;
    });
  });

// Auto-detect the visitor's OS and highlight the matching platform card.
(function highlightDetectedOS() {
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const hint = `${ua} ${platform}`.toLowerCase();

  let cardId = null;
  if (/windows|win32|win64/.test(hint)) cardId = 'card-windows';
  else if (/mac|iphone|ipad|ipod/.test(hint)) cardId = 'card-mac';
  else if (/linux|x11|ubuntu|debian|fedora|cros/.test(hint)) cardId = 'card-linux';

  if (!cardId) return;
  const card = document.getElementById(cardId);
  if (!card) return;

  card.classList.add('detected');
  const badge = card.querySelector('.recommended-badge');
  if (badge) badge.hidden = false;
})();
