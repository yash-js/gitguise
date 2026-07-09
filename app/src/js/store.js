const LABEL_COLORS = {
  personal: '#16a34a',
  work: '#2563eb',
  freelance: '#7c3aed',
  other: '#ea580c',
};

const Store = {
  _cache: null,

  async load() {
    this._cache = await window.gitguise.store.get();
    return this._cache;
  },

  async get() {
    if (!this._cache) await this.load();
    return this._cache;
  },

  async refresh() {
    return this.load();
  },

  async set(key, value) {
    await window.gitguise.store.set(key, value);
    if (this._cache) this._cache[key] = value;
  },

  getProfiles() {
    return this._cache?.profiles || [];
  },

  getSettings() {
    return this._cache?.settings || {
      appName: 'GitGuise',
      appId: 'app.gitguise',
      theme: 'dark',
      launchAtStartup: false,
      repoScanDepth: 2,
      hooks: { prePush: true, gitInit: true, gitRemoteAdd: true },
    };
  },

  isWizardCompleted() {
    return this._cache?.wizardCompleted || false;
  },

  async completeWizard() {
    await this.set('wizardCompleted', true);
  },

  async reset() {
    await window.gitguise.store.reset();
    this._cache = null;
  },
};

function generateId() {
  return crypto.randomUUID();
}

function getColorForLabel(label) {
  return LABEL_COLORS[label] || LABEL_COLORS.other;
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function deriveSshKeyName(profile) {
  const base = slugify(profile.displayName || profile.githubUsername || 'profile');
  return `id_ed25519_${base}`;
}

function deriveSshHostAlias(profile) {
  const base = slugify(profile.displayName || profile.label || 'profile');
  return `github-${base}`;
}

const LABEL_NAMES = {
  personal: 'Personal',
  work: 'Work',
  freelance: 'Freelance',
  other: 'Other',
};

function deriveDisplayName({ customLabel, label, githubUsername }) {
  return customLabel || LABEL_NAMES[label] || githubUsername || 'Profile';
}

function normalizeProfile(profile) {
  const rawLabel = profile.label || 'other';
  const customLabelInput = (profile.customLabel || '').trim();
  const customLabel =
    rawLabel === 'custom'
      ? customLabelInput
      : (rawLabel === 'other' && !customLabelInput ? 'Other' : customLabelInput);
  const label = rawLabel === 'custom' ? 'other' : rawLabel;
  const displayName =
    profile.displayName || deriveDisplayName({ customLabel, label, githubUsername: profile.githubUsername });
  const withName = { ...profile, displayName, label };
  return {
    id: profile.id || generateId(),
    displayName,
    githubUsername: profile.githubUsername,
    email: profile.email,
    label,
    customLabel: customLabel || undefined,
    color: profile.color || getColorForLabel(label),
    sshKeyName: profile.sshKeyName || deriveSshKeyName(withName),
    sshHostAlias: profile.sshHostAlias || deriveSshHostAlias(withName),
    isDefault: !!profile.isDefault,
    createdAt: profile.createdAt || new Date().toISOString(),
  };
}

function formatActivityTimestamp(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const pad2 = (n) => String(n).padStart(2, '0');
  const ordinal = (n) => {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
    switch (n % 10) {
      case 1: return `${n}st`;
      case 2: return `${n}nd`;
      case 3: return `${n}rd`;
      default: return `${n}th`;
    }
  };
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const dd = ordinal(parseInt(pad2(d.getDate()), 10));
  const mmm = months[d.getMonth()];
  const yy = pad2(d.getFullYear() % 100);
  return `${hh}:${mm}, ${dd} ${mmm} ${yy}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const key = `${type}::${message}`;
  const existing = container?.querySelector(`.toast[data-toast-key="${CSS.escape(key)}"]`);

  const toast = existing || document.createElement('div');
  if (!existing) {
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.dataset.toastKey = key;
    container.appendChild(toast);
  } else {
    // re-trigger animation / keep single toast visible
    toast.style.opacity = '';
    toast.style.transform = '';
    toast.style.transition = '';
  }

  if (toast._dismissTimer) clearTimeout(toast._dismissTimer);
  toast._dismissTimer = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = '200ms ease';
    setTimeout(() => toast.remove(), 200);
  }, 3500);
}

function showModal({ title, body, footer, onClose }) {
  const overlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalFooter = document.getElementById('modal-footer');

  modalTitle.textContent = title;
  modalBody.innerHTML = typeof body === 'string' ? body : '';
  if (typeof body !== 'string' && body instanceof HTMLElement) {
    modalBody.innerHTML = '';
    modalBody.appendChild(body);
  }
  modalFooter.innerHTML = footer || '';

  overlay.classList.remove('hidden');

  const close = () => {
    overlay.classList.add('hidden');
    if (onClose) onClose();
  };

  document.getElementById('modal-close').onclick = close;
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };

  return { close, modalBody, modalFooter };
}

function showConfirmModal({ title, description, confirmText = 'Confirm', danger = false, onConfirm }) {
  return new Promise((resolve) => {
    const footer = `
      <button class="btn btn-ghost" id="confirm-cancel">Cancel</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirm-ok">${escapeHtml(confirmText)}</button>
    `;
    const modal = showModal({
      title,
      body: `<div class="confirm-modal"><p>${escapeHtml(description)}</p></div>`,
      footer,
    });

    document.getElementById('confirm-cancel').onclick = () => {
      modal.close();
      resolve(false);
    };
    document.getElementById('confirm-ok').onclick = async () => {
      if (onConfirm) await onConfirm();
      modal.close();
      resolve(true);
    };
  });
}

function setupCodeBlockCopy(container) {
  container.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const code = btn.closest('.code-block').querySelector('code, pre').textContent;
      await window.gitguise.app.copyToClipboard(code);
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = 'Copy';
        btn.classList.remove('copied');
      }, 2000);
    });
  });
}

function createStreamId() {
  return `stream-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function stripAnsi(str) {
  return (str || '')
    // CSI sequences: ESC [ ... final-byte  (colors, cursor moves, clears, etc.)
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    // OSC sequences: ESC ] ... BEL or ESC \
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    // Other single-char escape sequences
    .replace(/\x1b[@-Z\\-_]/g, '')
    // Lone carriage returns used to redraw a line
    .replace(/\r(?!\n)/g, '')
    // Remaining non-printable control chars (keep \n and \t)
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    // GitHub's SSH test message is noisy but harmless.
    .replace(/,?\s*but GitHub does not provide shell access\.?/gi, '');
}

function attachTerminal(streamId, terminalEl, onComplete) {
  terminalEl.innerHTML = '';
  const unsubOut = window.gitguise.shell.onOutput(({ streamId: sid, data }) => {
    if (sid !== streamId) return;
    const clean = stripAnsi(data);
    if (!clean) return;
    const line = document.createElement('span');
    line.className = 'line';
    line.textContent = clean;
    terminalEl.appendChild(line);
    terminalEl.scrollTop = terminalEl.scrollHeight;
  });
  const unsubExit = window.gitguise.shell.onExit(({ streamId: sid, exitCode, output }) => {
    if (sid !== streamId) return;
    unsubOut();
    unsubExit();
    if (onComplete) onComplete({ exitCode, output });
  });
}
