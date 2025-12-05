#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Source environment variables from .env.local if it exists
if [ -f .env.local ]; then
    echo "Loading environment variables from .env.local..."
    set -o allexport
    source .env.local
    set +o allexport
else
    echo "Warning: .env.local file not found. Ensure signing environment variables are set."
fi

# Check for required signing variables
if [ -z "$CSC_NAME" ] && [ -z "$CSC_LINK" ]; then
    echo "Error: CSC_NAME (Certificate Name) or CSC_LINK (Certificate Path) is missing."
    echo "Please add CSC_NAME or CSC_LINK to your .env.local file."
    exit 1
fi

# Check for required notarization variables
if [ -z "$APPLE_ID" ] || [ -z "$APPLE_APP_SPECIFIC_PASSWORD" ] || [ -z "$APPLE_TEAM_ID" ]; then
    echo "Error: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, or APPLE_TEAM_ID is missing."
    echo "Please add them to your .env.local file for notarization."
    exit 1
fi

echo "Cleaning previous builds..."
rm -rf dist out

echo "Building the application (Vite)..."
npm run build

echo "Packaging, Signing, and Notarizing (Electron Builder)..."
# Use npx to run the locally installed electron-builder
# --mac specifies we are building for macOS
# --publish never ensures we don't try to upload artifacts to GitHub/S3
npx electron-builder build --mac --publish never

echo "---------------------------------------------------"
echo "Build Complete!"
echo "Artifacts can be found in the 'dist' or 'out' directory."
