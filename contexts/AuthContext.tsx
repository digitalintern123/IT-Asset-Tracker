import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { MS_CONFIG } from "@/lib/msConfig";

WebBrowser.maybeCompleteAuthSession();

const STORAGE_KEY = "@asset-tracker/auth/v2";

export interface AuthUser {
  email: string;
  name: string;
  initials: string;
  accessToken?: string;
  expiresAt?: number;
}

interface AuthContextValue {
  user: AuthUser | null;
  loaded: boolean;
  signIn: (email?: string, name?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Load persisted user
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as AuthUser;
          // Check if token has expired
          if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
            parsed.accessToken = undefined;
          }
          setUser(parsed);
        }
      } catch {
        // Ignore corrupted storage
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const signIn = useCallback(async (email?: string, displayName?: string) => {
    if (Platform.OS === "web") {
      const redirectUri = typeof window !== "undefined"
        ? window.location.origin + "/"
        : "https://tracker.encalmhospitality.com/";

      const scopesParam = encodeURIComponent(MS_CONFIG.WEB_SCOPES.join(" "));

      const authUrl =
        `https://login.microsoftonline.com/${MS_CONFIG.TENANT_ID}/oauth2/v2.0/authorize` +
        `?client_id=${MS_CONFIG.CLIENT_ID}` +
        `&response_type=token` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${scopesParam}` +
        `&response_mode=fragment` +
        `&prompt=select_account`;

      // Redirect to Microsoft SSO in same window
      window.location.href = authUrl;
      return;
    }

    // Native: use expo-auth-session
    const redirectUri2 = AuthSession.makeRedirectUri();
    const discovery = {
      authorizationEndpoint: `https://login.microsoftonline.com/${MS_CONFIG.TENANT_ID}/oauth2/v2.0/authorize`,
      tokenEndpoint: `https://login.microsoftonline.com/${MS_CONFIG.TENANT_ID}/oauth2/v2.0/token`,
    };

    const request = new AuthSession.AuthRequest({
      clientId: MS_CONFIG.CLIENT_ID,
      scopes: [...MS_CONFIG.SCOPES],
      redirectUri: redirectUri2,
      responseType: AuthSession.ResponseType.Token,
    });

    const result = await request.promptAsync(discovery);

    if (result.type === "success" && result.params.access_token) {
      const token = result.params.access_token;
      const expiresIn = parseInt(result.params.expires_in || "3600", 10);
      const expiresAt = Date.now() + expiresIn * 1000;

      // Fetch user info from Microsoft Graph
      const resp = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const profile = await resp.json();
      const name = profile.displayName || profile.userPrincipalName || displayName || email || "";
      const userEmail = profile.mail || profile.userPrincipalName || email || "";
      const authUser: AuthUser = {
        email: userEmail,
        name,
        initials: getInitials(name),
        accessToken: token,
        expiresAt,
      };
      setUser(authUser);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
    }
  }, []);

  // Handle web redirect (token or error in URL hash)
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash) return;

    if (hash.includes("error=")) {
      console.warn("Microsoft SSO return error:", hash);
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }

    if (!hash.includes("access_token")) return;

    const params = new URLSearchParams(hash.substring(1));
    const token = params.get("access_token");
    const expiresIn = parseInt(params.get("expires_in") || "3600", 10);
    const expiresAt = Date.now() + expiresIn * 1000;
    if (!token) return;

    // Clear hash from URL immediately
    window.history.replaceState(null, "", window.location.pathname);

    // Fetch user profile from Microsoft Graph
    fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`Graph profile fetch failed: ${r.status}`);
        return r.json();
      })
      .then(async (profile) => {
        const name = profile.displayName || profile.userPrincipalName || "";
        const email = profile.mail || profile.userPrincipalName || "";
        const authUser: AuthUser = {
          email,
          name,
          initials: getInitials(name),
          accessToken: token,
          expiresAt,
        };
        setUser(authUser);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
      })
      .catch((err) => {
        console.error("Failed to load user profile:", err);
      });
  }, []);

  const signOut = useCallback(async () => {
    setUser(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.location.href =
        `https://login.microsoftonline.com/${MS_CONFIG.TENANT_ID}/oauth2/v2.0/logout` +
        `?post_logout_redirect_uri=${encodeURIComponent(window.location.origin + "/")}`;
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loaded, signIn, signOut }),
    [user, loaded, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
