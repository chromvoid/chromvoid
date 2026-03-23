export function getOS() {
  const userAgent = navigator.userAgent
  const platform = navigator.platform
  const macosPlatforms = ['Macintosh', 'MacIntel', 'MacPPC', 'Mac68K']
  const windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE']
  const iosPlatforms = ['iPhone', 'iPad', 'iPod']
  let os = ''

  if (macosPlatforms.indexOf(platform) !== -1) {
    os = 'mac'
  } else if (iosPlatforms.indexOf(platform) !== -1) {
    os = 'ios'
  } else if (windowsPlatforms.indexOf(platform) !== -1) {
    os = 'win'
  } else if (/Android/.test(userAgent)) {
    os = 'android'
  } else if (!os && /Linux/.test(platform)) {
    os = 'linux'
  }

  return os
}
