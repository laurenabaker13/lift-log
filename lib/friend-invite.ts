import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "liftlog.pending-friend-invite";
export function normalizeFriendCode(value: string) {
  return value.trim().replace(/[\s-]/g, "").toUpperCase();
}
export function validFriendCode(value: string) {
  return /^[A-Z0-9]{16,40}$/.test(normalizeFriendCode(value));
}
export async function rememberFriendInvite(code: string) {
  const normalized = normalizeFriendCode(code);
  if (validFriendCode(normalized)) await AsyncStorage.setItem(KEY, normalized);
}
export async function pendingFriendDestination(fallback: string) {
  const code = await AsyncStorage.getItem(KEY);
  return code && validFriendCode(code) ? `/friend-invite?code=${encodeURIComponent(code)}` : fallback;
}
export async function clearFriendInvite() {
  await AsyncStorage.removeItem(KEY);
}
