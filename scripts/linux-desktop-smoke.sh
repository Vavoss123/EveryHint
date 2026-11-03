#!/usr/bin/env bash
set -euo pipefail
if [[ ${EVERYHINT_PRIVATE_BUS:-} != 1 ]]; then
  exec dbus-run-session -- env EVERYHINT_PRIVATE_BUS=1 bash "$0"
fi
# The private D-Bus session and temporary data directory keep synthetic test
# keys out of any existing desktop keyring. No capture or inference is started.
task_state_dir=$(mktemp -d /tmp/everyhint-ci-XXXXXX)
trap '[[ $task_state_dir == /tmp/everyhint-ci-* ]] && rm -rf -- "$task_state_dir"' EXIT
export XDG_DATA_HOME="$task_state_dir"
export XDG_SESSION_TYPE=x11
unset WAYLAND_DISPLAY
printf 'everyhint-ci-fixture\n' | gnome-keyring-daemon --unlock --components=secrets >/dev/null
xvfb-run -a npm run smoke:posix
