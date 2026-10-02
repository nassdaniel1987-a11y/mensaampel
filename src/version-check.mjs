// After a Dial update the tablet still runs the old page until it is reloaded (the Ampel tablet is never reloaded by
// hand). When the Dial reports another version than the loaded page, reload once; `reloadedFor` (sessionStorage)
// prevents a loop if the new page still differs (e.g. an older page from the cache).
export function needsReload(serverVersion, ownVersion, reloadedFor) {
  if (!serverVersion || !ownVersion || serverVersion === ownVersion) return false;
  return reloadedFor !== serverVersion;
}
