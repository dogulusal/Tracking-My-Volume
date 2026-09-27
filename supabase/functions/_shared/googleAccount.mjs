export function requiresAccountMatch(createNew, previousSpreadsheetId, targetSpreadsheetId) {
  return createNew || previousSpreadsheetId !== targetSpreadsheetId;
}

export function matchesVerifiedGoogleEmail(profile, accountEmail) {
  return profile?.email_verified === true
    && typeof profile.email === 'string'
    && typeof accountEmail === 'string'
    && profile.email.trim().toLowerCase() === accountEmail.trim().toLowerCase();
}
