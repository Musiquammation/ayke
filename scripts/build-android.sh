#!/bin/bash

set -e

echo "==> Web build"
npm run build

echo "==> Capacitor synchronization"
npx cap sync android

echo "==> Android AAB build"
cd android
./gradlew bundleRelease
cd ..

echo "==> Copying the AAB to dist/"
mkdir -p dist
cp android/app/build/outputs/bundle/release/app-release.aab dist/app-release.aab

echo "==> Build completed"
echo "AAB: dist/app-release.aab"
