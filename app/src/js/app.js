const App = {
  platform: null,

  async init() {
    this.platform = await window.gitguise.app.getPlatform();

    if (this.platform.isWindows && !this.platform.gitBashPath) {
      this.showGitBashError();
      return;
    }

    this.setupTitlebar();
    this.setupNavigation();
    this.setupKeyboard();
    this.setupModalEscape();

    await Store.load();

    const version = await window.gitguise.app.getVersion();
    const versionEl = document.getElementById('app-version');
    if (versionEl) versionEl.textContent = `v${version}`;

    if (Store.isWizardCompleted()) {
      Wizard.hide();
      Dashboard.show();
      await Dashboard.render();
      this.autoDetectProfiles();
    } else {
      await Wizard.init();
    }
  },

  async autoDetectProfiles() {
    try {
      const res = await window.gitguise.system.detectProfiles();
      const detected = res?.profiles || [];
      if (!detected.length) return;

      const existing = Store.getProfiles();
      let added = 0;
      let updated = 0;

      for (const d of detected) {
        const match = existing.find((e) =>
          (d.email && e.email === d.email) ||
          (d.sshHostAlias && e.sshHostAlias === d.sshHostAlias));
        if (match) {
          if (d.githubUsername && !match.githubUsername) {
            await Profiles.save({ ...match, githubUsername: d.githubUsername });
            updated++;
          }
        } else {
          await Profiles.save({ ...d, id: undefined });
          added++;
        }
      }

      if (!added && !updated) return;
      await Store.refresh();
      await Dashboard.render();
      const parts = [];
      if (added) parts.push(`added ${added}`);
      if (updated) parts.push(`updated ${updated}`);
      showToast(`Profiles ${parts.join(' & ')} from your system`, 'success');
    } catch {
      /* detection is best-effort */
    }
  },

  showGitBashError() {
    document.getElementById('git-bash-error').classList.remove('hidden');
    document.getElementById('wizard').classList.add('hidden');
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('git-download-link').addEventListener('click', (e) => {
      e.preventDefault();
      window.gitguise.app.openUrl('https://git-scm.com/download/win');
    });
  },

  setupTitlebar() {
    const titlebar = document.getElementById('titlebar');
    if (!this.platform.isMac) {
      titlebar.classList.remove('hidden');
      document.body.classList.add('has-titlebar');
      document.getElementById('btn-minimize').addEventListener('click', () => window.gitguise.window.minimize());
      document.getElementById('btn-maximize').addEventListener('click', () => window.gitguise.window.maximize());
      document.getElementById('btn-close').addEventListener('click', () => window.gitguise.window.close());
    }
  },

  setupNavigation() {
    document.getElementById('sidebar-nav').addEventListener('click', (e) => {
      const item = e.target.closest('.nav-item');
      if (!item) return;
      Dashboard.switchTab(item.dataset.tab);
    });
  },

  setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      const mod = e.metaKey || e.ctrlKey;

      if (e.key === 'Escape') {
        const overlay = document.getElementById('modal-overlay');
        if (!overlay.classList.contains('hidden')) {
          overlay.classList.add('hidden');
        }
        return;
      }

      if (!mod) return;

      if (e.key === ',') {
        e.preventDefault();
        if (!document.getElementById('dashboard').classList.contains('hidden')) {
          Dashboard.switchTab('settings');
        }
      }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        if (!document.getElementById('dashboard').classList.contains('hidden')) {
          Dashboard.switchTab('profiles');
          Profiles.showFormModal(null, () => Dashboard.render());
        }
      }
      if (e.key === 'r' || e.key === 'R') {
        if (Dashboard.currentTab === 'repos') {
          e.preventDefault();
          Dashboard.scanRepos();
        }
      }
    });
  },

  setupModalEscape() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.getElementById('modal-overlay')?.classList.add('hidden');
      }
    });
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
