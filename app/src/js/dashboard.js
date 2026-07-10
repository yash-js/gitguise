const Dashboard = {
  currentTab: 'dashboard',

  show() {
    document.getElementById('dashboard').classList.remove('hidden');
    document.getElementById('wizard').classList.add('hidden');
  },

  hide() {
    document.getElementById('dashboard').classList.add('hidden');
  },

  async render() {
    this.renderSidebar();
    this.renderTab(this.currentTab);
  },

  renderSidebar() {
    const profiles = Store.getProfiles();
    const container = document.getElementById('sidebar-profiles');
    container.innerHTML = profiles.map((p) => `
      <div class="sidebar-profile-pill">
        <span class="profile-dot" style="background:${p.color}"></span>
        <div style="overflow:hidden">
          <div class="pill-name">${escapeHtml(p.displayName)}</div>
          <div class="pill-email">${escapeHtml(p.email)}</div>
        </div>
      </div>
    `).join('');
  },

  switchTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll('.nav-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.tab === tab);
    });
    const titles = { dashboard: 'Dashboard', profiles: 'Profiles', repos: 'Repos', settings: 'Settings', docs: 'Docs' };
    document.getElementById('page-title').textContent = titles[tab] || tab;
    this.renderTab(tab);
  },

  renderTab(tab) {
    const content = document.getElementById('content');
    switch (tab) {
      case 'dashboard': this.renderDashboardTab(content); break;
      case 'profiles': this.renderProfilesTab(content); break;
      case 'repos': this.renderReposTab(content); break;
      case 'settings': this.renderSettingsTab(content); break;
      case 'docs': this.renderDocsTab(content); break;
    }
  },

  renderDocsTab(container) {
    container.innerHTML = `
      <div class="docs-page">
        <div class="docs-hero">
          <h2>Terminal workflows</h2>
          <p class="text-muted">GitGuise configures SSH aliases + optional git wrappers so you can use multiple GitHub identities from your normal terminal — without constantly changing <span class="kbd">user.email</span> or getting SSH keys mixed up.</p>
        </div>

        <div class="docs-grid">
          <aside class="docs-nav">
            <a href="#docs-what">What setup changed</a>
            <a href="#docs-add">Add a profile</a>
            <a href="#docs-alias">SSH aliases (core idea)</a>
            <a href="#docs-clone">Clone the right way</a>
            <a href="#docs-existing">Fix existing repos</a>
            <a href="#docs-push">Push: auto-detect</a>
            <a href="#docs-init">New repo: init & remote add</a>
            <a href="#docs-verify">Verify everything works</a>
            <a href="#docs-faq">FAQ</a>
            <a href="#docs-trouble">Troubleshooting</a>
          </aside>

          <main class="docs-content">
            <section class="docs-card" id="docs-what">
              <h3>What setup changed on your machine</h3>
              <ul>
                <li><strong>SSH keys</strong> per profile in <span class="kbd">~/.ssh/</span> (for example <span class="kbd">id_ed25519_work</span>)</li>
                <li><strong>SSH config</strong> adds one <span class="kbd">Host</span> alias per profile in <span class="kbd">~/.ssh/config</span> (for example <span class="kbd">Host github-work</span>)</li>
                <li><strong>Hooks / wrappers</strong> (optional) help git commands pick the right identity automatically</li>
              </ul>
              <p class="text-muted">After this, the most important rule is: <strong>your repo remotes should use the alias host</strong>.</p>
            </section>

            <section class="docs-card" id="docs-add">
              <h3>Add a profile (auto keys + GitHub)</h3>
              <p class="text-muted">When you add a profile, GitGuise sets everything up locally for you:</p>
              <ul>
                <li>Generates an SSH key (<span class="kbd">~/.ssh/id_ed25519_&lt;label&gt;</span>) if one doesn't exist</li>
                <li>Writes the matching <span class="kbd">Host</span> alias into <span class="kbd">~/.ssh/config</span></li>
                <li>Copies the new public key and opens GitHub's <span class="kbd">New SSH key</span> page</li>
              </ul>
              <p class="text-muted">The only manual step is pasting the key into GitHub:</p>
              <pre class="code">GitHub → Settings → SSH and GPG keys → New SSH key
Title:     &lt;your label&gt;
Key type:  Authentication Key
Paste (Ctrl/Cmd + V) → Add SSH key</pre>
              <p class="text-muted">The key is already on your clipboard. After adding it, use <span class="kbd">Test</span> on the profile — you should see <span class="kbd">Hi &lt;username&gt;!</span>.</p>
              <p class="text-muted">Prefer the terminal? You can print the public key yourself:</p>
              <pre class="code">cat ~/.ssh/id_ed25519_&lt;label&gt;.pub</pre>
            </section>

            <section class="docs-card" id="docs-alias">
              <h3>SSH aliases (core idea)</h3>
              <p class="text-muted">Each profile gets an SSH alias like <span class="kbd">github-work</span>. The alias chooses the SSH key — which is how GitHub knows which account you're using.</p>
              <pre class="code"># ~/.ssh/config (example)
Host github-work
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_work</pre>
              <p class="text-muted">When your remote is <span class="kbd">git@github-work:OWNER/REPO.git</span>, pushes/auth always use the <span class="kbd">id_ed25519_work</span> key.</p>
            </section>

            <section class="docs-card" id="docs-clone">
              <h3>Clone the right way</h3>
              <p class="text-muted">Use the alias in the clone URL.</p>
              <pre class="code">git clone git@github-work:OWNER/REPO.git
# or
git clone git@github-personal:OWNER/REPO.git</pre>
              <p class="text-muted">If you only have an HTTPS URL, convert it:</p>
              <pre class="code">https://github.com/OWNER/REPO.git
→
git@github-work:OWNER/REPO.git</pre>
            </section>

            <section class="docs-card" id="docs-existing">
              <h3>Fix existing repos</h3>
              <p class="text-muted">Inside any repo, check remote + identity:</p>
              <pre class="code">git remote -v
git config user.email
git config user.name</pre>
              <p class="text-muted">If <span class="kbd">origin</span> is HTTPS, switch it to an alias:</p>
              <pre class="code">git remote set-url origin git@github-work:OWNER/REPO.git</pre>
              <p class="text-muted">Then set the repo identity (local config):</p>
              <pre class="code">git config user.email "yash@company.com"
git config user.name "Work"</pre>
            </section>

            <section class="docs-card" id="docs-push">
              <h3>Push: auto-detect</h3>
              <p class="text-muted">If <strong>Auto-detect on push</strong> is enabled, the hook checks your <span class="kbd">origin</span> URL:</p>
              <ul>
                <li>If it contains a known alias (like <span class="kbd">github-work</span>), it ensures the correct <span class="kbd">user.email</span>/<span class="kbd">user.name</span> and continues.</li>
                <li>If it’s HTTPS/unknown, it shows an interactive selector in the terminal so you can choose an identity.</li>
              </ul>
              <pre class="code">git push</pre>
            </section>

            <section class="docs-card" id="docs-init">
              <h3>New repo: init & remote add</h3>
              <p class="text-muted">If wrappers are enabled:</p>
              <ul>
                <li><span class="kbd">git init</span> will prompt you for an identity and set local git config.</li>
                <li><span class="kbd">git remote add</span> can convert GitHub HTTPS URLs into the right SSH alias format.</li>
              </ul>
              <pre class="code">git init
git remote add origin https://github.com/OWNER/REPO.git</pre>
            </section>

            <section class="docs-card" id="docs-verify">
              <h3>Verify everything works</h3>
              <p class="text-muted">Test SSH for an alias (should print a success/“Hi …” message):</p>
              <pre class="code">ssh -T git@github-work</pre>
              <p class="text-muted">Confirm your remote uses an alias:</p>
              <pre class="code">git remote get-url origin
# expected: git@github-...:OWNER/REPO.git</pre>
            </section>

            <section class="docs-card" id="docs-faq">
              <h3>FAQ</h3>
              <p class="text-muted"><strong>Does GitGuise change global git config?</strong> No — identity switching is done per-repo (local config) and by choosing the correct SSH key via host aliases.</p>
              <p class="text-muted"><strong>Do I need to keep the app open?</strong> No — hooks/wrappers are written to your shell/git hooks path (if enabled), so they work from the terminal even when the app is closed.</p>
              <p class="text-muted"><strong>Which identity will GitHub show on commits?</strong> It depends on the repo’s <span class="kbd">user.email</span> and what email is linked/verified on GitHub.</p>
            </section>

            <section class="docs-card" id="docs-trouble">
              <h3>Troubleshooting</h3>
              <p class="text-muted"><strong>Windows:</strong> GitGuise requires Git for Windows (Git Bash).</p>
              <pre class="code">https://git-scm.com/download/win</pre>
              <p class="text-muted"><strong>Fallback selector keeps appearing:</strong> your remote may be HTTPS. Convert it:</p>
              <pre class="code">git remote set-url origin git@github-work:OWNER/REPO.git</pre>
              <p class="text-muted"><strong>Wrong account on push:</strong> check the remote host and the repo identity:</p>
              <pre class="code">git remote get-url origin
git config user.email
git config user.name</pre>
            </section>
          </main>
        </div>
      </div>
    `;

    const nav = container.querySelector('.docs-nav');
    if (nav) {
      const links = Array.from(nav.querySelectorAll('a'));
      const sectionById = new Map(
        Array.from(container.querySelectorAll('.docs-card[id]')).map((el) => [el.id, el]),
      );

      const setActive = (id) => {
        if (!id) return;
        links.forEach((link) => {
          const linkId = link.getAttribute('href')?.slice(1);
          link.classList.toggle('active', linkId === id);
        });
      };

      // Initial active state: hash if valid, else first link.
      const initialIdFromHash = (location.hash || '').slice(1);
      const initialId = sectionById.has(initialIdFromHash)
        ? initialIdFromHash
        : (links[0]?.getAttribute('href')?.slice(1) || null);
      if (initialId) setActive(initialId);

      nav.addEventListener('click', (e) => {
        const a = e.target.closest('a');
        if (!a) return;
        e.preventDefault();

        const id = a.getAttribute('href')?.slice(1);
        if (id) setActive(id);
        const el = id ? container.querySelector(`#${CSS.escape(id)}`) : null;
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });

      // Keep active nav item in sync with scroll position.
      // This is deterministic and handles the last section correctly.
      const sections = Array.from(sectionById.values());
      if (sections.length) {
        let raf = 0;

        const getSectionTopInScroll = (sec) => {
          const secRect = sec.getBoundingClientRect();
          const rootRect = container.getBoundingClientRect();
          return (secRect.top - rootRect.top) + container.scrollTop;
        };

        const updateActiveFromScroll = () => {
          raf = 0;
          const anchor = container.scrollTop + 140;

          // If you're at the bottom, force last section active (common “Troubleshooting” case).
          const atBottom = (container.scrollTop + container.clientHeight) >= (container.scrollHeight - 2);
          if (atBottom) {
            setActive(sections[sections.length - 1].id);
            return;
          }

          let currentId = sections[0].id;
          for (const sec of sections) {
            const top = getSectionTopInScroll(sec);
            if (top <= anchor) currentId = sec.id;
            else break;
          }
          setActive(currentId);
        };

        container.addEventListener('scroll', () => {
          if (raf) return;
          raf = requestAnimationFrame(updateActiveFromScroll);
        }, { passive: true });

        updateActiveFromScroll();
      }
    }
  },

  renderDashboardTab(container) {
    const activities = (Store._cache?.recentActivity || []).slice(0, 10);
    container.innerHTML = `
      <div class="quick-actions">
        <button class="quick-action" data-action="clone">
          <i class="ti ti-download"></i>
          <h3>Clone Repo</h3>
          <p>Clone with the right SSH profile</p>
        </button>
        <button class="quick-action" data-action="add-profile">
          <i class="ti ti-user-plus"></i>
          <h3>Add Profile</h3>
          <p>Create a new GitHub identity</p>
        </button>
      </div>
      <div class="section-title">Recent Activity</div>
      <div class="activity-list">
        ${activities.length ? activities.map((a) => `
          <div class="activity-item">
            <span class="profile-dot" style="background:${a.color || '#888'}"></span>
            ${a.message
              ? `<span class="activity-action" style="color:var(--text)">${escapeHtml(a.message)}</span>`
              : `
                <span class="activity-profile">${escapeHtml(a.profileName || '')}</span>
                <span class="activity-action">${escapeHtml(a.action || '')}</span>
                <span class="activity-repo">${escapeHtml(a.repo || '')}</span>
              `}
            <span class="activity-time">${formatActivityTimestamp(a.timestamp)}</span>
          </div>
        `).join('') : '<div class="empty-state"><i class="ti ti-activity"></i><p>No recent activity</p></div>'}
      </div>
    `;

    container.querySelector('[data-action="clone"]')?.addEventListener('click', () => this.showCloneModal());
    container.querySelector('[data-action="add-profile"]')?.addEventListener('click', () => {
      this.switchTab('profiles');
      Profiles.showFormModal(null, () => { this.renderSidebar(); this.renderProfilesTab(container); });
    });
  },

  renderProfilesTab(container) {
    const profiles = Store.getProfiles();
    container.innerHTML = `
      <div class="profiles-header">
        <h2 style="font-size:18px">${profiles.length} Profile${profiles.length !== 1 ? 's' : ''}</h2>
        <button class="btn btn-primary" id="add-profile-btn">Add Profile +</button>
      </div>
      <div class="profiles-grid" id="profiles-grid">
        ${profiles.length ? profiles.map((p) => Profiles.renderCard(p)).join('') : '<div class="empty-state"><i class="ti ti-user"></i><p>No profiles yet</p></div>'}
      </div>
    `;

    document.getElementById('add-profile-btn')?.addEventListener('click', () => {
      Profiles.showFormModal(null, () => this.render());
    });

    container.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const profile = profiles.find((p) => p.id === id);
        if (btn.dataset.action === 'edit') {
          Profiles.showFormModal(profile, () => this.render());
        } else if (btn.dataset.action === 'delete') {
          await Profiles.delete(id);
          this.render();
        } else if (btn.dataset.action === 'test') {
          this.showTestModal(profile);
        } else if (btn.dataset.action === 'copy-key') {
          const key = await SSH.getPublicKey(profile.sshKeyName);
          if (key) {
            await window.gitguise.app.copyToClipboard(key);
            showToast('Public key copied', 'success');
          } else {
            showToast('No public key found', 'error');
          }
        }
      });
    });
  },

  async renderReposTab(container) {
    const lastFolder = Store._cache?.lastScannedFolder;
    container.innerHTML = `
      <div class="repos-toolbar">
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-primary" id="scan-folder-btn">Scan Folder</button>
          ${lastFolder ? `<span class="text-muted mono" style="font-size:11px">${escapeHtml(lastFolder)}</span>` : ''}
        </div>
        <div style="display:flex;gap:12px;align-items:center">
          <div class="filter-tabs" id="filter-tabs">
            ${['all', 'personal', 'work', 'freelance', 'other', 'unknown'].map((f) => `
              <button class="filter-tab ${Repos._filter === f ? 'active' : ''}" data-filter="${f}">${f.charAt(0).toUpperCase() + f.slice(1)}</button>
            `).join('')}
          </div>
          <div class="repos-sort">
            Sort:
            <select id="repos-sort">
              <option value="name" ${Repos._sort === 'name' ? 'selected' : ''}>Name</option>
              <option value="modified" ${Repos._sort === 'modified' ? 'selected' : ''}>Last modified</option>
              <option value="profile" ${Repos._sort === 'profile' ? 'selected' : ''}>Profile</option>
            </select>
          </div>
        </div>
      </div>
      <div class="repos-grid" id="repos-grid">
        ${Repos._repos.length ? Repos.getFilteredRepos().map((r) => Repos.renderRepoCard(r)).join('') : `
          <div class="empty-state">
            <i class="ti ti-folder"></i>
            <p>${lastFolder ? 'No repos found in scanned folder' : 'Scan a folder to discover your repos'}</p>
          </div>
        `}
      </div>
    `;

    document.getElementById('scan-folder-btn')?.addEventListener('click', () => this.scanRepos());
    document.getElementById('repos-sort')?.addEventListener('change', (e) => {
      Repos.setSort(e.target.value);
      this.renderReposTab(container);
    });
    document.querySelectorAll('.filter-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        Repos.setFilter(tab.dataset.filter);
        this.renderReposTab(container);
      });
    });

    this.bindRepoCardEvents(container);
  },

  bindRepoCardEvents(container) {
    const profiles = Store.getProfiles();
    container.querySelectorAll('.repo-card').forEach((card) => {
      const repoPath = card.dataset.path;
      const repo = Repos._repos.find((r) => r.path === repoPath);
      card.querySelector('[data-action="switch"]')?.addEventListener('click', () => {
        Repos.showSwitchModal(repo, profiles, () => this.renderReposTab(container));
      });
      card.querySelector('[data-action="push"]')?.addEventListener('click', () => {
        Repos.showPushModal(repo);
      });
      card.querySelector('[data-action="terminal"]')?.addEventListener('click', () => {
        window.gitguise.app.openInTerminal(repo.path);
      });
      card.querySelector('[data-action="folder"]')?.addEventListener('click', () => {
        window.gitguise.app.openInExplorer(repo.path);
      });
    });
  },

  async renderSettingsTab(container) {
    const settings = Store.getSettings();
    const platform = await window.gitguise.app.getPlatform();
    const preview = await Hooks.getPreview(Store.getProfiles(), settings);
    const hooksStale = Store._cache?.hooksStale;

    container.innerHTML = `
      ${hooksStale ? `
        <div class="banner banner-warning" style="margin-bottom:24px">
          <i class="ti ti-alert-triangle"></i>
          Your hooks are out of date — re-apply?
          <button class="btn btn-sm" id="reapply-hooks-banner" style="margin-left:auto">Re-apply now</button>
        </div>
      ` : ''}

      <div class="settings-section">
        <h2>Hooks</h2>
        <p class="section-desc">GitGuise intercepts git commands to manage accounts automatically.</p>
        <div id="settings-hooks-container"></div>
        <div class="settings-actions">
          <button class="btn" id="reapply-hooks">Re-apply hooks</button>
          <button class="btn btn-danger" id="remove-hooks">Remove all hooks</button>
        </div>
      </div>

      <div class="settings-section">
        <h2>App</h2>
        <div class="settings-row">
          <div class="settings-row-label">
            <h4>Launch at startup</h4>
            <p>Start GitGuise when you log in</p>
          </div>
          <label class="toggle">
            <input type="checkbox" id="setting-startup" ${settings.launchAtStartup ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="settings-row">
          <div class="settings-row-label">
            <h4>Repo scan depth</h4>
            <p>How deep to search for git repos</p>
          </div>
          <div class="segmented" id="scan-depth">
            ${[1, 2, 3, 4].map((d) => `
              <button class="${settings.repoScanDepth === d ? 'active' : ''}" data-depth="${d}">${d}</button>
            `).join('')}
          </div>
        </div>
        <div class="settings-row">
          <div class="settings-row-label">
            <h4>Updates</h4>
            <p id="update-status">GitGuise updates automatically in the background</p>
          </div>
          <button class="btn" id="check-updates">Check for updates</button>
        </div>
      </div>

      <div class="settings-section">
        <h2>Backup</h2>
        <p class="section-desc">Move to a new machine in under 2 minutes</p>
        <div class="settings-actions">
          <button class="btn" id="export-config">Export Config</button>
          <button class="btn" id="import-config">Import Config</button>
        </div>
      </div>

      <div class="settings-section danger-zone">
        <h2>Danger Zone</h2>
        <p class="section-desc">Reset everything and start over</p>
        <button class="btn btn-danger" id="reset-all">Reset Everything</button>
      </div>
    `;

    const hooksContainer = document.getElementById('settings-hooks-container');
    Hooks.renderHookCards(hooksContainer, settings, preview, platform);

    document.getElementById('reapply-hooks')?.addEventListener('click', async () => {
      await Hooks.regenerate();
      this.renderSettingsTab(container);
    });
    document.getElementById('reapply-hooks-banner')?.addEventListener('click', async () => {
      await Hooks.regenerate();
      this.renderSettingsTab(container);
    });
    document.getElementById('remove-hooks')?.addEventListener('click', async () => {
      await Hooks.removeAll();
    });

    document.getElementById('setting-startup')?.addEventListener('change', async (e) => {
      const s = Store.getSettings();
      s.launchAtStartup = e.target.checked;
      await Store.set('settings', s);
    });

    document.querySelectorAll('#scan-depth button').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const s = Store.getSettings();
        s.repoScanDepth = parseInt(btn.dataset.depth, 10);
        await Store.set('settings', s);
        this.renderSettingsTab(container);
      });
    });

    document.getElementById('check-updates')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const statusEl = document.getElementById('update-status');
      btn.disabled = true;
      btn.textContent = 'Checking…';
      try {
        const res = await window.gitguise.app.checkForUpdates();
        if (statusEl) {
          if (res?.supported === false) {
            statusEl.textContent = 'Updates are only available in the installed app';
          } else if (res?.error) {
            statusEl.textContent = 'Could not check for updates right now';
          } else {
            statusEl.textContent = "You're on the latest version — new updates install automatically";
          }
        }
      } finally {
        btn.disabled = false;
        btn.textContent = 'Check for updates';
      }
    });

    document.getElementById('export-config')?.addEventListener('click', async () => {
      const path = await window.gitguise.app.exportConfig();
      if (path) showToast(`Exported to ${path}`, 'success');
    });

    document.getElementById('import-config')?.addEventListener('click', async () => {
      const data = await window.gitguise.app.importConfig();
      if (data) {
        await Store.refresh();
        showToast('Config imported', 'success');
        this.render();
      }
    });

    document.getElementById('reset-all')?.addEventListener('click', async () => {
      const form = document.createElement('div');
      form.innerHTML = `
        <p style="color:var(--text-muted);margin-bottom:12px">This will clear all profiles, remove hooks, and restart the setup wizard. Type <strong>reset</strong> to confirm.</p>
        <input type="text" id="reset-confirm" placeholder="Type reset">
      `;
      const modal = showModal({
        title: 'Reset Everything',
        body: form,
        footer: `
          <button class="btn btn-ghost" id="reset-cancel">Cancel</button>
          <button class="btn btn-danger" id="reset-ok" disabled>Reset</button>
        `,
      });
      const input = form.querySelector('#reset-confirm');
      const okBtn = document.getElementById('reset-ok');
      input.addEventListener('input', () => {
        okBtn.disabled = input.value !== 'reset';
      });
      document.getElementById('reset-cancel').onclick = () => modal.close();
      okBtn.onclick = async () => {
        await Store.reset();
        hooksLib_remove();
        modal.close();
        await Wizard.init();
      };
    });
  },

  async scanRepos() {
    const folder = await window.gitguise.app.selectFolder();
    if (!folder) return;

    const content = document.getElementById('content');
    const grid = document.getElementById('repos-grid');
    if (grid) grid.innerHTML = Repos.renderSkeleton(4);

    const repos = await Repos.scan(folder);
    await Store.refresh();
    if (this.currentTab === 'repos') this.renderReposTab(content);
    showToast(`Found ${repos.length} repo${repos.length !== 1 ? 's' : ''}`, 'success');
  },

  showCloneModal() {
    const profiles = Store.getProfiles();
    const form = document.createElement('div');
    form.className = 'clone-form';
    form.innerHTML = `
      <div class="form-group">
        <label>Repository URL</label>
        <input type="text" id="clone-url" placeholder="https://github.com/user/repo">
      </div>
      <div class="form-group">
        <label>Profile</label>
        <select id="clone-profile">
          ${profiles.map((p) => `<option value="${p.id}">${escapeHtml(p.displayName)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Destination Folder</label>
        <div style="display:flex;gap:8px">
          <input type="text" id="clone-dest" placeholder="Select folder..." readonly>
          <button class="btn btn-sm" id="clone-browse">Browse</button>
        </div>
      </div>
    `;
    const modal = showModal({
      title: 'Clone Repo',
      body: form,
      footer: `
        <button class="btn btn-ghost" id="clone-cancel">Cancel</button>
        <button class="btn btn-primary" id="clone-ok">Clone</button>
      `,
    });

    document.getElementById('clone-browse').onclick = async () => {
      const folder = await window.gitguise.app.selectFolder();
      if (folder) form.querySelector('#clone-dest').value = folder;
    };
    document.getElementById('clone-cancel').onclick = () => modal.close();
    document.getElementById('clone-ok').onclick = async () => {
      const url = form.querySelector('#clone-url').value.trim();
      const dest = form.querySelector('#clone-dest').value.trim();
      const profileId = form.querySelector('#clone-profile').value;
      const profile = profiles.find((p) => p.id === profileId);
      if (!url || !dest || !profile) {
        showToast('Fill in all fields', 'error');
        return;
      }
      const slug = url.replace(/\.git$/, '').split('/').pop();
      const sshUrl = `git@${profile.sshHostAlias}:${profile.githubUsername}/${slug}.git`;
      const destPath = dest.replace(/[/\\]$/, '') + '/' + slug;
      const cmd = `git clone "${sshUrl}" "${destPath}"`;
      const confirmed = await showConfirmModal({
        title: 'Clone Repository',
        description: `This will run:\n\n${cmd}`,
        confirmText: 'Clone',
      });
      if (!confirmed) return;
      modal.close();
      showToast('Cloning... check terminal', 'info');
      window.gitguise.app.openInTerminal(dest);
    };
  },

  showTestModal(profile) {
    const body = document.createElement('div');
    body.innerHTML = `
      <p style="margin-bottom:12px">Testing connection for <strong>${escapeHtml(profile.displayName)}</strong></p>
      <div class="terminal-box" id="profile-test-terminal"></div>
      <div id="profile-test-result" style="margin-top:12px"></div>
    `;
    const modal = showModal({
      title: 'Test Connection',
      body,
      footer: '<button class="btn btn-ghost" id="test-close">Close</button>',
    });
    document.getElementById('test-close').onclick = () => modal.close();

    const terminal = body.querySelector('#profile-test-terminal');
    const result = body.querySelector('#profile-test-result');

    const runTest = () => {
      SSH.testConnection(profile, terminal, result, {
        fixLabel: 'Fix: generate key & config →',
        onFix: async () => {
          const np = normalizeProfile(profile);
          try {
            const check = await window.gitguise.ssh.checkKeyExists(np.sshKeyName);
            let publicKey = null;
            if (!check.exists) {
              result.innerHTML = '<span class="text-muted">Generating SSH key…</span>';
              const res = await window.gitguise.ssh.generateKey({
                email: np.email,
                sshKeyName: np.sshKeyName,
                streamId: createStreamId(),
              });
              publicKey = res?.publicKey || (await window.gitguise.ssh.getPublicKey(np.sshKeyName));
            } else {
              publicKey = await window.gitguise.ssh.getPublicKey(np.sshKeyName);
            }

            result.innerHTML = '<span class="text-muted">Applying SSH config…</span>';
            await window.gitguise.ssh.writeConfig(Store.getProfiles().map(normalizeProfile));

            // "Permission denied (publickey)" almost always means the key
            // isn't on the provider yet — guide the user to add it.
            if (publicKey) {
              await window.gitguise.app.copyToClipboard(publicKey);
              Profiles.showAddKeyModal(np, publicKey);
            } else {
              runTest();
            }
          } catch {
            showToast('Setup failed. Please try again.', 'error');
          }
        },
      });
    };

    runTest();
  },
};

async function hooksLib_remove() {
  await Hooks.removeAll();
}
