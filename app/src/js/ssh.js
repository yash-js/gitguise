const SSH = {
  async checkKeyExists(sshKeyName) {
    return window.gitguise.ssh.checkKeyExists(sshKeyName);
  },

  async getPublicKey(sshKeyName) {
    return window.gitguise.ssh.getPublicKey(sshKeyName);
  },

  async generateKey(profile, terminalEl, onComplete) {
    const p = normalizeProfile(profile);
    const streamId = createStreamId();
    const cmd = `ssh-keygen -t ed25519 -C "${p.email}" -f ~/.ssh/${p.sshKeyName} -N ""`;

    const confirmed = await showConfirmModal({
      title: 'Generate SSH Key',
      description: `This will run:\n\n${cmd}`,
      confirmText: 'Generate',
    });
    if (!confirmed) return null;

    attachTerminal(streamId, terminalEl, async ({ exitCode }) => {
      if (exitCode === 0) {
        const publicKey = await SSH.getPublicKey(p.sshKeyName);
        if (onComplete) onComplete(publicKey);
        showToast('SSH key generated', 'success');
      } else {
        showToast('Key generation failed', 'error');
      }
    });

    return window.gitguise.ssh.generateKey({
      email: p.email,
      sshKeyName: p.sshKeyName,
      streamId,
    });
  },

  async testConnection(profile, terminalEl, resultEl, options = {}) {
    const p = normalizeProfile(profile);
    const streamId = createStreamId();
    const cmd = `ssh -T git@${p.sshHostAlias}`;

    resultEl.innerHTML = '';
    terminalEl.innerHTML = '';

    return new Promise((resolve) => {
      attachTerminal(streamId, terminalEl, async ({ output }) => {
        terminalEl.querySelector('.term-pending')?.remove();
        const success = output.includes('successfully authenticated') || output.includes('Hi ');
        if (success) {
          // The terminal output already shows the success line; avoid duplicating it below.
          resultEl.innerHTML = '';
        } else {
          const fixLabel = options.fixLabel || 'Go back to fix →';
          resultEl.innerHTML = `<span class="text-danger"><i class="ti ti-x"></i> Connection failed. <a href="#" class="btn-link fix-link">${escapeHtml(fixLabel)}</a></span>`;
          resultEl.querySelector('.fix-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof options.onFix === 'function') options.onFix();
            else Wizard.goToStep(3);
          });
        }
        resolve({ success, output });
      });

      const cmdLine = document.createElement('span');
      cmdLine.className = 'line term-cmd';
      cmdLine.textContent = `$ ${cmd}\n`;
      terminalEl.appendChild(cmdLine);

      const pending = document.createElement('span');
      pending.className = 'line term-pending';
      pending.textContent = 'Connecting';
      terminalEl.appendChild(pending);

      window.gitguise.ssh.testConnection({ sshHostAlias: p.sshHostAlias, streamId });
    });
  },

  async writeConfig(profiles) {
    const confirmed = await showConfirmModal({
      title: 'Apply SSH Config',
      description: 'This will merge new Host blocks into ~/.ssh/config without overwriting existing entries.',
      confirmText: 'Apply',
    });
    if (!confirmed) return null;
    const result = await window.gitguise.ssh.writeConfig(profiles.map(normalizeProfile));
    showToast(`SSH config written to ${result.path}`, 'success');
    return result;
  },

  async getPreview(profiles) {
    return window.gitguise.ssh.previewConfig(profiles.map(normalizeProfile));
  },

  async getMergePreview(profiles) {
    return window.gitguise.ssh.mergePreview(profiles.map(normalizeProfile));
  },

  renderHighlightedConfig(config, container) {
    container.innerHTML = `<pre><code class="language-ini">${escapeHtml(config)}</code></pre>`;
    if (window.hljs) {
      container.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
      });
    }
  },
};
