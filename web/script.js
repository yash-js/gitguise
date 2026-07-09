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
      a?.name?.endsWith('.exe') || a?.name?.endsWith('.dmg') || a?.name?.endsWith('.AppImage')
    );
    if (hasInstallers) return r;
  }
  // Fallback: if neither has installers, return the latest candidate (if any).
  return candidates[0] || candidates[1] || null;
}

getBestReleaseForDownloads()
  .then((release) => {
    if (!release) throw new Error('no release');

    const version = release?.tag_name;
    if (!version) return;

    document.querySelectorAll('.version-badge').forEach((el) => {
      el.textContent = el.textContent.includes('free')
        ? `${version} — free & open source`
        : version;
    });

    const windowsUrl = pickAssetUrl(release.assets, (a) => a?.name?.endsWith('.exe'));
    const macUrl = pickAssetUrl(release.assets, (a) => a?.name?.endsWith('.dmg'));
    const linuxUrl = pickAssetUrl(release.assets, (a) => a?.name?.endsWith('.AppImage'));

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

    // If a release exists but doesn't have matching assets yet, never leave links as "#".
    document.querySelectorAll('.download-btn').forEach((btn) => {
      if (!btn.href || btn.getAttribute('href') === '#') btn.href = releasesUrl;
    });

    const ua = navigator.userAgent;
    const primaryId = ua.includes('Win')
      ? 'btn-windows-2'
      : ua.includes('Mac')
        ? 'btn-mac-2'
        : ua.includes('Linux')
          ? 'btn-linux-2'
          : null;
    if (primaryId) {
      const el = document.getElementById(primaryId);
      if (el && el.href && !el.href.endsWith('#') && el.href !== releasesUrl) {
        el.classList.add('primary');
      }
    }
  })
  .catch(() => {
    document.querySelectorAll('.download-btn').forEach((btn) => {
      btn.href = releasesUrl;
    });
  });
