#!/usr/bin/env bash
set -euo pipefail

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
Usage: ./scripts/uninstall-cex.sh [--bin-dir <dir>] [--rc-file <file>]

Removes the local `cex` wrapper command from ~/.local/bin by default and
deletes the PATH export block that setup-cex.sh may have added.
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

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

TARGET="${BIN_DIR}/cex"
RC_TARGET="$(detect_rc_file)"
PATH_EXPORT="export PATH=\"${BIN_DIR}:\$PATH\""

REMOVED_CMD="0"
REMOVED_PATH="0"

if [[ -f "${TARGET}" || -L "${TARGET}" ]]; then
  rm -f "${TARGET}"
  REMOVED_CMD="1"
fi

if [[ -f "${RC_TARGET}" ]]; then
  TMP_FILE="${RC_TARGET}.tmp"
  awk -v path_line="${PATH_EXPORT}" '
    $0 == "# ContentExtract CLI" {
      getline nextLine
      if (nextLine == path_line) {
        removed = 1
        next
      }
      print $0
      if (length(nextLine) > 0) print nextLine
      next
    }
    $0 == path_line { removed = 1; next }
    { print }
    END { if (removed) exit 0; else exit 2 }
  ' "${RC_TARGET}" > "${TMP_FILE}" || STATUS=$?

  STATUS="${STATUS:-0}"
  if [[ "${STATUS}" == "0" ]]; then
    mv "${TMP_FILE}" "${RC_TARGET}"
    REMOVED_PATH="1"
  else
    rm -f "${TMP_FILE}"
  fi
fi

cat <<EOF
✅ cex uninstall finished.

- Command removed: $( [[ "${REMOVED_CMD}" == "1" ]] && printf 'yes' || printf 'no' )
- PATH entry removed: $( [[ "${REMOVED_PATH}" == "1" ]] && printf 'yes' || printf 'no' )
- Shell rc: ${RC_TARGET}
EOF

cat <<'EOF'

If your current shell already loaded the old PATH, run:
  hash -r
  source ~/.zshrc
EOF
