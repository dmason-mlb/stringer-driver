const { notarize } = require('@electron/notarize');
const path = require('path');
const pkg = require('../package.json');

exports.default = async function (context) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appId = pkg.build.appId;
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  // Check if necessary environment variables are present
  if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD || !process.env.APPLE_TEAM_ID) {
    console.warn('Skipping notarization: Missing APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, or APPLE_TEAM_ID in environment.');
    return;
  }

  console.log(`Notarizing ${appId} found at ${appPath}...`);

  try {
    await notarize({
      appBundleId: appId,
      appPath: appPath,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    });
    console.log(`Notarization successful for ${appName}`);
  } catch (error) {
    console.error(error);
    throw error;
  }
};
