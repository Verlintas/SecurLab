const { execFileSync } = require('node:child_process')

/**
 * Ad-hoc code-sign the packaged macOS app.
 *
 * The build is unsigned (no Developer ID), but a *valid* signature is still
 * required: without it Gatekeeper reports the downloaded app as "damaged"
 * (the bundle seal is broken by packaging, and quarantined downloads are
 * rejected outright). Ad-hoc signing restores a valid seal so users get the
 * standard "unidentified developer" prompt, which right-click → Open / xattr
 * can bypass.
 */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appPath = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`
  console.log(`[after-pack] ad-hoc signing ${appPath}`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
  console.log('[after-pack] ad-hoc signing done')
}
