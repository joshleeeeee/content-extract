#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CLI_ENTRY="${REPO_ROOT}/cli/bin/cex.mjs"

BIN_DIR="${CEX_BIN_DIR:-${HOME}/.local/bin}"
RC_FILE="${CEX_RC_FILE:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bin-dir)
      BIN_DIR="${2:-}"
      shift 2
      ;;
    --rc-file)
      RC_FILE="${2:-}"
      shift 2
      ;;
    --help|-h)
      cat <<'EOF'
Usage: ./scripts/setup-cex.sh [--bin-dir <dir>] [--rc-file <file>]

Installs a local `cex` wrapper command into ~/.local/bin by default and
adds that directory to your shell PATH if needed.
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required but was not found in PATH." >&2
  exit 1
fi

if [[ ! -f "${CLI_ENTRY}" ]]; then
  echo "Error: CLI entry not found: ${CLI_ENTRY}" >&2
  exit 1
fi

detect_rc_file() {
  if [[ -n "${RC_FILE}" ]]; then
    printf '%s\n' "${RC_FILE}"
    return
  fi

  local shell_name
  shell_name="$(basename "${SHELL:-}")"

  case "${shell_name}" in
    zsh)
      printf '%s\n' "${HOME}/.zshrc"
      ;;
    bash)
      if [[ -f "${HOME}/.bashrc" || ! -f "${HOME}/.bash_profile" ]]; then
        printf '%s\n' "${HOME}/.bashrc"
      else
        printf '%s\n' "${HOME}/.bash_profile"
      fi
      ;;
    *)
      printf '%s\n' "${HOME}/.profile"
      ;;
  esac
}

mkdir -p "${BIN_DIR}"
TARGET="${BIN_DIR}/cex"

if [[ -d "${TARGET}" ]]; then
  echo "Error: ${TARGET} is a directory. Please remove it or choose another --bin-dir." >&2
  exit 1
fi

cat > "${TARGET}" <<EOF
#!/usr/bin/env bash
exec node "${CLI_ENTRY}" "\$@"
EOF

chmod +x "${TARGET}"

PATH_EXPORT="export PATH=\"${BIN_DIR}:\$PATH\""
RC_TARGET="$(detect_rc_file)"
mkdir -p "$(dirname "${RC_TARGET}")"
touch "${RC_TARGET}"

if [[ ":${PATH}:" != *":${BIN_DIR}:"* ]]; then
  if ! grep -Fq "${PATH_EXPORT}" "${RC_TARGET}" 2>/dev/null; then
    {
      printf '\n# ContentExtract CLI\n'
      printf '%s\n' "${PATH_EXPORT}"
    } >> "${RC_TARGET}"
    RC_UPDATED="1"
  else
    RC_UPDATED="0"
  fi
else
  RC_UPDATED="0"
fi

cat <<EOF
✅ cex has been installed.

- Command: ${TARGET}
- CLI entry: ${CLI_ENTRY}
- Shell rc: ${RC_TARGET}
EOF

if [[ "${RC_UPDATED}" == "1" ]]; then
  cat <<EOF
- PATH update: appended to ${RC_TARGET}

Next step:
  source "${RC_TARGET}"
EOF
else
  cat <<EOF
- PATH update: no change needed
EOF
fi

cat <<'EOF'

Try:
  cex --help
  cex start --pretty
EOF
