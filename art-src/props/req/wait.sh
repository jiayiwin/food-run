#!/bin/sh
# usage: wait.sh name...   (looks up requestId from ids.txt, last entry wins)
cd "$(git rev-parse --show-toplevel)"
for k in "$@"; do
  id=$(grep "^$k " art-src/props/req/ids.txt | tail -1 | cut -d' ' -f2)
  out=$(image-tool wait --tag "image/task/$id" --ack --timeout 300 2>&1)
  f="$HOME/.image-tool/results/$id/01.png"
  if [ -f "$f" ]; then cp "$f" "art-src/props/${k}_raw.png"; echo "$k OK"; else echo "$k MISSING: $(echo "$out" | head -c 400)"; fi
done
