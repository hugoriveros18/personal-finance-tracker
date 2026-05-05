#!/bin/sh
set -e

echo "==> Running prisma migrate deploy"
npx prisma migrate deploy

echo "==> Starting backend"
exec node dist/server.js
