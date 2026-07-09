fetch('https://api.github.com/repos/yash-js/gitguise')
  .then((r) => r.json())
  .then((repo) => {
    const starEl = document.getElementById('star-count');
    if (starEl && repo.stargazers_count !== undefined) {
      starEl.textContent = `★ ${repo.stargazers_count}`;
    }
  })
  .catch(() => {});

fetch('https://api.github.com/repos/yash-js/gitguise/releases/latest')
  .then((r) => r.json())
  .then((release) => {
    const version = release?.tag_name;
    if (!version) return;

    document.querySelectorAll('.version-badge').forEach((el) => {
      el.textContent = el.textContent.includes('free')
        ? `${version} — free & open source`
        : version;
    });

    release.assets.forEach((asset) => {
      if (asset.name.endsWith('.exe')) {
        const btn = document.getElementById('btn-windows-2');
        if (btn) btn.href = asset.browser_download_url;
      }
      if (asset.name.endsWith('.dmg')) {
        const btn = document.getElementById('btn-mac-2');
        if (btn) btn.href = asset.browser_download_url;
      }
      if (asset.name.endsWith('.AppImage')) {
        const btn = document.getElementById('btn-linux-2');
        if (btn) btn.href = asset.browser_download_url;
      }
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
      document.getElementById(primaryId)?.classList.add('primary');
    }
  })
  .catch(() => {
    document.querySelectorAll('.download-btn').forEach((btn) => {
      btn.href = 'https://github.com/yash-js/gitguise/releases';
    });
  });
