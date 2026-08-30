# Reproducible dependency contract

CoolCity AI records both its tested tools and its complete application dependency graphs. A clean installation should use the lock files, not choose package versions independently.

## Tested toolchain

| Tool | Exact tested version | Repository record |
|---|---:|---|
| Python | `3.12.13` | `.python-version` |
| pip | `26.2.1` | `setup_coolcity.cmd` |
| Node.js | `24.19.0` | `.nvmrc` |
| npm | `11.17.0` | `frontend/package.json#packageManager` |

The Windows launcher accepts Python 3.12 and Node.js 20.9 or newer so compatible machines are not unnecessarily blocked. For version-for-version toolchain parity with the release checks, use the exact versions above.

## Python files

- `backend/requirements.txt` lists the five direct production dependencies with exact versions.
- `backend/requirements.lock.txt` pins the complete production graph, including transitive packages. Docker installs this file.
- `backend/requirements-dev.txt` lists the direct test dependency in addition to production dependencies.
- `backend/requirements-dev.lock.txt` pins the complete test and development graph. The Windows bootstrap installs this file.

The only platform marker is `colorama==0.4.6` on Windows. It is required by the command-line stack on Windows and is intentionally omitted on other operating systems.

## Frontend files

- `frontend/package.json` pins every direct application and development dependency without version ranges.
- `frontend/package-lock.json` locks the entire npm dependency graph, including integrity hashes.
- Always install with `npm ci`; do not use `npm install` for a release or deployment build.

## Verify an installation

From the repository root in PowerShell:

```powershell
.\.venv\Scripts\python.exe --version
.\.venv\Scripts\python.exe -m pip --version
.\.venv\Scripts\python.exe -m pip check
node.exe --version
npm.cmd --version
npm.cmd --prefix frontend ci
```

Expected tool versions for the release baseline are Python `3.12.13`, pip `26.2.1`, Node.js `v24.19.0`, and npm `11.17.0`.

## Updating dependencies intentionally

Dependency updates should be isolated in their own commit. Update the direct requirements first, regenerate the corresponding lock file, run every command in the README release checklist, inspect the diff for unexpected packages or lifecycle scripts, and commit the direct and lock files together.
