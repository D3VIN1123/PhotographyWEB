#!/bin/zsh
# Double-click me: starts the site + backstage on this Mac and opens the backstage.
cd "$(dirname "$0")"
(sleep 1; open "http://localhost:4173/admin") &
python3 server.py
