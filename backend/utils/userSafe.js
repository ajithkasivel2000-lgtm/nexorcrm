/**
 * Credentials must never leave the server.
 *
 * Lived inline in userController; pulled out so every user-serving controller
 * — the original CRUD one and the User 360 admin one — strips the same way.
 * Besides the password hash that means the two-factor secret and recovery
 * codes (either one signs you in as the user) and the private calendar-feed
 * token. `twoFactorEnabled` is kept so screens can show the state.
 */
const withoutPassword = (user) => {
  if (!user) return user;
  if (Array.isArray(user)) return user.map(withoutPassword);
  const { password, totpSecret, totpRecoveryCodes, calendarToken, ...safe } = user;
  return { ...safe, twoFactorEnabled: Boolean(user.totpEnabled) };
};

module.exports = { withoutPassword };
