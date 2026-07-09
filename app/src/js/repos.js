const Repos = {
  _repos: [],
  _filter: 'all',
  _sort: 'name',

  async scan(folderPath) {
    const settings = Store.getSettings();
    const repos = await window.gitguise.repos.scan({
      folderPath,
      depth: settings.repoScanDepth,
    });
    this._repos = repos;
    return repos;
  },

  getRepos() {
    return this._repos;
  },

  setFilter(filter) {
    this._filter = filter;
  },

  setSort(sort) {
    this._sort = sort;
  },

  getFilteredRepos() {
    let repos = [...this._repos];
    if (this._filter !== 'all') {
      if (this._filter === 'unknown') {
        repos = repos.filter((r) => !r.detectedProfile);
      } else {
        repos = repos.filter((r) => r.detectedProfile?.label === this._filter);
      }
    }
    repos.sort((a, b) => {
      if (this._sort === 'name') return a.name.localeCompare(b.name);
      if (this._sort === 'modified') return (b.lastModified || '').localeCompare(a.lastModified || '');
      if (this._sort === 'profile') {
        const pa = a.detectedProfile?.displayName || 'zzz';
        const pb = b.detectedProfile?.displayName || 'zzz';
        return pa.localeCompare(pb);
      }
      return 0;
    });
    return repos;
  },

  async switchProfile(repoPath, profileId) {
    const confirmed = await showConfirmModal({
      title: 'Switch Profile',
      description: 'This will update git user.email, user.name, and the remote URL for this repo.',
      confirmText: 'Switch',
    });
    if (!confirmed) return null;
    const result = await window.gitguise.repos.switchProfile({ repoPath, profileId });
    const idx = this._repos.findIndex((r) => r.path === repoPath);
    if (idx >= 0) this._repos[idx] = result;
    showToast('Profile switched', 'success');
    return result;
  },

  async push(repoPath, terminalEl) {
    const streamId = createStreamId();
    const confirmed = await showConfirmModal({
      title: 'Push to Remote',
      description: 'This will run: git push',
      confirmText: 'Push',
    });
    if (!confirmed) return null;

    return new Promise((resolve) => {
      attachTerminal(streamId, terminalEl, ({ exitCode, output }) => {
        if (exitCode === 0) showToast('Push successful', 'success');
        else showToast('Push failed', 'error');
        resolve({ exitCode, output });
      });
      window.gitguise.repos.push({ repoPath, streamId });
    });
  },

  showSwitchModal(repo, profiles, onSwitch) {
    const form = document.createElement('div');
    form.innerHTML = `
      <p style="margin-bottom:12px;color:var(--text-muted)">Select a profile for <strong>${escapeHtml(repo.name)}</strong></p>
      <div class="form-group">
        <select id="switch-profile-select">
          ${profiles.map((p) => `<option value="${p.id}" ${repo.profileId === p.id ? 'selected' : ''}>${escapeHtml(p.displayName)} (${escapeHtml(p.email)})</option>`).join('')}
        </select>
      </div>
    `;
    const modal = showModal({
      title: 'Switch Profile',
      body: form,
      footer: `
        <button class="btn btn-ghost" id="switch-cancel">Cancel</button>
        <button class="btn btn-primary" id="switch-ok">Switch</button>
      `,
    });
    document.getElementById('switch-cancel').onclick = () => modal.close();
    document.getElementById('switch-ok').onclick = async () => {
      const profileId = form.querySelector('#switch-profile-select').value;
      const result = await Repos.switchProfile(repo.path, profileId);
      modal.close();
      if (onSwitch) onSwitch(result);
    };
  },

  showPushModal(repo) {
    const body = document.createElement('div');
    body.innerHTML = `
      <p style="margin-bottom:12px;color:var(--text-muted)">Pushing <strong>${escapeHtml(repo.name)}</strong></p>
      <div class="terminal-box" id="push-terminal"></div>
    `;
    const modal = showModal({
      title: 'Git Push',
      body,
      footer: '<button class="btn btn-ghost" id="push-close">Close</button>',
    });
    document.getElementById('push-close').onclick = () => modal.close();
    Repos.push(repo.path, body.querySelector('#push-terminal'));
  },

  renderRepoCard(repo) {
    const profile = repo.detectedProfile;
    const color = profile?.color || '#888';
    return `
      <div class="repo-card" data-path="${escapeHtml(repo.path)}">
        <div class="repo-card-header">
          <span class="profile-dot" style="background:${color}"></span>
          <h3>${escapeHtml(repo.name)}</h3>
          <span class="repo-branch">${escapeHtml(repo.branch || 'no branch')}</span>
          ${!profile ? '<span class="badge badge-unknown">Unknown</span>' : ''}
        </div>
        <div class="repo-card-profile">
          ${profile ? `<span class="profile-dot" style="background:${color}"></span> ${escapeHtml(profile.email)}` : '<span class="text-muted">No profile detected</span>'}
        </div>
        <div class="repo-card-remote">${escapeHtml(repo.remote || 'No remote')}</div>
        <div class="repo-card-actions">
          <button class="btn btn-sm" data-action="switch">Switch Profile</button>
          <button class="btn btn-sm" data-action="push">Push</button>
          <button class="btn btn-sm" data-action="terminal">Open Terminal</button>
          <button class="btn btn-sm" data-action="folder">Open Folder</button>
        </div>
      </div>
    `;
  },

  renderSkeleton(count = 3) {
    return Array(count).fill('<div class="skeleton repo-skeleton"></div>').join('');
  },
};
