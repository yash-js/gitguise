const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');

const LABEL_COLORS = {
  personal: '#16a34a',
  work: '#2563eb',
  freelance: '#7c3aed',
  other: '#ea580c',
};

const GITGUISE_START = '# GitGuise:start';
const GITGUISE_END = '# GitGuise:end';
const PRE_PUSH_PATH = path.join(os.homedir(), '.git-hooks', 'pre-push');
const POWERSHELL_START = '# GitGuise:pwsh:start';
const POWERSHELL_END = '# GitGuise:pwsh:end';

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
    id: profile.id || randomUUID(),
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

function generateSshConfigBlock(profile) {
  return `# ${profile.displayName}
Host ${profile.sshHostAlias}
    HostName github.com
    User git
    IdentityFile ~/.ssh/${profile.sshKeyName}`;
}

function generateSshConfig(profiles) {
  return profiles.map(generateSshConfigBlock).join('\n\n');
}

function mergeSshConfig(existing, profiles) {
  const blocks = profiles.map((p) => ({
    host: p.sshHostAlias,
    block: generateSshConfigBlock(p),
  }));

  let result = existing || '';
  const added = [];

  for (const { host, block } of blocks) {
    const hostRegex = new RegExp(`^Host\\s+${host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm');
    if (!hostRegex.test(result)) {
      result = result.trimEnd();
      if (result) result += '\n\n';
      result += block;
      added.push(block);
    }
  }

  return { merged: result, added };
}

function removeSshConfigBlock(content, alias) {
  if (!content || !alias) return content || '';
  const lines = content.split(/\r?\n/);
  const out = [];
  const aliasRe = new RegExp(
    `^Host\\s+${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`,
    'i'
  );
  let i = 0;
  while (i < lines.length) {
    if (aliasRe.test(lines[i].trim())) {
      // Drop the preceding comment label we generated (e.g. "# Work")
      if (out.length && /^#/.test(out[out.length - 1].trim())) out.pop();
      // Skip the Host line and its option lines until a blank line,
      // another Host, or another comment block.
      i++;
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t === '') { i++; break; }
        if (/^Host\s+/i.test(t) || /^#/.test(t)) break;
        i++;
      }
      continue;
    }
    out.push(lines[i]);
    i++;
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function generatePrePushHook(profiles) {
  const detectBlocks = profiles
    .map(
      (p) => `if echo "$CURRENT_REMOTE" | grep -q "${p.sshHostAlias}"; then
  if [ "$CURRENT_EMAIL" = "${p.email}" ]; then
    exit 0
  else
    git config user.email "${p.email}"
    git config user.name "${p.githubUsername || p.displayName}"
    echo "  → Auto-switched to ${p.displayName}"
    exit 0
  fi
fi`
    )
    .join('\n\n');

  const menuLines = profiles
    .map(
      (p, i) =>
        `  echo "│  ${i + 1}) ${p.displayName.padEnd(12)} (${p.email}) │"`
    )
    .join('\n');

  const caseBlocks = profiles
    .map((p, i) => {
      const num = i + 1;
      return `  ${num})
    git config user.email "${p.email}"
    git config user.name "${p.githubUsername || p.displayName}"
    SLUG=$(echo "$CURRENT_REMOTE" | sed 's/.*[:/]\\([^/]*\\)\\.git/\\1/' | sed 's/.*\\///')
    if [ -z "$SLUG" ]; then SLUG=$(basename "$REPO_PATH"); fi
    git remote set-url origin "git@${p.sshHostAlias}:${p.githubUsername}/$SLUG.git"
    echo "  ✓ Switched to ${p.displayName}";;`;
    })
    .join('\n');

  const keepNum = profiles.length + 1;
  const cancelNum = profiles.length + 2;

  return `#!/bin/bash
REPO_PATH=$(pwd)
CURRENT_EMAIL=$(git config user.email)
CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")

${detectBlocks}

echo ""
echo "┌─────────────────────────────────────┐"
echo "│      GitGuise — Account Selector     │"
echo "├─────────────────────────────────────┤"
echo "│  Repo : $(basename "$REPO_PATH")"
echo "│  Now  : $CURRENT_EMAIL"
echo "├─────────────────────────────────────┤"
${menuLines}
echo "│  ${keepNum}) Keep current & push         │"
echo "│  ${cancelNum}) Cancel                        │"
echo "└─────────────────────────────────────┘"
read -p "  Choose: " choice </dev/tty

case "$choice" in
${caseBlocks}
  ${keepNum}) exit 0;;
  ${cancelNum}) echo "  ✕ Cancelled."; exit 1;;
  *) echo "  ✕ Invalid. Cancelled."; exit 1;;
esac
`;
}

function generateGitWrapper(profiles, options = {}) {
  const { gitInit = true, gitRemoteAdd = true } = options;

  let initBlock = '';
  if (gitInit) {
    const initMenu = profiles
      .map((p, i) => `      echo "  ${i + 1}) ${p.displayName} (${p.email})"`)
      .join('\n');
    const initCases = profiles
      .map(
        (p, i) => `      ${i + 1})
        git config user.email "${p.email}"
        git config user.name "${p.githubUsername || p.displayName}"
        echo "  ✓ Set profile to ${p.displayName}";;`
      )
      .join('\n');

    initBlock = `  if [ "$1" = "init" ]; then
    command git init "\${@:2}"
    echo ""
    echo "  GitGuise — Choose profile for this repo:"
${initMenu}
    read -p "  Choose: " gm_choice
    case "$gm_choice" in
${initCases}
      *) echo "  Skipped profile setup.";;
    esac
    return
  fi`;
  }

  let remoteBlock = '';
  if (gitRemoteAdd) {
    const defaultIndex = profiles.findIndex((p) => p.isDefault);
    const remoteMenu = profiles
      .map((p, i) => `        echo "  ${i + 1}) ${p.displayName} (${p.email})"`)
      .join('\n');
    const remoteCases = profiles
      .map(
        (p, i) => `        ${i + 1})
          git config user.email "${p.email}"
          git config user.name "${p.githubUsername || p.displayName}"
          NEW_URL="git@${p.sshHostAlias}:${p.githubUsername}/$REPO.git"
          if git remote get-url "$rname" &>/dev/null; then
            git remote set-url "$rname" "$NEW_URL"
          else
            command git remote add "$rname" "$NEW_URL"
          fi
          echo "  ✓ Remote set to $NEW_URL";;`
      )
      .join('\n');

    const prefix = gitInit ? '  elif' : '  if';
    remoteBlock = `${prefix} [ "$1" = "remote" ] && [ "$2" = "add" ]; then
    local rname="$3"
    local url="$4"
    if echo "$url" | grep -q "https://github.com/"; then
      OWNER=$(echo "$url" | sed 's|https://github.com/||' | cut -d'/' -f1)
      REPO=$(echo "$url" | sed 's|https://github.com/||' | cut -d'/' -f2 | sed 's/.git//')
      # If there's only one profile (or a default), avoid prompting.
      if [ "${profiles.length}" -eq 1 ]; then
        gm_choice="1"
      ${defaultIndex >= 0 ? `elif [ "${defaultIndex + 1}" -ge 1 ]; then
        gm_choice="${defaultIndex + 1}"` : ''}
      else
        echo ""
        echo "  GitGuise — Choose profile for remote:"
${remoteMenu}
        read -p "  Choose: " gm_choice
      fi
      case "$gm_choice" in
${remoteCases}
        *) command git remote add "$rname" "$url";;
      esac
    else
      command git remote add "$rname" "$url"
    fi
    return
  fi`;
  }

  return `${GITGUISE_START}
git() {
${initBlock}
${remoteBlock}
  command git "$@"
}
${GITGUISE_END}`;
}

function generatePowerShellGitWrapper(profiles, options = {}) {
  const { gitRemoteAdd = true } = options;
  if (!gitRemoteAdd) return '';

  const defaultIndex = profiles.findIndex((p) => p.isDefault);

  const profileTable = profiles
    .map((p) => {
      const safe = (s) => String(s || '').replace(/`/g, '``').replace(/"/g, '""');
      return `@{ displayName="${safe(p.displayName)}"; email="${safe(p.email)}"; name="${safe(p.githubUsername || p.displayName)}"; alias="${safe(p.sshHostAlias)}"; username="${safe(p.githubUsername)}"; isDefault=${p.isDefault ? '$true' : '$false'} }`;
    })
    .join(',\n    ');

  return `${POWERSHELL_START}
function git {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $gmArgs
  )

  $profiles = @(
    ${profileTable}
  )

  if ($gmArgs.Length -ge 4 -and $gmArgs[0] -eq 'remote' -and $gmArgs[1] -eq 'add') {
    $rname = $gmArgs[2]
    $url = $gmArgs[3]

    if ($url -match '^https://github\\.com/([^/]+)/([^/]+?)(\\.git)?$') {
      $repo = $Matches[2]

      $choice = $null
      if ($profiles.Count -eq 1) {
        $choice = 0
      } elseif (${defaultIndex >= 0 ? '$true' : '$false'}) {
        $choice = ${defaultIndex >= 0 ? defaultIndex : 0}
      } else {
        Write-Host \"\"
        Write-Host \"  GitGuise — Choose profile for remote:\"
        for ($i = 0; $i -lt $profiles.Count; $i++) {
          $p = $profiles[$i]
          Write-Host (\"  {0}) {1} ({2})\" -f ($i + 1), $p.displayName, $p.email)
        }
        $resp = Read-Host \"  Choose\"
        if ($resp -match '^\\d+$') {
          $n = [int]$resp
          if ($n -ge 1 -and $n -le $profiles.Count) { $choice = $n - 1 }
        }
      }

      if ($choice -ne $null) {
        $p = $profiles[$choice]

        & git.exe config user.email $p.email | Out-Null
        & git.exe config user.name $p.name | Out-Null

        $newUrl = \"git@{0}:{1}/{2}.git\" -f $p.alias, $p.username, $repo
        $has = $false
        try { & git.exe remote get-url $rname | Out-Null; $has = $true } catch {}

        if ($has) { & git.exe remote set-url $rname $newUrl | Out-Null }
        else { & git.exe remote add $rname $newUrl | Out-Null }

        Write-Host (\"  ✓ Remote set to {0}\" -f $newUrl)
        return
      }
    }
  }

  & git.exe @gmArgs
}
${POWERSHELL_END}`;
}

function stripGitGuiseBlock(content) {
  if (!content) return '';
  const startIdx = content.indexOf(GITGUISE_START);
  if (startIdx === -1) return content;
  const endIdx = content.indexOf(GITGUISE_END);
  if (endIdx === -1) return content.slice(0, startIdx).trimEnd();
  const before = content.slice(0, startIdx).trimEnd();
  const after = content.slice(endIdx + GITGUISE_END.length).trimStart();
  return [before, after].filter(Boolean).join('\n\n');
}

function stripPowerShellBlock(content) {
  if (!content) return '';
  const startIdx = content.indexOf(POWERSHELL_START);
  if (startIdx === -1) return content;
  const endIdx = content.indexOf(POWERSHELL_END);
  if (endIdx === -1) return content.slice(0, startIdx).trimEnd();
  const before = content.slice(0, startIdx).trimEnd();
  const after = content.slice(endIdx + POWERSHELL_END.length).trimStart();
  return [before, after].filter(Boolean).join('\r\n\r\n');
}

function appendPowerShellBlock(content, block) {
  const stripped = stripPowerShellBlock(content || '');
  const prefix = stripped ? stripped + '\r\n\r\n' : '';
  return prefix + block + '\r\n';
}

function appendGitGuiseBlock(shellContent, block) {
  const stripped = stripGitGuiseBlock(shellContent);
  const prefix = stripped ? stripped + '\n\n' : '';
  return prefix + block + '\n';
}

function getHooksPreview(profiles, settings) {
  const hookSettings = settings?.hooks || {};
  return {
    prePush: generatePrePushHook(profiles),
    shellWrapper: generateGitWrapper(profiles, {
      gitInit: hookSettings.gitInit !== false,
      gitRemoteAdd: hookSettings.gitRemoteAdd !== false,
    }),
    powerShellWrapper: generatePowerShellGitWrapper(profiles, {
      gitRemoteAdd: hookSettings.gitRemoteAdd !== false,
    }),
  };
}

function getHooksStatus() {
  const shellConfigFile = getShellConfigFile();
  let prePush = false;
  let gitInit = false;
  let gitRemoteAdd = false;
  let powerShellWrapper = false;

  if (fs.existsSync(PRE_PUSH_PATH)) {
    prePush = true;
    const content = fs.readFileSync(PRE_PUSH_PATH, 'utf8');
    gitInit = content.includes('git init');
    gitRemoteAdd = content.includes('remote') && content.includes('add');
  }

  if (fs.existsSync(shellConfigFile)) {
    const shellContent = fs.readFileSync(shellConfigFile, 'utf8');
    if (shellContent.includes(GITGUISE_START)) {
      gitInit = shellContent.includes('"init"') || shellContent.includes("'init'");
      gitRemoteAdd =
        shellContent.includes('"remote"') || shellContent.includes("'remote'");
    }
  }

  if (process.platform === 'win32') {
    const home = os.homedir();
    const candidates = [
      path.join(home, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
      path.join(home, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'),
    ];
    for (const p of candidates) {
      if (!fs.existsSync(p)) continue;
      try {
        const content = fs.readFileSync(p, 'utf8');
        if (content.includes(POWERSHELL_START)) {
          powerShellWrapper = true;
          break;
        }
      } catch {
        /* ignore */
      }
    }
    // On Windows we consider git wrapper "installed" only if PowerShell is wired too.
    if (!powerShellWrapper) {
      gitInit = false;
      gitRemoteAdd = false;
    }
  }

  return { prePush, gitInit, gitRemoteAdd, powerShellWrapper };
}

function getShellConfigFile() {
  const home = os.homedir();
  if (process.platform === 'darwin') {
    const zshrc = path.join(home, '.zshrc');
    if (fs.existsSync(zshrc)) return zshrc;
    return path.join(home, '.bash_profile');
  }
  return path.join(home, '.bashrc');
}

function writeHooks(profiles, settings) {
  const shellConfigFile = getShellConfigFile();
  const preview = getHooksPreview(profiles, settings);
  const written = [];

  if (settings.hooks?.prePush !== false) {
    const hooksDir = path.dirname(PRE_PUSH_PATH);
    if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(PRE_PUSH_PATH, preview.prePush, { mode: 0o755 });
    written.push(PRE_PUSH_PATH);

    const globalHooksPath = path.join(os.homedir(), '.gitconfig');
    let gitconfig = '';
    if (fs.existsSync(globalHooksPath)) {
      gitconfig = fs.readFileSync(globalHooksPath, 'utf8');
    }
    const hookPathLine = `[core]\n\thooksPath = ${hooksDir}`;
    if (!gitconfig.includes('hooksPath')) {
      const updated = gitconfig.trimEnd() + (gitconfig ? '\n\n' : '') + hookPathLine + '\n';
      fs.writeFileSync(globalHooksPath, updated);
      written.push(globalHooksPath);
    }
  }

  if (settings.hooks?.gitInit !== false || settings.hooks?.gitRemoteAdd !== false) {
    let shellContent = '';
    if (fs.existsSync(shellConfigFile)) {
      shellContent = fs.readFileSync(shellConfigFile, 'utf8');
    }
    const updated = appendGitGuiseBlock(shellContent, preview.shellWrapper);
    fs.writeFileSync(shellConfigFile, updated);
    written.push(shellConfigFile);

    if (process.platform === 'win32') {
      const home = os.homedir();
      const psProfile = path.join(home, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1');
      const winPsProfile = path.join(home, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1');
      const target = fs.existsSync(winPsProfile) ? winPsProfile : psProfile;
      const dir = path.dirname(target);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      let psContent = '';
      if (fs.existsSync(target)) psContent = fs.readFileSync(target, 'utf8');
      const psUpdated = appendPowerShellBlock(psContent, preview.powerShellWrapper);
      fs.writeFileSync(target, psUpdated);
      written.push(target);
    }
  }

  return written;
}

function removeHooks() {
  const shellConfigFile = getShellConfigFile();
  const removed = [];

  if (fs.existsSync(PRE_PUSH_PATH)) {
    fs.unlinkSync(PRE_PUSH_PATH);
    removed.push(PRE_PUSH_PATH);
  }

  if (fs.existsSync(shellConfigFile)) {
    const content = fs.readFileSync(shellConfigFile, 'utf8');
    if (content.includes(GITGUISE_START)) {
      fs.writeFileSync(shellConfigFile, stripGitGuiseBlock(content) + '\n');
      removed.push(shellConfigFile);
    }
  }

  if (process.platform === 'win32') {
    const home = os.homedir();
    const candidates = [
      path.join(home, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
      path.join(home, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'),
    ];
    for (const p of candidates) {
      if (!fs.existsSync(p)) continue;
      try {
        const content = fs.readFileSync(p, 'utf8');
        if (content.includes(POWERSHELL_START)) {
          fs.writeFileSync(p, stripPowerShellBlock(content) + '\r\n');
          removed.push(p);
        }
      } catch {
        /* ignore */
      }
    }
  }

  return removed;
}

module.exports = {
  LABEL_COLORS,
  GITGUISE_START,
  GITGUISE_END,
  PRE_PUSH_PATH,
  POWERSHELL_START,
  POWERSHELL_END,
  getColorForLabel,
  normalizeProfile,
  deriveSshKeyName,
  deriveSshHostAlias,
  generateSshConfig,
  generateSshConfigBlock,
  mergeSshConfig,
  removeSshConfigBlock,
  generatePrePushHook,
  generateGitWrapper,
  generatePowerShellGitWrapper,
  getHooksPreview,
  getHooksStatus,
  getShellConfigFile,
  writeHooks,
  removeHooks,
  stripGitGuiseBlock,
};
