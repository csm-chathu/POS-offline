module.exports = {
  directories: { output: 'dist-offline', buildResources: 'build' },
  appId: 'Lumac.lk.offline',
  productName: 'POS-APP-Offline',
  asar: true,
  files: ['main.js', 'preload.js', 'package.json', 'printer-config.json', 'build/kumac.jpeg'],
  extraMetadata: { offline: true },
  extraResources: [
    {
      from: '../pos-api',
      to: 'pos-api',
      filter: ['**/*', '!.env', '!*.db', '!.git/**', '!scripts/**'],
    },
  ],
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    artifactName: '${productName}-Setup-${version}.${ext}',
    icon: 'build/icon-new.ico',
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'POS-APP-Offline',
    runAfterFinish: true,
    perMachine: false,
  },
  publish: {
    provider: 'github',
    owner: 'csm-chathu',
    repo: 'POS-offline',
    releaseType: 'release',
    channel: 'offline',
  },
};
