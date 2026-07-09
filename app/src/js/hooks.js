const Hooks = {
  async getPreview(profiles, settings) {
    return window.gitguise.hooks.preview(profiles, settings);
  },

  async writeAll() {
    const confirmed = await showConfirmModal({
      title: 'Apply Hooks',
      description: 'This will write the pre-push hook and append the git() wrapper to your shell config file.',
      confirmText: 'Apply Hooks',
    });
    if (!confirmed) return null;
    const result = await window.gitguise.hooks.writeAll();
    await Store.set('hooksStale', false);
    showToast(`Hooks applied to ${result.written.length} file(s)`, 'success');
    return result;
  },

  async removeAll() {
    const confirmed = await showConfirmModal({
      title: 'Remove All Hooks',
      description: 'This will remove the pre-push hook and strip the git() wrapper from your shell config.',
      confirmText: 'Remove All',
      danger: true,
    });
    if (!confirmed) return null;
    const result = await window.gitguise.hooks.removeAll();
    showToast('Hooks removed', 'success');
    return result;
  },

  async getStatus() {
    return window.gitguise.hooks.getStatus();
  },

  async regenerate() {
    const result = await window.gitguise.hooks.regenerate();
    await Store.set('hooksStale', false);
    showToast('Hooks regenerated', 'success');
    return result;
  },

  renderHookCards(container, settings, _preview, platform) {
    const hookSettings = settings.hooks || {};
    const shellFile = platform?.shellConfigFile || '~/.bashrc';

    container.innerHTML = `
      <p class="hook-file-note">Shell config: ${escapeHtml(shellFile)}</p>
      <div class="hook-cards">
        ${this.renderHookCard('prePush', 'Auto-detect on push', 'When you run git push, GitGuise detects the right account from your remote URL and switches automatically. Only asks if it can\'t tell.', hookSettings.prePush !== false)}
        ${this.renderHookCard('gitInit', 'Profile prompt on init', 'After git init, you\'ll be asked which account this repo belongs to. Sets your email and name automatically.', hookSettings.gitInit !== false)}
        ${this.renderHookCard('gitRemoteAdd', 'Auto-convert remote URLs', 'When you paste a GitHub HTTPS URL into git remote add, it\'s automatically converted to the correct SSH format for the chosen account.', hookSettings.gitRemoteAdd !== false)}
      </div>
    `;

    container.querySelectorAll('[data-hook-toggle]').forEach((toggle) => {
      toggle.addEventListener('change', async (e) => {
        const key = e.target.dataset.hookToggle;
        const settings = Store.getSettings();
        settings.hooks[key] = e.target.checked;
        await Store.set('settings', settings);
      });
    });
  },

  renderHookCard(id, title, description, enabled) {
    return `
      <div class="hook-card">
        <div class="hook-card-header">
          <div>
            <h4>${escapeHtml(title)}</h4>
            <p>${escapeHtml(description)}</p>
          </div>
          <label class="toggle">
            <input type="checkbox" data-hook-toggle="${id}" ${enabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    `;
  },
};
