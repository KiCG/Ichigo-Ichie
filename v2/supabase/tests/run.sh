#!/usr/bin/env bash
# ローカルの PostgreSQL でスキーマとロックのルールを検証する
# 使い方: bash v2/supabase/tests/run.sh   （PostgreSQL 16 の initdb / pg_ctl / psql が必要）
set -euo pipefail
cd "$(dirname "$0")/.."
BIN=${PG_BIN:-/usr/lib/postgresql/16/bin}
D=$(mktemp -d /var/tmp/ichigo-pg.XXXXXX)
PORT=${PG_PORT:-54329}
RUN() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
[ "$(id -u)" = 0 ] && chown postgres "$D"
RUN "$BIN/initdb -D $D/data -A trust -U postgres >/dev/null"
RUN "$BIN/pg_ctl -D $D/data -o '-p $PORT -k $D' -l $D/log -w start >/dev/null"
trap 'RUN "$BIN/pg_ctl -D $D/data -m fast stop >/dev/null"; rm -rf "$D"' EXIT
for f in tests/supabase_stub.sql schema.sql tests/test_rules.sql; do
  psql -h "$D" -p "$PORT" -U postgres -d postgres -q -v ON_ERROR_STOP=1 -f "$f" 2>&1 \
    | { grep -E "ok:|FAIL|ERROR|PASSED" || true; } | sed 's/^psql:[^ ]* NOTICE:  //'
done
