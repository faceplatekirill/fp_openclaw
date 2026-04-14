#!/bin/bash
# Build TypeScript sources to JavaScript
cd "$(dirname "$0")"
tsc
echo "✓ Compiled TypeScript to JavaScript"
