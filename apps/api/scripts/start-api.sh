#!/bin/zsh
cd "/Users/akashpaul/Desktop/Ai power lms/apps/api" || exit 1
set -a
source "/Users/akashpaul/Desktop/Ai power lms/.env"
set +a
exec /Users/akashpaul/.nvm/versions/node/v22.19.0/bin/node dist/main.js
