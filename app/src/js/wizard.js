const Wizard = {
  currentStep: 1,
  totalSteps: 7,
  profiles: [],
  testResults: {},
  direction: 'forward',

  async init() {
    this.profiles = [];
    this.testResults = {};
    this.currentStep = 1;
    this.detected = null;
    this.render();
    this.show();
    this.autoDetect();
  },

  async autoDetect() {
    try {
      const res = await window.gitguise.system.detectProfiles();
      this.detected = res;
      if (res?.profiles?.length && !Store.getProfiles().length && !this.profiles.length) {
        this.profiles = res.profiles.map((p) => ({ ...p }));
        if (this.currentStep === 2) this.render();
      }
    } catch {
      /* detection is best-effort */
    }
  },

  show() {
    document.getElementById('wizard').classList.remove('hidden');
    document.getElementById('dashboard').classList.add('hidden');
  },

  hide() {
    document.getElementById('wizard').classList.add('hidden');
  },

  goToStep(step) {
    this.direction = step > this.currentStep ? 'forward' : 'backward';
    this.currentStep = step;
    this.render();
  },

  next() {
    if (!this.validate()) return;
    if (this.currentStep === 2) this.saveProfiles();
    if (this.currentStep < this.totalSteps) {
      this.direction = 'forward';
      this.currentStep++;
      this.render();
      if (this.currentStep === 3) this.initSshStep();
      if (this.currentStep === 4) this.initSshConfigStep();
      if (this.currentStep === 5) this.initTestStep();
      if (this.currentStep === 6) this.initHooksStep();
    }
  },

  back() {
    if (this.currentStep > 1) {
      this.direction = 'backward';
      this.currentStep--;
      this.render();
    }
  },

  validate() {
    if (this.currentStep === 2) return this.validateProfiles();
    if (this.currentStep === 5) {
      const passed = Object.values(this.testResults).some((r) => r);
      if (!passed) {
        showToast('At least one connection must pass to continue', 'error');
        return false;
      }
    }
    return true;
  },

  validateProfiles() {
    const rows = document.querySelectorAll('.profile-row');
    const emails = new Set();
    const usernames = new Set();
    const labels = new Set();
    let valid = true;

    rows.forEach((row) => {
      const username = row.querySelector('[data-field="githubUsername"]').value.trim();
      const email = row.querySelector('[data-field="email"]').value.trim();
      const label = row.querySelector('[data-field="label"]').value;
      const customLabelEl = row.querySelector('[data-field="customLabel"]');
      const customLabel = customLabelEl ? customLabelEl.value.trim() : '';
      if (!username || !email) {
        valid = false;
        showToast('GitHub username and email are required', 'error');
      }
      if (label === 'custom' && !customLabel) {
        valid = false;
        showToast('Custom label is required', 'error');
      }
      const emailKey = email.toLowerCase();
      if (emails.has(emailKey)) {
        valid = false;
        showToast('Duplicate emails are not allowed', 'error');
      }
      emails.add(emailKey);

      const usernameKey = username.toLowerCase();
      if (usernames.has(usernameKey)) {
        valid = false;
        showToast('Duplicate usernames are not allowed', 'error');
      }
      usernames.add(usernameKey);

      const labelKey = (label === 'custom' ? customLabel : label).toLowerCase();
      if (labelKey) {
        if (labels.has(labelKey)) {
          valid = false;
          showToast('Duplicate labels are not allowed', 'error');
        }
        labels.add(labelKey);
      }
    });
    return valid;
  },

  collectProfiles() {
    const rows = document.querySelectorAll('.profile-row');
    return Array.from(rows).map((row, i) => {
      const label = row.querySelector('[data-field="label"]').value;
      const customLabelEl = row.querySelector('[data-field="customLabel"]');
      const customLabel = customLabelEl ? customLabelEl.value.trim() : '';
      return normalizeProfile({
        id: row.dataset.id || generateId(),
        githubUsername: row.querySelector('[data-field="githubUsername"]').value.trim(),
        email: row.querySelector('[data-field="email"]').value.trim(),
        label,
        customLabel,
        sshKeyName: row.dataset.sshKey || undefined,
        sshHostAlias: row.dataset.sshAlias || undefined,
        isDefault: i === 0,
      });
    });
  },

  async saveProfiles() {
    this.profiles = this.collectProfiles();
    for (const p of this.profiles) {
      await Profiles.save(p);
    }
    await Store.refresh();
    this.profiles = Store.getProfiles();
  },

  updateProgress() {
    const pct = (this.currentStep / this.totalSteps) * 100;
    document.getElementById('progress-fill').style.width = `${pct}%`;
    document.getElementById('progress-label').textContent = `Step ${this.currentStep} of ${this.totalSteps}`;
  },

  render() {
    const container = document.getElementById('wizard-steps');
    this.updateProgress();

    const steps = [
      this.renderStep1(),
      this.renderStep2(),
      this.renderStep3(),
      this.renderStep4(),
      this.renderStep5(),
      this.renderStep6(),
      this.renderStep7(),
    ];

    container.innerHTML = steps.map((html, i) => {
      const stepNum = i + 1;
      const isActive = stepNum === this.currentStep;
      return `<div class="wizard-step ${isActive ? 'active' : ''}" data-step="${stepNum}">${html}</div>`;
    }).join('');

    this.bindStepEvents();
    if (this.currentStep === 3) this.initSshStep();
    if (this.currentStep === 4) this.initSshConfigStep();
    if (this.currentStep === 5) this.initTestStep();
    if (this.currentStep === 6) this.initHooksStep();
  },

  renderStep1() {
    return `
      <div class="wizard-step-content welcome-step">
        <img src="assets/logo.svg" alt="GitGuise" class="welcome-logo">
        <h1>GitGuise</h1>
        <p class="welcome-tagline">One machine. Many identities.</p>
        <p class="welcome-body">Set up multiple GitHub accounts once. GitGuise handles the rest automatically.</p>
        <button class="btn btn-primary" id="wizard-start">Get Started →</button>
      </div>
    `;
  },

  renderStep2() {
    const rows = this.profiles.length
      ? this.profiles
      : [{}, {}];
    const detectedCount = this.detected?.profiles?.length || 0;

    return `
      <div class="wizard-step-content">
        <h2>Add your GitHub profiles</h2>
        <p class="subtext">Add as many as you need — personal, work, freelance, anything.</p>
        ${detectedCount ? `
          <div class="banner banner-success" style="margin-bottom:16px">
            <i class="ti ti-wand"></i>
            Detected ${detectedCount} existing setup${detectedCount !== 1 ? 's' : ''} from your SSH config / git config. Review and complete the details below.
          </div>
        ` : ''}
        <div class="profile-rows" id="profile-rows">
          ${rows.map((p, i) => this.renderProfileRow(p, i, rows.length)).join('')}
        </div>
        <button class="btn-link" id="add-profile-row">+ Add another profile</button>
        <div class="wizard-footer">
          <button class="btn btn-ghost" id="wizard-back">← Back</button>
          <button class="btn btn-primary" id="wizard-next">Next →</button>
        </div>
      </div>
    `;
  },

  renderProfileRow(profile, index, total) {
    const src = profile || {};
    const p = src.id ? normalizeProfile(src) : {
      githubUsername: src.githubUsername || '',
      email: src.email || '',
      label: src.label || (index === 0 ? 'personal' : 'work'),
      customLabel: src.customLabel || '',
      sshKeyName: src.sshKeyName || '',
      sshHostAlias: src.sshHostAlias || '',
    };
    const labelValue = p.customLabel ? 'custom' : (p.label || 'other');
    return `
      <div class="profile-row" data-id="${p.id || ''}" data-ssh-key="${escapeHtml(p.sshKeyName || '')}" data-ssh-alias="${escapeHtml(p.sshHostAlias || '')}">
        ${total > 1 ? '<button class="remove-btn" data-action="remove">×</button>' : ''}
        <div class="profile-row-fields">
          <div class="form-group">
            <label>GitHub Username</label>
            <input data-field="githubUsername" value="${escapeHtml(p.githubUsername || '')}" placeholder="your-username">
          </div>
          <div class="form-group">
            <label>Email</label>
            <input data-field="email" type="email" value="${escapeHtml(p.email || '')}" placeholder="you@email.com">
          </div>
          <div class="form-group">
            <label>Label</label>
            <div class="label-select-wrap">
              <span class="label-color-dot" style="background:${getColorForLabel(labelValue === 'custom' ? 'other' : (p.label || 'other'))}"></span>
              <select data-field="label">
                <option value="personal" ${labelValue === 'personal' ? 'selected' : ''}>Personal</option>
                <option value="work" ${labelValue === 'work' ? 'selected' : ''}>Work</option>
                <option value="freelance" ${labelValue === 'freelance' ? 'selected' : ''}>Freelance</option>
                <option value="custom" ${labelValue === 'custom' ? 'selected' : ''}>Custom…</option>
              </select>
            </div>
          </div>
          <div class="form-group full custom-label-wrap" style="display:${labelValue === 'custom' ? 'block' : 'none'}">
            <label>Custom label</label>
            <input data-field="customLabel" value="${escapeHtml(p.customLabel || '')}" placeholder="e.g. OSS, Client, School">
          </div>
        </div>
      </div>
    `;
  },

  renderStep3() {
    const profiles = this.profiles.length ? this.profiles : Store.getProfiles();
    return `
      <div class="wizard-step-content">
        <h2>Generate SSH keys</h2>
        <p class="subtext">Create a unique SSH key for each profile.</p>
        <div class="ssh-tabs" id="ssh-tabs">
          ${profiles.map((p, i) => {
            const pr = normalizeProfile(p);
            return `<button class="ssh-tab ${i === 0 ? 'active' : ''}" data-tab="${pr.id}">
              <span class="tab-dot" style="background:${pr.color}"></span>
              ${escapeHtml(pr.displayName)}
              <span class="tab-check hidden" data-check="${pr.id}"><i class="ti ti-check"></i></span>
            </button>`;
          }).join('')}
        </div>
        <div id="ssh-panels">
          ${profiles.map((p, i) => this.renderSshPanel(normalizeProfile(p), i === 0)).join('')}
        </div>
        <div class="wizard-footer">
          <button class="btn btn-ghost" id="wizard-back">← Back</button>
          <button class="btn btn-primary" id="wizard-next">Next →</button>
        </div>
      </div>
    `;
  },

  renderSshPanel(profile, active) {
    const home = '~';
    return `
      <div class="ssh-panel ${active ? 'active' : ''}" data-panel="${profile.id}">
        <div id="ssh-exists-${profile.id}" class="banner banner-success hidden"></div>
        <div class="ssh-section" id="ssh-generate-${profile.id}">
          <h4>Run this command to generate your key:</h4>
          <div class="code-block">
            <button class="copy-btn">Copy</button>
            <code>ssh-keygen -t ed25519 -C "${escapeHtml(profile.email)}" -f ${home}/.ssh/${profile.sshKeyName} -N ""</code>
          </div>
          <button class="btn btn-primary btn-sm" data-action="generate" data-id="${profile.id}" style="margin-top:12px">Generate Key</button>
          <div class="terminal-box" id="ssh-terminal-${profile.id}" style="margin-top:12px;display:none"></div>
        </div>
        <div class="ssh-section" id="ssh-public-${profile.id}" style="display:none">
          <h4>Your public key:</h4>
          <textarea class="key-textarea" id="ssh-key-text-${profile.id}" readonly></textarea>
          <div class="ssh-actions">
            <button class="btn btn-sm" data-action="copy-key" data-id="${profile.id}">Copy to Clipboard</button>
            <button class="btn btn-sm btn-primary" data-action="github-ssh" data-id="${profile.id}">Add to GitHub →</button>
          </div>
          <p class="ssh-note">Make sure you're logged into your ${escapeHtml(profile.displayName)} GitHub account</p>
        </div>
      </div>
    `;
  },

  renderStep4() {
    return `
      <div class="wizard-step-content">
        <h2>Configure SSH</h2>
        <p class="subtext">This tells your computer which key to use for each GitHub account.</p>
        <div class="config-preview" id="ssh-config-preview"></div>
        <div class="config-diff" id="ssh-config-diff"></div>
        <button class="btn btn-primary" id="apply-ssh-config">Apply SSH Config</button>
        <div id="ssh-config-success" class="banner banner-success hidden" style="margin-top:16px"></div>
        <div class="wizard-footer">
          <button class="btn btn-ghost" id="wizard-back">← Back</button>
          <button class="btn btn-primary" id="wizard-next">Next →</button>
        </div>
      </div>
    `;
  },

  renderStep5() {
    const profiles = this.profiles.length ? this.profiles : Store.getProfiles();
    return `
      <div class="wizard-step-content">
        <h2>Test your connections</h2>
        <p class="subtext">Let's make sure everything is working. At least one connection must pass to continue.</p>
        <div class="test-cards" id="test-cards">
          ${profiles.map((p) => {
            const pr = normalizeProfile(p);
            return `
              <div class="test-card" data-id="${pr.id}">
                <div class="test-card-header">
                  <div class="test-card-profile">
                    <span class="profile-dot" style="background:${pr.color}"></span>
                    ${escapeHtml(pr.displayName)}
                  </div>
                  <button class="btn btn-sm" data-action="test" data-id="${pr.id}">Test Connection</button>
                </div>
                <div class="terminal-box" id="test-terminal-${pr.id}"></div>
                <div class="test-result" id="test-result-${pr.id}"></div>
              </div>
            `;
          }).join('')}
        </div>
        <div class="wizard-footer">
          <button class="btn btn-ghost" id="wizard-back">← Back</button>
          <button class="btn btn-primary" id="wizard-next">Next →</button>
        </div>
      </div>
    `;
  },

  renderStep6() {
    return `
      <div class="wizard-step-content">
        <h2>Set up smart hooks</h2>
        <p class="subtext">GitGuise will intercept git commands and handle accounts automatically.</p>
        <div id="wizard-hooks-container"></div>
        <button class="btn btn-primary" id="apply-hooks">Apply Hooks</button>
        <div id="hooks-success" class="banner banner-success hidden" style="margin-top:16px"></div>
        <div class="wizard-footer">
          <button class="btn btn-ghost" id="wizard-back">← Back</button>
          <button class="btn btn-primary" id="wizard-next">Next →</button>
        </div>
      </div>
    `;
  },

  renderStep7() {
    const n = (this.profiles.length || Store.getProfiles().length);
    return `
      <div class="wizard-step-content done-step">
        <div class="done-card">
          <h2>You're all set!</h2>
          <ul class="done-checklist">
            <li><i class="ti ti-check"></i> ${n} profile${n !== 1 ? 's' : ''} configured</li>
            <li><i class="ti ti-check"></i> SSH keys generated</li>
            <li><i class="ti ti-check"></i> SSH config written to ~/.ssh/config</li>
            <li><i class="ti ti-check"></i> Hooks enabled</li>
          </ul>
          <button class="btn btn-primary" id="wizard-finish">Open Dashboard →</button>
        </div>
      </div>
    `;
  },

  bindStepEvents() {
    document.getElementById('wizard-start')?.addEventListener('click', () => this.next());
    document.getElementById('wizard-back')?.addEventListener('click', () => this.back());
    document.getElementById('wizard-next')?.addEventListener('click', () => this.next());
    document.getElementById('wizard-finish')?.addEventListener('click', async () => {
      await Store.completeWizard();
      Wizard.hide();
      Dashboard.show();
      Dashboard.render();
    });

    document.getElementById('add-profile-row')?.addEventListener('click', () => {
      const container = document.getElementById('profile-rows');
      const count = container.querySelectorAll('.profile-row').length;
      container.insertAdjacentHTML('beforeend', this.renderProfileRow({}, count, count + 1));
      this.bindProfileRowEvents();
    });

    this.bindProfileRowEvents();
    this.bindSshEvents();
    this.bindTestEvents();

    document.getElementById('apply-ssh-config')?.addEventListener('click', async () => {
      const profiles = this.profiles.length ? this.profiles : Store.getProfiles();
      const result = await SSH.writeConfig(profiles);
      if (result) {
        const el = document.getElementById('ssh-config-success');
        el.textContent = `✓ SSH config written to ${result.path}`;
        el.classList.remove('hidden');
      }
    });

    document.getElementById('apply-hooks')?.addEventListener('click', async () => {
      const result = await Hooks.writeAll();
      if (result) {
        const el = document.getElementById('hooks-success');
        el.textContent = `✓ Hooks applied: ${result.written.join(', ')}`;
        el.classList.remove('hidden');
      }
    });
  },

  bindProfileRowEvents() {
    document.querySelectorAll('.profile-row .remove-btn').forEach((btn) => {
      btn.onclick = () => {
        btn.closest('.profile-row').remove();
        const rows = document.querySelectorAll('.profile-row');
        rows.forEach((row, i) => {
          const removeBtn = row.querySelector('.remove-btn');
          if (removeBtn) removeBtn.style.display = rows.length > 1 ? '' : 'none';
        });
      };
    });
    document.querySelectorAll('[data-field="label"]').forEach((sel) => {
      sel.onchange = (e) => {
        const dot = e.target.closest('.label-select-wrap').querySelector('.label-color-dot');
        dot.style.background = getColorForLabel(e.target.value === 'custom' ? 'other' : e.target.value);
        const row = e.target.closest('.profile-row');
        const customWrap = row.querySelector('.custom-label-wrap');
        if (customWrap) customWrap.style.display = e.target.value === 'custom' ? 'block' : 'none';
      };
    });
  },

  bindSshEvents() {
    setupCodeBlockCopy(document.getElementById('ssh-panels') || document);

    document.querySelectorAll('.ssh-tab').forEach((tab) => {
      tab.onclick = () => {
        document.querySelectorAll('.ssh-tab').forEach((t) => t.classList.remove('active'));
        document.querySelectorAll('.ssh-panel').forEach((p) => p.classList.remove('active'));
        tab.classList.add('active');
        document.querySelector(`[data-panel="${tab.dataset.tab}"]`)?.classList.add('active');
      };
    });

    document.querySelectorAll('[data-action="generate"]').forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const profile = (this.profiles.length ? this.profiles : Store.getProfiles()).find((p) => p.id === id);
        const terminal = document.getElementById(`ssh-terminal-${id}`);
        terminal.style.display = 'block';
        await SSH.generateKey(profile, terminal, (publicKey) => {
          this.showPublicKey(id, publicKey);
        });
      };
    });

    document.querySelectorAll('[data-action="copy-key"]').forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const text = document.getElementById(`ssh-key-text-${id}`).value;
        await window.gitguise.app.copyToClipboard(text);
        showToast('Public key copied', 'success');
      };
    });

    document.querySelectorAll('[data-action="github-ssh"]').forEach((btn) => {
      btn.onclick = () => window.gitguise.app.openUrl('https://github.com/settings/ssh/new');
    });
  },

  bindTestEvents() {
    document.querySelectorAll('[data-action="test"]').forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const profile = (this.profiles.length ? this.profiles : Store.getProfiles()).find((p) => p.id === id);
        const terminal = document.getElementById(`test-terminal-${id}`);
        const result = document.getElementById(`test-result-${id}`);
        const { success } = await SSH.testConnection(profile, terminal, result);
        this.testResults[id] = success;
      };
    });
  },

  async initSshStep() {
    const profiles = this.profiles.length ? this.profiles : Store.getProfiles();
    for (const p of profiles) {
      const pr = normalizeProfile(p);
      const check = await SSH.checkKeyExists(pr.sshKeyName);
      if (check.exists) {
        const banner = document.getElementById(`ssh-exists-${pr.id}`);
        if (banner) {
          banner.textContent = `✓ Key already exists at ~/.ssh/${pr.sshKeyName}`;
          banner.classList.remove('hidden');
        }
        const publicKey = await SSH.getPublicKey(pr.sshKeyName);
        this.showPublicKey(pr.id, publicKey);
        document.getElementById(`ssh-generate-${pr.id}`)?.style.setProperty('display', 'none');
      }
    }
    setupCodeBlockCopy(document.getElementById('ssh-panels') || document);
  },

  showPublicKey(id, publicKey) {
    const section = document.getElementById(`ssh-public-${id}`);
    const textarea = document.getElementById(`ssh-key-text-${id}`);
    const check = document.querySelector(`[data-check="${id}"]`);
    if (section) section.style.display = 'block';
    if (textarea) textarea.value = publicKey;
    if (check) check.classList.remove('hidden');
  },

  async initSshConfigStep() {
    const profiles = this.profiles.length ? this.profiles : Store.getProfiles();
    const preview = await SSH.getPreview(profiles);
    const merge = await SSH.getMergePreview(profiles);
    const previewEl = document.getElementById('ssh-config-preview');
    const diffEl = document.getElementById('ssh-config-diff');

    if (previewEl) {
      previewEl.innerHTML = '<h4 style="margin-bottom:8px;color:var(--text-muted)">Preview</h4>';
      const block = document.createElement('div');
      SSH.renderHighlightedConfig(preview, block);
      previewEl.appendChild(block);
    }

    if (diffEl) {
      const existing = await window.gitguise.ssh.readConfig();
      if (existing) {
        diffEl.innerHTML = `
          <h4>Existing config detected — only new blocks will be added:</h4>
          ${merge.added.length ? merge.added.map((b) => `<div class="code-block diff-added"><pre>${escapeHtml(b)}</pre></div>`).join('') : '<p class="text-muted">All host blocks already exist.</p>'}
        `;
      } else {
        diffEl.innerHTML = '<p class="text-muted">Will create new ~/.ssh/config file</p>';
      }
    }
  },

  async initTestStep() {
    /* bound via bindTestEvents */
  },

  async initHooksStep() {
    const profiles = this.profiles.length ? this.profiles : Store.getProfiles();
    const settings = Store.getSettings();
    const preview = await Hooks.getPreview(profiles, settings);
    const platform = await window.gitguise.app.getPlatform();
    const container = document.getElementById('wizard-hooks-container');
    if (container) Hooks.renderHookCards(container, settings, preview, platform);
  },
};
