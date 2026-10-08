import * as Api from "@/lib/_core/api";
import * as Auth from "@/lib/_core/auth";
import { useAuth } from "@/hooks/use-auth";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { pendingFriendDestination } from "@/lib/friend-invite";
import { readGuestDraft, syncGuestWorkout } from "@/lib/guest-log";
import * as AppleAuthentication from "expo-apple-authentication";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { AppButton, AppInput, AppScreen, Card, colors, ui } from "@/components/lift-log/ui";

export default function AuthScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ saveLifts?: string }>();
  const { isAuthenticated, user } = useAuth({ autoFetch: true });
  const savingLifts = params.saveLifts === "1" || user?.loginMethod === "guest";
  const [mode, setMode] = useState<"login" | "register">(params.saveLifts === "1" ? "register" : "login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [destination, setDestination] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => { pendingFriendDestination("/").then(setDestination).catch(() => setDestination("/")); }, []);
  useEffect(() => { if (Platform.OS === "ios") AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false)); }, []);
  if (isAuthenticated && user?.loginMethod !== "guest") return destination ? <Redirect href={destination as never} /> : <AppScreen><Text style={ui.mutedText}>Opening your log…</Text></AppScreen>;
  const prepareGuest = async () => {
    const draft = await readGuestDraft();
    if (draft?.sets.length) await syncGuestWorkout(draft);
    const current = await Api.getMe();
    return current?.loginMethod === "guest" ? {token: await Auth.getSessionToken(), userId: current.id} : null;
  };
  const acceptAccount = async (result: Api.EmailAuthResponse, guest: {token: string | null; userId: number} | null) => {
    if (guest?.token && guest.userId !== result.user.id) {
      try { await Api.apiCall("/api/auth/claim-guest", {method: "POST", headers: {Authorization: `Bearer ${result.app_session_id}`}, body: JSON.stringify({guestToken: guest.token})}); }
      catch (error) { await Auth.setSessionToken(guest.token); await Api.establishSession(guest.token); throw error; }
    }
    await Auth.setSessionToken(result.app_session_id);
    await Auth.setUserInfo({ ...result.user, lastSignedIn: new Date(result.user.lastSignedIn) });
    router.replace((await pendingFriendDestination("/")) as never);
  };
  const submit = async () => {
    setError(null); setSubmitting(true);
    try {
      const guestToken = await prepareGuest();
      const result = mode === "register" ? await Api.registerWithEmail({displayName,email,password}) : await Api.loginWithEmail({email,password});
      await acceptAccount(result, guestToken);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "We couldn't save your account. Your lifts are still here."); }
    finally { setSubmitting(false); }
  };
  const signInApple = async () => {
    if (submitting) return;
    setError(null); setSubmitting(true);
    try {
      const guestToken = await prepareGuest();
      const challenge = await Api.apiCall<{challengeId: string; nonce: string}>("/api/auth/apple/challenge", {method: "POST"});
      const credential = await AppleAuthentication.signInAsync({requestedScopes:[AppleAuthentication.AppleAuthenticationScope.FULL_NAME,AppleAuthentication.AppleAuthenticationScope.EMAIL],nonce:challenge.nonce});
      if (!credential.identityToken) throw new Error("Apple could not finish signing you in. Try again.");
      const name = credential.fullName ? AppleAuthentication.formatFullName(credential.fullName) : undefined;
      const result = await Api.apiCall<Api.EmailAuthResponse>("/api/auth/apple", {method:"POST",body:JSON.stringify({challengeId:challenge.challengeId,identityToken:credential.identityToken,displayName:name})});
      await acceptAccount(result, guestToken);
    } catch (caught) {
      if (!(caught && typeof caught === "object" && "code" in caught && caught.code === "ERR_REQUEST_CANCELED")) setError(caught instanceof Error ? caught.message : "Apple sign-in didn't finish. Your lifts are still here.");
    } finally { setSubmitting(false); }
  };
  return <AppScreen contentStyle={styles.screen}>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.grow}>
      <View style={styles.hero}><Text style={ui.title}>{savingLifts ? "Save your lifts" : "Welcome back"}</Text><Text style={ui.subtitle}>{savingLifts ? "Keep your starting line. Pick up anywhere." : "Your log is right here."}</Text></View>
      <Card style={styles.form}>
        {appleAvailable ? <AppleAuthentication.AppleAuthenticationButton buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN} buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK} cornerRadius={14} style={styles.apple} onPress={() => void signInApple()} /> : null}
        {mode === "register" ? <AppInput label="Name" value={displayName} onChangeText={setDisplayName} placeholder="Your name" autoCapitalize="words" /> : null}
        <AppInput label="Email" value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        <AppInput label="Password" value={password} onChangeText={setPassword} placeholder="At least 8 characters" secureTextEntry autoCapitalize="none" />
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <AppButton onPress={() => void submit()} disabled={submitting}>{submitting ? "Saving…" : mode === "login" ? "Sign in" : "Save your lifts"}</AppButton>
        <AppButton variant="ghost" onPress={() => {setMode(mode === "login" ? "register" : "login");setError(null);}}>{mode === "login" ? "Create an account" : "Already have an account? Sign in"}</AppButton>
        {mode === "login" ? <AppButton variant="ghost" onPress={() => router.push("/reset-password" as never)}>Forgot password?</AppButton> : null}
      </Card>
      <AppButton variant="secondary" onPress={() => router.replace("/first-lift" as never)}>Keep lifting as a guest</AppButton>
      <Text style={styles.privacy}>{savingLifts ? "Your lifts stay private." : "New here? Try a lift before signing up."}</Text>
    </KeyboardAvoidingView>
  </AppScreen>;
}
const styles=StyleSheet.create({screen:{paddingHorizontal:20,paddingTop:30,paddingBottom:28,flexGrow:1,justifyContent:"center"},grow:{gap:20},hero:{gap:4},form:{gap:14},apple:{height:50,width:"100%"},error:{color:colors.rust,fontSize:16,lineHeight:22},privacy:{color:colors.muted,fontSize:16,lineHeight:22,textAlign:"center"}});
