#!/bin/sh
# usage: qa/q.sh <<'JS' ... JS   — runs the body in the driver (page, shot, T, idle, S, base, log)
exec curl -s --max-time ${TIMEOUT:-300} --data-binary @- http://127.0.0.1:${CTL:-5292}/
