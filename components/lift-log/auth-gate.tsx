import { Redirect, usePathname } from "expo-router";
import type { PropsWithChildren } from "react";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { AppButton, AppScreen, LoadingState, ui } from "./ui";
import { Text } from "react-native";

export function AuthGate({ children }: PropsWithChildren) {
  const { loading, isAuthenticated } = useAuth();
  const pathname = usePathname();
  const settings = trpc.settings.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  if (loading || (isAuthenticated && settings.isLoading))
    return (
      <AppScreen scroll={false}>
        <LoadingState label="Opening your log…" />
      </AppScreen>
    );
  if (!isAuthenticated) return <Redirect href="/first-lift" />;
  if (settings.error && !settings.data)
    return (
      <AppScreen>
        <Text style={ui.mutedText}>
          We couldn’t open your log. Please try again.
        </Text>
        <AppButton onPress={() => settings.refetch()}>Try again</AppButton>
      </AppScreen>
    );
  if (settings.data?.unitChosen === 0 && pathname !== "/onboarding")
    return <Redirect href="/onboarding" />;
  return <>{children}</>;
}
