#!/bin/sh
# Starts the API as the unprivileged "app" user.
#
# The SQLite volume may have been created by an older image that ran as root,
# so fix ownership of the data directory first (only possible as root), then
# drop privileges for the actual server process.
set -e

if [ "$(id -u)" = "0" ]; then
  chown -R app:app /app/data
  exec setpriv --reuid=app --regid=app --init-groups "$@"
fi

exec "$@"
