const { app, BrowserWindow, ipcMain, shell, dialog, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execSync } = require('child_process');
const Store = require('electron-store');
const pty = require('node-pty');
const { randomUUID } = require('crypto');
const hooksLib = require('./lib/hooks');

let mainWindow = null;
const activePtys = new Map();

const store = new Store({
  defaults: {
    profiles: [],
    wizardCompleted: false,
    settings: {
      theme: 'dark',
      launchAtStartup: false,
      repoScanDepth: 2,
      hooks: {
        prePush: true,
        gitInit: true,
        gitRemoteAdd: true,
      },
    },
    recentActivity: [],
    lastScannedFolder: '',
    hooksStale: false,
    hooksLastAppliedAt: null,
  },
});

function getGitBashPath() {
  const candidates = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Git', 'bin', 'bash.exe'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function parseSshConfigHosts(configContent) {
  const hosts = [];
  const lines = (configContent || '').split(/\r?\n/);
  let current = null;
  const push = () => {
    if (current) hosts.push(current);
    current = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const hostMatch = line.match(/^Host\s+(.+)$/i);
    if (hostMatch) {
      push();
      current = { host: hostMatch[1].trim(), hostName: '', identityFile: '', user: '' };
      continue;
    }
    if (!current) continue;
    const hostName = line.match(/^HostName\s+(.+)$/i);
    if (hostName) current.hostName = hostName[1].trim();
    const identity = line.match(/^IdentityFile\s+(.+)$/i);
    if (identity) current.identityFile = identity[1].trim().replace(/^["']|["']$/g, '');
    const user = line.match(/^User\s+(.+)$/i);
    if (user) current.user = user[1].trim();
  }
  push();
  return hosts;
}

function readPubKeyComment(sshDir, keyName) {
  if (!keyName) return '';
  const pubPath = path.join(sshDir, keyName + '.pub');
  if (!fs.existsSync(pubPath)) return '';
  try {
    const parts = fs.readFileSync(pubPath, 'utf8').trim().split(/\s+/);
    const comment = parts.slice(2).join(' ').trim();
    return comment;
  } catch {
    return '';
  }
}

function parseGithubHi(output) {
  const m = (output || '').match(/Hi\s+([^!\s]+)!/i);
  return m ? m[1].trim() : '';
}

function detectGithubUsername(alias) {
  const cmd = `ssh -T -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=5 git@${alias}`;
  try {
    const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 9000 });
    return parseGithubHi(out);
  } catch (e) {
    // GitHub returns a non-zero exit code even on success; the greeting is on stderr.
    const out = `${e.stdout || ''}${e.stderr || ''}`;
    return parseGithubHi(out);
  }
}

function titleCaseName(str) {
  return (str || '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .trim();
}

function guessLabel(text) {
  const t = (text || '').toLowerCase();
  if (t.includes('personal')) return 'personal';
  if (t.includes('work')) return 'work';
  if (t.includes('freelance') || t.includes('client')) return 'freelance';
  return 'other';
}

// Standard labels map directly; unknown ones become a custom label
// derived from the alias/email so the profile has a meaningful name.
function buildLabel(guessed, fallbackBase) {
  if (guessed === 'other') {
    const custom = titleCaseName(fallbackBase);
    return custom ? { label: 'custom', customLabel: custom } : { label: 'other' };
  }
  return { label: guessed };
}

function detectSystemProfiles() {
  const home = os.homedir();
  const sshDir = path.join(home, '.ssh');

  let globalName = '';
  let globalEmail = '';
  try {
    globalName = execSync('git config --global user.name', { encoding: 'utf8' }).trim();
  } catch {
    /* not set */
  }
  try {
    globalEmail = execSync('git config --global user.email', { encoding: 'utf8' }).trim();
  } catch {
    /* not set */
  }

  const profiles = [];
  const seenAliases = new Set();
  const seenEmails = new Set();

  const configPath = path.join(sshDir, 'config');
  if (fs.existsSync(configPath)) {
    let hosts = [];
    try {
      hosts = parseSshConfigHosts(fs.readFileSync(configPath, 'utf8'));
    } catch {
      hosts = [];
    }
    for (const h of hosts) {
      const alias = h.host;
      if (!alias || alias.includes('*')) continue;
      const isGithub =
        /github/i.test(alias) || /github\.com$/i.test(h.hostName || '');
      if (!isGithub) continue;
      if (seenAliases.has(alias)) continue;
      seenAliases.add(alias);

      const keyName = h.identityFile ? path.basename(h.identityFile) : '';
      const comment = readPubKeyComment(sshDir, keyName);
      const email = comment && /@/.test(comment) ? comment : '';
      const base = alias.replace(/^github[-_.]?/i, '') || alias;
      const keyExists = keyName && fs.existsSync(path.join(sshDir, keyName));
      const githubUsername = keyExists ? detectGithubUsername(alias) : '';

      if (email) seenEmails.add(email);

      profiles.push({
        githubUsername,
        email,
        ...buildLabel(guessLabel(`${alias} ${keyName} ${email}`), base),
        sshKeyName: keyName || undefined,
        sshHostAlias: alias,
        source: 'ssh-config',
      });
    }
  }

  if (globalEmail && !seenEmails.has(globalEmail)) {
    profiles.push({
      githubUsername: '',
      email: globalEmail,
      ...buildLabel(guessLabel(globalName || globalEmail), globalEmail.split('@')[0]),
      source: 'git-global',
    });
    seenEmails.add(globalEmail);
  }

  return { globalName, globalEmail, profiles };
}

function escapeGitValue(value) {
  return String(value ?? '').replace(/"/g, '\\"');
}

function tryGetGlobalGitConfig(key) {
  try {
    return execSync(`git config --global ${key}`, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function trySetGlobalGitConfig(key, value) {
  try {
    execSync(`git config --global ${key} "${escapeGitValue(value)}"`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function ensureGlobalGitIdentity(profiles) {
  const existingEmail = tryGetGlobalGitConfig('user.email');
  const existingName = tryGetGlobalGitConfig('user.name');
  if (existingEmail && existingName) return false;

  const normalized = (profiles || []).map(hooksLib.normalizeProfile);
  const preferred =
    normalized.find((p) => p.isDefault) ||
    normalized.find((p) => p.source === 'git-global') ||
    normalized.find((p) => p.email) ||
    null;
  if (!preferred) return false;

  let changed = false;
  if (!existingEmail && preferred.email) changed = trySetGlobalGitConfig('user.email', preferred.email) || changed;
  if (!existingName) changed = trySetGlobalGitConfig('user.name', preferred.githubUsername || preferred.displayName) || changed;
  return changed;
}

function ensureHooksAppliedIfNeeded() {
  try {
    const settings = store.get('settings');
    const profiles = store.get('profiles', []);
    if (!profiles.length) return;

    const desired = {
      prePush: settings?.hooks?.prePush !== false,
      gitInit: settings?.hooks?.gitInit !== false,
      gitRemoteAdd: settings?.hooks?.gitRemoteAdd !== false,
    };

    const status = hooksLib.getHooksStatus();
    const missing =
      (desired.prePush && !status.prePush) ||
      (desired.gitInit && !status.gitInit) ||
      (desired.gitRemoteAdd && !status.gitRemoteAdd);

    // If hooks were ever applied before (or are currently missing), keep them in sync silently.
    if (store.get('hooksLastAppliedAt') || missing) {
      hooksLib.writeHooks(profiles, settings);
      store.set('hooksStale', false);
      store.set('hooksLastAppliedAt', new Date().toISOString());
    }
  } catch {
    /* best-effort */
  }
}

function getPlatformInfo() {
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const isLinux = process.platform === 'linux';
  return {
    isWindows,
    isMac,
    isLinux,
    shellConfigFile: hooksLib.getShellConfigFile(),
    gitBashPath: isWindows ? getGitBashPath() : null,
  };
}

function spawnShell(command, cwd) {
  const platform = process.platform;
  let shellPath;
  let args;

  if (platform === 'win32') {
    const bash = getGitBashPath();
    if (!bash) throw new Error('GIT_BASH_NOT_FOUND');
    shellPath = bash;
    args = ['-c', command];
  } else {
    shellPath = process.env.SHELL || '/bin/bash';
    args = ['-c', command];
  }

  return spawn(shellPath, args, {
    cwd: cwd || os.homedir(),
    env: process.env,
  });
}

function runPty(command, cwd, streamId) {
  return new Promise((resolve, reject) => {
    const platform = process.platform;
    let shellPath;
    let args;

    if (platform === 'win32') {
      const bash = getGitBashPath();
      if (!bash) {
        reject(new Error('GIT_BASH_NOT_FOUND'));
        return;
      }
      shellPath = bash;
      args = ['-c', command];
    } else {
      shellPath = process.env.SHELL || '/bin/bash';
      args = ['-c', command];
    }

    const term = pty.spawn(shellPath, args, {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: cwd || os.homedir(),
      env: process.env,
    });

    activePtys.set(streamId, term);
    let output = '';

    term.onData((data) => {
      output += data;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('shell:output', { streamId, data });
      }
    });

    term.onExit(({ exitCode }) => {
      activePtys.delete(streamId);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('shell:exit', { streamId, exitCode, output });
      }
      resolve({ exitCode, output });
    });
  });
}

function addActivity(entry) {
  const activities = store.get('recentActivity', []);
  activities.unshift({
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...entry,
  });
  store.set('recentActivity', activities.slice(0, 50));
}

function formatProfileIdentity(p) {
  const name = p?.displayName || 'Profile';
  const u = (p?.githubUsername || '').trim();
  const e = (p?.email || '').trim();
  const ident = [u ? `@${u}` : '', e].filter(Boolean).join(' / ');
  return ident ? `${name} (${ident})` : name;
}

function createWindow() {
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    title: 'GitGuise',
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0a0a0a',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 18, y: 18 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function registerIpcHandlers() {
  ipcMain.handle('profiles:get-all', () => store.get('profiles', []));

  ipcMain.handle('profiles:save', (_, profile) => {
    const profiles = store.get('profiles', []);
    const normalized = hooksLib.normalizeProfile(profile);
    const others = profiles.filter((p) => p.id !== normalized.id);
    const emailKey = (normalized.email || '').toLowerCase();
    const usernameKey = (normalized.githubUsername || '').toLowerCase();
    const labelKey = ((normalized.customLabel || normalized.label || '').trim().toLowerCase());
    if (emailKey && others.some((p) => (p.email || '').toLowerCase() === emailKey)) {
      throw new Error('DUPLICATE_EMAIL');
    }
    if (usernameKey && others.some((p) => (p.githubUsername || '').toLowerCase() === usernameKey)) {
      throw new Error('DUPLICATE_USERNAME');
    }
    if (labelKey && others.some((p) => ((p.customLabel || p.label || '').trim().toLowerCase()) === labelKey)) {
      throw new Error('DUPLICATE_LABEL');
    }
    const idx = profiles.findIndex((p) => p.id === normalized.id);
    const isNew = idx < 0;
    if (idx >= 0) {
      profiles[idx] = normalized;
    } else {
      if (profiles.length === 0) normalized.isDefault = true;
      profiles.push(normalized);
    }
    if (normalized.isDefault) {
      profiles.forEach((p) => {
        p.isDefault = p.id === normalized.id;
      });
    }
    store.set('profiles', profiles);
    store.set('hooksStale', true);

    addActivity({
      profileId: normalized.id,
      message: isNew
        ? `New profile "${formatProfileIdentity(normalized)}" added`
        : `Profile "${formatProfileIdentity(normalized)}" updated`,
      color: normalized.color,
    });

    return normalized;
  });

  ipcMain.handle('profiles:delete', (_, id, options = {}) => {
    let profiles = store.get('profiles', []);
    const deleted = profiles.find((p) => p.id === id);
    profiles = profiles.filter((p) => p.id !== id);
    if (deleted?.isDefault && profiles.length > 0) {
      profiles[0].isDefault = true;
    }
    store.set('profiles', profiles);

    if (deleted) {
      addActivity({
        profileId: deleted.id,
        message: `Deleted "${formatProfileIdentity(deleted)}" profile`,
        color: deleted.color,
      });

      // Remove the profile's SSH config host block.
      const sshDir = path.join(os.homedir(), '.ssh');
      const sshConfigPath = path.join(sshDir, 'config');
      if (deleted.sshHostAlias && fs.existsSync(sshConfigPath)) {
        try {
          const existing = fs.readFileSync(sshConfigPath, 'utf8');
          const updated = hooksLib.removeSshConfigBlock(existing, deleted.sshHostAlias);
          fs.writeFileSync(sshConfigPath, updated, { mode: 0o600 });
        } catch {
          /* ignore config write errors */
        }
      }

      // Optionally delete the SSH key files for this profile.
      if (options.deleteKeys && deleted.sshKeyName) {
        const keyPath = path.join(sshDir, deleted.sshKeyName);
        for (const f of [keyPath, `${keyPath}.pub`]) {
          try {
            if (fs.existsSync(f)) fs.unlinkSync(f);
          } catch {
            /* ignore */
          }
        }
      }

      // Keep hooks in sync: regenerate if they were applied, else mark stale.
      if (store.get('hooksLastAppliedAt')) {
        if (profiles.length) {
          hooksLib.writeHooks(profiles, store.get('settings'));
          store.set('hooksLastAppliedAt', new Date().toISOString());
          store.set('hooksStale', false);
        } else {
          hooksLib.removeHooks();
          store.set('hooksLastAppliedAt', null);
          store.set('hooksStale', false);
        }
      } else {
        store.set('hooksStale', true);
      }
    }

    return profiles;
  });

  ipcMain.handle('store:get', () => ({
    profiles: store.get('profiles'),
    wizardCompleted: store.get('wizardCompleted'),
    settings: store.get('settings'),
    recentActivity: store.get('recentActivity'),
    lastScannedFolder: store.get('lastScannedFolder'),
    hooksStale: store.get('hooksStale'),
    hooksLastAppliedAt: store.get('hooksLastAppliedAt'),
  }));

  ipcMain.handle('store:set', (_, key, value) => {
    store.set(key, value);
    return true;
  });

  ipcMain.handle('store:reset', () => {
    const profiles = store.get('profiles', []);
    hooksLib.removeHooks();
    const sshConfigPath = path.join(os.homedir(), '.ssh', 'config');
    if (fs.existsSync(sshConfigPath)) {
      let content = fs.readFileSync(sshConfigPath, 'utf8');
      for (const p of profiles) {
        const blockRegex = new RegExp(
          `# ${p.displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?(?=\\n# |\\nHost |$)`,
          'g'
        );
        content = content.replace(blockRegex, '');
      }
      fs.writeFileSync(sshConfigPath, content.trim() + '\n');
    }
    store.clear();
    return true;
  });

  ipcMain.handle('ssh:check-key-exists', (_, sshKeyName) => {
    const keyPath = path.join(os.homedir(), '.ssh', sshKeyName);
    const pubPath = keyPath + '.pub';
    return {
      exists: fs.existsSync(pubPath),
      path: keyPath,
      pubPath,
    };
  });

  ipcMain.handle('ssh:generate-key', async (_, { email, sshKeyName, streamId }) => {
    const sshDir = path.join(os.homedir(), '.ssh');
    if (!fs.existsSync(sshDir)) fs.mkdirSync(sshDir, { mode: 0o700 });
    const keyPath = path.join(sshDir, sshKeyName);
    // The shell is Git Bash on Windows, which mangles backslash paths.
    // Use forward slashes so ssh-keygen writes to the correct location.
    const keyPathPosix = keyPath.replace(/\\/g, '/');
    const cmd = `ssh-keygen -t ed25519 -C "${email}" -f "${keyPathPosix}" -N ""`;
    await runPty(cmd, sshDir, streamId);
    const pubPath = keyPath + '.pub';
    const publicKey = fs.existsSync(pubPath) ? fs.readFileSync(pubPath, 'utf8').trim() : '';
    return { publicKey };
  });

  ipcMain.handle('ssh:get-public-key', (_, sshKeyName) => {
    const pubPath = path.join(os.homedir(), '.ssh', sshKeyName + '.pub');
    if (!fs.existsSync(pubPath)) return '';
    return fs.readFileSync(pubPath, 'utf8').trim();
  });

  ipcMain.handle('ssh:test-connection', async (_, { sshHostAlias, streamId }) => {
    const cmd = `ssh -T git@${sshHostAlias}`;
    const result = await runPty(cmd, os.homedir(), streamId);
    const success =
      result.output.includes('successfully authenticated') ||
      result.output.includes('Hi ');
    return { success, output: result.output };
  });

  ipcMain.handle('ssh:read-config', () => {
    const configPath = path.join(os.homedir(), '.ssh', 'config');
    if (!fs.existsSync(configPath)) return '';
    return fs.readFileSync(configPath, 'utf8');
  });

  ipcMain.handle('ssh:write-config', (_, profiles) => {
    const sshDir = path.join(os.homedir(), '.ssh');
    if (!fs.existsSync(sshDir)) fs.mkdirSync(sshDir, { mode: 0o700 });
    const configPath = path.join(sshDir, 'config');
    const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
    const normalized = profiles.map(hooksLib.normalizeProfile);
    const { merged, added } = hooksLib.mergeSshConfig(existing, normalized);
    fs.writeFileSync(configPath, merged.trim() + '\n', { mode: 0o600 });

    if (process.platform === 'darwin') {
      for (const p of normalized) {
        const keyPath = path.join(sshDir, p.sshKeyName);
        if (fs.existsSync(keyPath)) {
          try {
            execSync(`ssh-add --apple-use-keychain "${keyPath}"`, { stdio: 'pipe' });
          } catch {
            /* key may already be loaded */
          }
        }
      }
      if (!existing.includes('AddKeysToAgent')) {
        const keychainBlock = `\nHost *\n  AddKeysToAgent yes\n  UseKeychain yes\n`;
        fs.appendFileSync(configPath, keychainBlock);
      }
    } else {
      for (const p of normalized) {
        const keyPath = path.join(sshDir, p.sshKeyName);
        if (fs.existsSync(keyPath)) {
          try {
            spawnShell(`ssh-add "${keyPath}"`);
          } catch {
            /* ignore */
          }
        }
      }
    }

    return { path: configPath, added };
  });

  ipcMain.handle('ssh:preview-config', (_, profiles) => {
    const normalized = profiles.map(hooksLib.normalizeProfile);
    return hooksLib.generateSshConfig(normalized);
  });

  ipcMain.handle('ssh:merge-preview', (_, profiles) => {
    const configPath = path.join(os.homedir(), '.ssh', 'config');
    const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
    const normalized = profiles.map(hooksLib.normalizeProfile);
    return hooksLib.mergeSshConfig(existing, normalized);
  });

  ipcMain.handle('hooks:preview', (_, profiles, settings) => {
    const normalized = profiles.map(hooksLib.normalizeProfile);
    return hooksLib.getHooksPreview(normalized, settings || store.get('settings'));
  });

  ipcMain.handle('hooks:write-all', () => {
    const profiles = store.get('profiles', []);
    const settings = store.get('settings');
    const written = hooksLib.writeHooks(profiles, settings);
    store.set('hooksStale', false);
    store.set('hooksLastAppliedAt', new Date().toISOString());
    return { written };
  });

  ipcMain.handle('hooks:remove-all', () => {
    const removed = hooksLib.removeHooks();
    store.set('hooksStale', false);
    return { removed };
  });

  ipcMain.handle('hooks:get-status', () => hooksLib.getHooksStatus());

  ipcMain.handle('hooks:regenerate', () => {
    const profiles = store.get('profiles', []);
    const settings = store.get('settings');
    const written = hooksLib.writeHooks(profiles, settings);
    store.set('hooksStale', false);
    store.set('hooksLastAppliedAt', new Date().toISOString());
    return { written };
  });

  ipcMain.handle('repos:scan', async (_, { folderPath, depth }) => {
    const scanDepth = depth ?? store.get('settings.repoScanDepth', 2);
    const repos = [];
    const home = os.homedir();

    function scanDir(dir, currentDepth) {
      if (currentDepth > scanDepth) return;
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      const gitDir = path.join(dir, '.git');
      if (fs.existsSync(gitDir)) {
        const info = getRepoInfo(dir);
        repos.push(info);
        return;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        scanDir(path.join(dir, entry.name), currentDepth + 1);
      }
    }

    scanDir(folderPath, 0);
    store.set('lastScannedFolder', folderPath);
    return repos;
  });

  ipcMain.handle('repos:get-info', (_, repoPath) => getRepoInfo(repoPath));

  ipcMain.handle('repos:switch-profile', async (_, { repoPath, profileId }) => {
    const profiles = store.get('profiles', []);
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) throw new Error('Profile not found');

    const p = hooksLib.normalizeProfile(profile);
    runGitConfig(repoPath, 'user.email', p.email);
    runGitConfig(repoPath, 'user.name', p.githubUsername || p.displayName);

    const remote = getGitRemote(repoPath);
    if (remote) {
      const slug = extractRepoSlug(remote);
      const newRemote = `git@${p.sshHostAlias}:${p.githubUsername}/${slug}.git`;
      runGitCommand(repoPath, `git remote set-url origin "${newRemote}"`);
    }

    addActivity({
      profileId: p.id,
      profileName: p.displayName,
      action: 'switched profile',
      repo: path.basename(repoPath),
      color: p.color,
    });

    return getRepoInfo(repoPath);
  });

  ipcMain.handle('repos:push', async (_, { repoPath, streamId }) => {
    const profile = detectProfileForRepo(repoPath);
    const result = await runPty('git push', repoPath, streamId);
    if (result.exitCode === 0) {
      addActivity({
        profileId: profile?.id,
        profileName: profile?.displayName || 'Unknown',
        action: 'pushed to',
        repo: path.basename(repoPath),
        color: profile?.color || '#888',
      });
    }
    return { exitCode: result.exitCode, output: result.output };
  });

  ipcMain.handle('shell:run', async (_, { command, cwd, streamId }) => {
    return runPty(command, cwd, streamId);
  });

  ipcMain.handle('app:open-url', (_, url) => {
    shell.openExternal(url);
    return true;
  });

  ipcMain.handle('app:select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('app:get-platform', () => getPlatformInfo());

  ipcMain.handle('system:detect-profiles', () => detectSystemProfiles());

  ipcMain.handle('app:open-in-terminal', (_, folderPath) => {
    const platform = process.platform;
    if (platform === 'darwin') {
      spawn('open', ['-a', 'Terminal', folderPath]);
    } else if (platform === 'win32') {
      spawn('cmd', ['/c', 'start', 'cmd', '/K', `cd /d "${folderPath}"`]);
    } else {
      const terminals = ['gnome-terminal', 'konsole', 'xterm'];
      for (const term of terminals) {
        try {
          spawn(term, ['--working-directory', folderPath], { detached: true });
          break;
        } catch {
          continue;
        }
      }
    }
    return true;
  });

  ipcMain.handle('app:open-in-explorer', (_, folderPath) => {
    shell.openPath(folderPath);
    return true;
  });

  ipcMain.handle('app:copy-to-clipboard', (_, text) => {
    clipboard.writeText(text);
    return true;
  });

  ipcMain.handle('app:get-version', () => app.getVersion());

  ipcMain.handle('app:export-config', async () => {
    const data = {
      profiles: store.get('profiles'),
      settings: store.get('settings'),
      exportedAt: new Date().toISOString(),
      version: app.getVersion(),
    };
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: 'gitguise-config.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return null;
    fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2));
    return result.filePath;
  });

  ipcMain.handle('app:import-config', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePaths.length) return null;
    const data = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
    if (data.profiles) {
      const profiles = data.profiles.map(hooksLib.normalizeProfile);
      for (const p of profiles) {
        const pubPath = path.join(os.homedir(), '.ssh', p.sshKeyName + '.pub');
        p.sshKeyExists = fs.existsSync(pubPath);
      }
      store.set('profiles', profiles);
    }
    if (data.settings) store.set('settings', { ...store.get('settings'), ...data.settings });
    store.set('hooksStale', true);
    return data;
  });

  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on('window:close', () => mainWindow?.close());
  ipcMain.on('shell:kill', (_, streamId) => {
    const term = activePtys.get(streamId);
    if (term) term.kill();
  });
}

function runGitConfig(repoPath, key, value) {
  try {
    execSync(`git config ${key} "${value}"`, { cwd: repoPath, stdio: 'pipe' });
  } catch {
    /* ignore */
  }
}

function runGitCommand(repoPath, command) {
  try {
    execSync(command, { cwd: repoPath, stdio: 'pipe', shell: true });
  } catch {
    /* ignore */
  }
}

function getGitRemote(repoPath) {
  try {
    return execSync('git remote get-url origin', { cwd: repoPath, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function getGitBranch(repoPath) {
  try {
    return execSync('git branch --show-current', { cwd: repoPath, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function getGitEmail(repoPath) {
  try {
    return execSync('git config user.email', { cwd: repoPath, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function extractRepoSlug(remote) {
  const match = remote.match(/[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (match) return match[2];
  return path.basename(remote, '.git');
}

function detectProfileForRepo(repoPath) {
  const profiles = store.get('profiles', []);
  const email = getGitEmail(repoPath);
  const remote = getGitRemote(repoPath);

  if (email) {
    const byEmail = profiles.find((p) => p.email === email);
    if (byEmail) return byEmail;
  }
  if (remote) {
    const byRemote = profiles.find((p) => remote.includes(p.sshHostAlias));
    if (byRemote) return byRemote;
  }
  return null;
}

function getRepoInfo(repoPath) {
  const remote = getGitRemote(repoPath);
  const branch = getGitBranch(repoPath);
  const email = getGitEmail(repoPath);
  const profile = detectProfileForRepo(repoPath);
  let lastModified = '';
  try {
    const stat = fs.statSync(repoPath);
    lastModified = stat.mtime.toISOString();
  } catch {
    /* ignore */
  }
  return {
    path: repoPath,
    name: path.basename(repoPath),
    branch,
    remote,
    email,
    lastModified,
    detectedProfile: profile,
    profileId: profile?.id || null,
  };
}

app.whenReady().then(() => {
  // On startup, best-effort: make sure detected profiles can work immediately.
  // - Ensure global git identity exists (only if missing)
  // - Ensure hooks/wrappers are applied if configured
  try {
    const detected = detectSystemProfiles()?.profiles || [];
    if (detected.length) {
      const existing = store.get('profiles', []);
      const merged = [...existing];
      for (const d of detected) {
        const match = merged.find((e) =>
          (d.email && e.email === d.email) ||
          (d.sshHostAlias && e.sshHostAlias === d.sshHostAlias));
        if (match) {
          if (d.githubUsername && !match.githubUsername) match.githubUsername = d.githubUsername;
        } else {
          merged.push(d);
        }
      }
      store.set('profiles', merged.map(hooksLib.normalizeProfile));
    }
    ensureGlobalGitIdentity(store.get('profiles', []));
    ensureHooksAppliedIfNeeded();
  } catch {
    /* best-effort */
  }

  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
