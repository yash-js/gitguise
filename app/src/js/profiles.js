const Profiles = {
  async getAll() {
    return window.gitguise.profiles.getAll();
  },

  async save(profile) {
    const saved = await window.gitguise.profiles.save(normalizeProfile(profile));
    await Store.refresh();
    return saved;
  },

  async delete(id) {
    const profile = Store.getProfiles().find((p) => p.id === id);
    const form = document.createElement('div');
    form.innerHTML = `
      <p style="color:var(--text-muted);margin-bottom:12px">
        This removes <strong>${escapeHtml(profile?.displayName || 'this profile')}</strong> completely — from the app,
        its <strong>~/.ssh/config</strong> host block (<code>${escapeHtml(profile?.sshHostAlias || '')}</code>),
        its SSH key files (<code>${escapeHtml(profile?.sshKeyName || 'key')}</code>), and your git hooks.
      </p>
      <div class="form-status hidden" id="del-status"></div>
    `;

    const modal = showModal({
      title: 'Delete Profile',
      body: form,
      footer: `
        <button class="btn btn-ghost" id="del-cancel">Cancel</button>
        <button class="btn btn-danger" id="del-ok">Delete</button>
      `,
    });

    return new Promise((resolve) => {
      document.getElementById('del-cancel').onclick = () => {
        modal.close();
        resolve(null);
      };
      document.getElementById('del-ok').onclick = async () => {
        const okBtn = document.getElementById('del-ok');
        const cancelBtn = document.getElementById('del-cancel');
        const status = form.querySelector('#del-status');
        okBtn.disabled = true;
        cancelBtn.disabled = true;
        status.className = 'form-status form-status-busy';
        status.textContent = 'Removing profile, config & keys…';

        try {
          const profiles = await window.gitguise.profiles.delete(id, { deleteKeys: true });
          await Store.refresh();
          modal.close();
          showToast('Profile removed from app and system', 'success');
          resolve(profiles);
        } catch {
          status.className = 'form-status form-status-error';
          status.textContent = 'Failed to remove. Please try again.';
          okBtn.disabled = false;
          cancelBtn.disabled = false;
        }
      };
    });
  },

  renderCard(profile) {
    const p = normalizeProfile(profile);
    return `
      <div class="profile-card" data-id="${p.id}">
        <div class="profile-card-header">
          <span class="profile-dot profile-dot-lg" style="background:${p.color}"></span>
          <div>
            <h3>${escapeHtml(p.displayName)}</h3>
            ${p.isDefault ? '<span class="badge badge-default">Default</span>' : ''}
          </div>
        </div>
        <div class="profile-username">@${escapeHtml(p.githubUsername)}</div>
        <div class="profile-email">${escapeHtml(p.email)}</div>
        <span class="profile-alias-pill" style="background:${p.color}22;color:${p.color}">${escapeHtml(p.sshHostAlias)}</span>
        <div class="profile-card-actions">
          <button class="btn btn-sm" data-action="edit" data-id="${p.id}">Edit</button>
          <button class="btn btn-sm" data-action="delete" data-id="${p.id}">Delete</button>
          <button class="btn btn-sm" data-action="test" data-id="${p.id}">Test</button>
          <button class="btn btn-sm" data-action="copy-key" data-id="${p.id}">Copy Key</button>
        </div>
      </div>
    `;
  },

  GIT_PROVIDERS: {
    github: {
      name: 'GitHub',
      icon: 'ti-brand-github',
      host: 'github.com',
      keysUrl: 'https://github.com/settings/ssh/new',
      path: 'Settings → SSH and GPG keys → New SSH key',
    },
    gitlab: {
      name: 'GitLab',
      icon: 'ti-brand-gitlab',
      host: 'gitlab.com',
      keysUrl: 'https://gitlab.com/-/user_settings/ssh_keys',
      path: 'Preferences → SSH Keys → Add new key',
    },
    bitbucket: {
      name: 'Bitbucket',
      icon: 'ti-brand-bitbucket',
      host: 'bitbucket.org',
      keysUrl: 'https://bitbucket.org/account/settings/ssh-keys/',
      path: 'Personal settings → SSH keys → Add key',
    },
  },

  showAddKeyModal(profile, publicKey) {
    const providers = Profiles.GIT_PROVIDERS;
    let current = 'github';

    const body = document.createElement('div');
    body.innerHTML = `
      <p style="color:var(--text-muted);margin-bottom:12px">
        GitGuise generated an SSH key for <strong>${escapeHtml(profile.displayName)}</strong>.
        Copy it, add it to your provider, then press Done.
      </p>

      <div class="provider-select" id="provider-select">
        <button class="provider-trigger" id="provider-trigger" type="button">
          <i class="ti ${providers[current].icon}"></i>
          <span class="provider-name">${providers[current].name}</span>
          <i class="ti ti-chevron-down provider-caret"></i>
        </button>
        <div class="provider-menu hidden" id="provider-menu">
          ${Object.entries(providers).map(([id, p]) => `
            <button class="provider-option" type="button" data-provider="${id}">
              <i class="ti ${p.icon}"></i> ${p.name}
            </button>
          `).join('')}
        </div>
      </div>

      <textarea class="key-textarea" id="addkey-text" readonly>${escapeHtml(publicKey)}</textarea>
      <div id="provider-instructions"></div>
    `;

    const modal = showModal({
      title: 'Add SSH key',
      body,
      footer: `
        <button class="btn btn-ghost" id="addkey-copy">Copy key</button>
        <button class="btn" id="addkey-done" disabled title="Copy the key before closing">Done</button>
        <button class="btn btn-primary" id="addkey-open">Open →</button>
      `,
    });

    let keyCopied = false;
    const doneBtn = document.getElementById('addkey-done');
    const copyBtn = document.getElementById('addkey-copy');
    const closeBtn = document.getElementById('modal-close');
    const overlay = document.getElementById('modal-overlay');

    const allowClose = () => keyCopied;

    const tryClose = () => {
      if (!allowClose()) {
        showToast('Copy the key first', 'error');
        return;
      }
      modal.close();
    };

    // Block X and backdrop until the key is explicitly copied.
    closeBtn.onclick = tryClose;
    overlay.onclick = (e) => {
      if (e.target === overlay) tryClose();
    };

    const trigger = body.querySelector('#provider-trigger');
    const menu = body.querySelector('#provider-menu');
    const instructions = body.querySelector('#provider-instructions');
    const openBtn = document.getElementById('addkey-open');

    const renderProvider = () => {
      const prov = providers[current];
      trigger.querySelector('.provider-name').textContent = prov.name;
      trigger.querySelector('.ti:first-child').className = `ti ${prov.icon}`;
      openBtn.textContent = `Open ${prov.name} →`;
      instructions.innerHTML = `
        <ol class="addkey-steps">
          <li>Open the <a href="#" class="provider-link">${escapeHtml(prov.name)} SSH keys page</a> (<span class="kbd">${escapeHtml(prov.path)}</span>)</li>
          <li>Give it a title (e.g. <strong>${escapeHtml(profile.displayName)}</strong>) and paste the key — copy it first with <strong>Copy key</strong></li>
          <li>Save it, then verify from your terminal:</li>
        </ol>
        <pre class="code">ssh -T git@${prov.host}</pre>
        <p class="addkey-link-row">Direct link: <a href="#" class="provider-link">${escapeHtml(prov.keysUrl)}</a></p>
        <p class="ssh-note">Make sure you're signed into the correct ${escapeHtml(prov.name)} account first.</p>
      `;
      instructions.querySelectorAll('.provider-link').forEach((a) => {
        a.addEventListener('click', (e) => {
          e.preventDefault();
          window.gitguise.app.openUrl(prov.keysUrl);
        });
      });
    };

    renderProvider();

    trigger.onclick = () => menu.classList.toggle('hidden');
    body.querySelectorAll('.provider-option').forEach((opt) => {
      opt.onclick = () => {
        current = opt.dataset.provider;
        menu.classList.add('hidden');
        renderProvider();
      };
    });

    copyBtn.onclick = async () => {
      await window.gitguise.app.copyToClipboard(publicKey);
      keyCopied = true;
      doneBtn.disabled = false;
      doneBtn.removeAttribute('title');
      copyBtn.textContent = 'Copied';
      showToast('Public key copied', 'success');
    };
    openBtn.onclick = () => window.gitguise.app.openUrl(providers[current].keysUrl);
    doneBtn.onclick = tryClose;
  },

  showFormModal(profile = null, onSave) {
    const p = profile ? normalizeProfile(profile) : {
      githubUsername: '',
      email: '',
      label: 'personal',
      customLabel: '',
      isDefault: false,
    };

    const form = document.createElement('div');
    form.className = 'profile-form';
    form.innerHTML = `
      <div class="form-group">
        <label>GitHub Username</label>
        <input type="text" id="pf-username" value="${escapeHtml(p.githubUsername)}" placeholder="your-username">
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" id="pf-email" value="${escapeHtml(p.email)}" placeholder="you@email.com">
      </div>
      <div class="form-group">
        <label>Label</label>
        <div class="label-row">
          <span class="label-color-dot" id="pf-color-dot" style="background:${getColorForLabel(p.label)}"></span>
          <select id="pf-label">
            <option value="personal" ${p.label === 'personal' ? 'selected' : ''}>Personal</option>
            <option value="work" ${p.label === 'work' ? 'selected' : ''}>Work</option>
            <option value="freelance" ${p.label === 'freelance' ? 'selected' : ''}>Freelance</option>
            <option value="custom" ${p.customLabel ? 'selected' : ''}>Custom…</option>
          </select>
        </div>
      </div>
      <div class="form-group" id="pf-custom-wrap" style="display:${p.customLabel ? 'block' : 'none'}">
        <label>Custom label</label>
        <input type="text" id="pf-custom" value="${escapeHtml(p.customLabel || '')}" placeholder="e.g. OSS, Client, School">
      </div>
      <div class="form-group">
        <label class="toggle" style="width:auto;display:flex;align-items:center;gap:8px;">
          <input type="checkbox" id="pf-default" ${p.isDefault ? 'checked' : ''}>
          <span style="font-size:13px;color:var(--text)">Set as default profile</span>
        </label>
      </div>
      <div class="form-status hidden" id="pf-status"></div>
    `;

    const modal = showModal({
      title: profile ? 'Edit Profile' : 'Add Profile',
      body: form,
      footer: `
        <button class="btn btn-ghost" id="pf-cancel">Cancel</button>
        <button class="btn btn-primary" id="pf-save">Save</button>
      `,
    });

    form.querySelector('#pf-label').addEventListener('change', (e) => {
      const val = e.target.value;
      const showCustom = val === 'custom';
      form.querySelector('#pf-custom-wrap').style.display = showCustom ? 'block' : 'none';
      form.querySelector('#pf-color-dot').style.background = getColorForLabel(showCustom ? 'other' : val);
    });

    document.getElementById('pf-cancel').onclick = () => modal.close();
    document.getElementById('pf-save').onclick = async () => {
      const data = {
        id: profile?.id,
        githubUsername: form.querySelector('#pf-username').value.trim(),
        email: form.querySelector('#pf-email').value.trim(),
        label: form.querySelector('#pf-label').value,
        customLabel: form.querySelector('#pf-custom') ? form.querySelector('#pf-custom').value.trim() : '',
        sshKeyName: p.sshKeyName,
        sshHostAlias: p.sshHostAlias,
        isDefault: form.querySelector('#pf-default').checked,
      };
      if (!data.githubUsername || !data.email) {
        showToast('GitHub username and email are required', 'error');
        return;
      }
      if (data.label === 'custom' && !data.customLabel) {
        showToast('Custom label is required', 'error');
        return;
      }
      const existing = Store.getProfiles().filter((x) => x.id !== data.id);
      const emailKey = data.email.toLowerCase();
      const usernameKey = data.githubUsername.toLowerCase();
      const labelKey = (data.label === 'custom' ? data.customLabel : data.label).toLowerCase();

      if (existing.some((x) => (x.email || '').toLowerCase() === emailKey)) {
        showToast('Email already exists', 'error');
        return;
      }
      if (existing.some((x) => (x.githubUsername || '').toLowerCase() === usernameKey)) {
        showToast('GitHub username already exists', 'error');
        return;
      }
      if (existing.some((x) => ((x.customLabel || x.label || '').trim().toLowerCase()) === labelKey)) {
        showToast('Label already exists', 'error');
        return;
      }

      const saveBtn = document.getElementById('pf-save');
      const cancelBtn = document.getElementById('pf-cancel');
      const status = form.querySelector('#pf-status');
      const setStatus = (msg, state = 'busy') => {
        status.classList.remove('hidden');
        status.className = `form-status form-status-${state}`;
        status.textContent = msg;
      };
      saveBtn.disabled = true;
      cancelBtn.disabled = true;

      try {
        setStatus('Saving profile…');
        const saved = await Profiles.save(data);
        const np = normalizeProfile(saved);

        // Generate the SSH key if it doesn't exist yet.
        let generatedKey = null;
        const check = await window.gitguise.ssh.checkKeyExists(np.sshKeyName);
        if (!check.exists) {
          setStatus('Generating SSH key…');
          const res = await window.gitguise.ssh.generateKey({
            email: np.email,
            sshKeyName: np.sshKeyName,
            streamId: createStreamId(),
          });
          generatedKey = res?.publicKey || (await window.gitguise.ssh.getPublicKey(np.sshKeyName));
        }

        setStatus('Applying SSH config…');
        await window.gitguise.ssh.writeConfig(Store.getProfiles().map(normalizeProfile));

        // Best-effort reload for shells that read ~/.bashrc (new sessions).
        // This cannot update already-open external terminals, but it ensures
        // subsequent shell runs in Git Bash pick up the wrapper immediately.
        try {
          await window.gitguise.shell.run({
            command: 'source ~/.bashrc >/dev/null 2>&1 || true',
            cwd: null,
            streamId: createStreamId(),
          });
        } catch {
          /* ignore */
        }

        setStatus('Done', 'ok');
        modal.close();
        if (onSave) onSave(saved);

        if (generatedKey) {
          await window.gitguise.app.copyToClipboard(generatedKey);
          Profiles.showAddKeyModal(np, generatedKey);
        } else {
          showToast('Profile saved & SSH config applied', 'success');
        }
      } catch (err) {
        setStatus('Something went wrong. Please try again.', 'error');
        saveBtn.disabled = false;
        cancelBtn.disabled = false;
      }
    };
  },
};
