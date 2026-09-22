module.exports = {
  directories: { output: 'dist', buildResources: 'build' },
  appId: 'Lumac.lk',
  productName: 'POS-APP',
  asar: true,
  files: ['main.js', 'preload.js', 'package.json', 'printer-config.json', 'build/kumac.jpeg'],
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
    shortcutName: 'POS-APP',
    runAfterFinish: true,
    perMachine: false,
  },
  publish: {
    provider: 'github',
    owner: 'csm-chathuranga',
    repo: 'POS',
    releaseType: 'release',
  },
};
