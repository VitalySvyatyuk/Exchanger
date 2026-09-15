// Shared by the server auth module and the proxy, which can't import
// server-only modules that talk to the database.
export const SESSION_COOKIE_NAME = "exchanger_session";
