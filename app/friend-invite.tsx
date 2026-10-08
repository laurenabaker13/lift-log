import { AuthGate } from "@/components/lift-log/auth-gate";
import { AppButton, AppInput, AppScreen, Card, LoadingState, ui } from "@/components/lift-log/ui";
import { clearFriendInvite, normalizeFriendCode, rememberFriendInvite, validFriendCode } from "@/lib/friend-invite";
import { trpc } from "@/lib/trpc";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text } from "react-native";

function Redeem({ initialCode }: { initialCode: string }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [code, setCode] = useState(initialCode);
  const [message, setMessage] = useState<string | null>(null);
  const redeem = trpc.friends.redeemInvite.useMutation({
    onSuccess: async (result) => {
      await clearFriendInvite();
      utils.friends.hub.invalidate();
      setMessage(result.message);
    },
    onError: (error) => setMessage(error.message),
  });
  const leave = async () => { await clearFriendInvite(); router.replace("/friends" as never); };
  return <AppScreen>
    <Text style={ui.title}>Add a friend</Text>
    <Text style={ui.mutedText}>Enter their invite code. They’ll approve your request before you can see each other’s shared lifts.</Text>
    {redeem.isSuccess ? <><Card><Text style={ui.mutedText}>{message}</Text></Card><AppButton onPress={leave}>Go to Friends</AppButton></> : <Card style={{ gap: 16 }}>
      <AppInput label="Friend’s invite code" value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} maxLength={48} placeholder="Paste their code" />
      {message ? <Text style={ui.mutedText}>{message}</Text> : null}
      <AppButton onPress={() => redeem.mutate({ code: normalizeFriendCode(code) })} disabled={!validFriendCode(code) || redeem.isPending}>{redeem.isPending ? "Sending…" : "Send friend request"}</AppButton>
    </Card>}
    {!redeem.isSuccess ? <AppButton variant="ghost" onPress={leave}>Not now</AppButton> : null}
  </AppScreen>;
}
export default function FriendInviteScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const code = typeof params.code === "string" ? normalizeFriendCode(params.code) : "";
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    // Save before AuthGate redirects so a new account does not lose the invitation.
    rememberFriendInvite(code).finally(() => { if (mounted) setReady(true); });
    return () => { mounted = false; };
  }, [code]);
  if (!ready) return <AppScreen><LoadingState label="Opening invitation…" /></AppScreen>;
  return <AuthGate><Redeem initialCode={code} /></AuthGate>;
}
