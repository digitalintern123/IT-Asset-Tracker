import * as WebBrowser from "expo-web-browser";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { MS_CONFIG, isMsConfigured } from "@/lib/msConfig";
import {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  fetchGraphUserProfile,
  getAndClearPkceSession,
  getRedirectUri,
  signInWithMicrosoftNative,
  silentRefreshToken,
  MsTokens,
} from "@/lib/msalAuth";
import {
  getSecureTokens,
  setSecureTokens,
  removeSecureTokens,
  StoredTokens,
} from "@/lib/secureStorage";
import {
  UserRole,
  RolePermissions,
  resolveUserRole,
  getPermissionsForRole,
  parseJwtRoles,
} from "@/lib/roles";

WebBrowser.maybeCompleteAuthSession();

const PROFILE_STORAGE_KEY = "@asset-tracker/user_profile_v3";

export interface AuthUser {
  email: string;
  name: string;
  initials: string;
  role: UserRole;
  permissions: RolePermissions;
  accessToken?: string;
  expiresAt?: number;
  isDemo?: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loaded: boolean;
  signIn: (email?: string, name?: string) => Promise<void>;
  signInDemo: () => Promise<void>;
  signOut: () => Promise<void>;
  getValidAccessToken: () => Promise<string | null>;
  setDemoRole: (role: UserRole) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const tokensRef = useRef<StoredTokens | null>(null);
  const idleTimerRef = useRef<any>(null);

  // 1. Silent token refresher & getter
  const getValidAccessToken = useCallback(async (): Promise<string | null> => {
    if (user?.isDemo) return null;

    let current = tokensRef.current;
    if (!current) {
      current = await getSecureTokens();
      if (current) tokensRef.current = current;
    }

    if (!current?.accessToken) return null;

    // Check if token expires in less than 2 minutes
    const isNearExpiry = Date.now() > current.expiresAt - 120000;
    if (!isNearExpiry) {
      return current.accessToken;
    }

    // Try silent refresh if refresh token is available
    if (current.refreshToken) {
      try {
        const refreshed = await silentRefreshToken(current.refreshToken);
        const updatedTokens: StoredTokens = {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken || current.refreshToken,
          idToken: refreshed.idToken,
          expiresAt: refreshed.expiresAt,
        };
        tokensRef.current = updatedTokens;
        await setSecureTokens(updatedTokens);

        setUser((prev) =>
          prev
            ? {
                ...prev,
                accessToken: updatedTokens.accessToken,
                expiresAt: updatedTokens.expiresAt,
              }
            : null
        );
        return updatedTokens.accessToken;
      } catch (refreshErr) {
        console.warn("Silent token refresh failed:", refreshErr);
      }
    }

    // If expired and refresh failed
    if (Date.now() > current.expiresAt) {
      await removeSecureTokens();
      tokensRef.current = null;
      setUser((prev) => (prev ? { ...prev, accessToken: undefined } : null));
      return null;
    }

    return current.accessToken;
  }, [user?.isDemo]);

  // 2. Load persisted profile and secure tokens on initial mount
  useEffect(() => {
    (async () => {
      try {
        const rawProfile = await AsyncStorage.getItem(PROFILE_STORAGE_KEY);
        if (rawProfile) {
          const profile = JSON.parse(rawProfile) as AuthUser;
          // Ensure role and permissions are always synchronized
          const role = profile.role || "technician";
          profile.role = role;
          profile.permissions = getPermissionsForRole(role);

          if (profile.isDemo) {
            setUser(profile);
          } else {
            // Load credentials from secure storage
            const tokens = await getSecureTokens();
            if (tokens) {
              tokensRef.current = tokens;
              profile.accessToken = tokens.accessToken;
              profile.expiresAt = tokens.expiresAt;
            }
            setUser(profile);
          }
        }
      } catch (err) {
        console.warn("Failed to load initial session profile:", err);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // 3. Handle Web PKCE Callback (search params ?code= or hash #code=)
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    const searchParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash ? window.location.hash.substring(1) : "";
    const hashParams = new URLSearchParams(hash);

    const code = searchParams.get("code") || hashParams.get("code");
    const error = searchParams.get("error") || hashParams.get("error");
    const state = searchParams.get("state") || hashParams.get("state");

    if (error) {
      console.warn("Microsoft SSO return error:", error);
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }

    if (!code) return;

    // Immediately clean code & state from URL to prevent leakage
    window.history.replaceState(null, "", window.location.pathname);

    (async () => {
      try {
        const { verifier: savedVerifier, state: savedState } = getAndClearPkceSession();

        // Validate state for CSRF mitigation
        if (savedState && state && savedState !== state) {
          console.error("PKCE State mismatch: potential CSRF detected.");
          return;
        }

        const verifier = savedVerifier || "";
        const redirectUri = getRedirectUri();

        // Exchange code for tokens
        const tokens = await exchangeCodeForTokens(code, verifier, redirectUri);
        tokensRef.current = tokens;
        await setSecureTokens(tokens);

        // Fetch user profile from Microsoft Graph
        const profile = await fetchGraphUserProfile(tokens.accessToken);
        const name = profile.displayName || "Encalm User";
        const email = profile.email || "";

        // Resolve user role from token claims & admin email list
        const tokenRoles = parseJwtRoles(tokens.idToken);
        const role = resolveUserRole(email, tokenRoles);
        const permissions = getPermissionsForRole(role);

        const authUser: AuthUser = {
          email,
          name,
          initials: getInitials(name),
          role,
          permissions,
          accessToken: tokens.accessToken,
          expiresAt: tokens.expiresAt,
        };

        setUser(authUser);
        await AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(authUser));
      } catch (err) {
        console.error("PKCE token exchange failed:", err);
      }
    })();
  }, []);

  // 4. Inactivity Auto-Purge Timer (30 minutes of idle time on Web)
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || !user || user.isDemo) {
      return;
    }

    const resetIdleTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(async () => {
        console.warn("Session auto-purged due to 30 minutes of inactivity.");
        await removeSecureTokens();
        tokensRef.current = null;
        setUser((prev) => (prev ? { ...prev, accessToken: undefined } : null));
      }, 30 * 60 * 1000); // 30 minutes
    };

    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((ev) => window.addEventListener(ev, resetIdleTimer, { passive: true }));
    resetIdleTimer();

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      events.forEach((ev) => window.removeEventListener(ev, resetIdleTimer));
    };
  }, [user]);

  // 5. Sign In (Authorization Code + PKCE)
  const signIn = useCallback(async (email?: string, displayName?: string) => {
    if (Platform.OS === "web") {
      const authUrl = await buildAuthorizeUrl();
      window.location.href = authUrl;
      return;
    }

    // Native mobile PKCE flow
    const res = await signInWithMicrosoftNative();
    if (res) {
      tokensRef.current = res.tokens;
      await setSecureTokens(res.tokens);

      const tokenRoles = parseJwtRoles(res.tokens.idToken);
      const role = resolveUserRole(res.email, tokenRoles);
      const permissions = getPermissionsForRole(role);

      const authUser: AuthUser = {
        email: res.email,
        name: res.name || displayName || email || "Encalm User",
        initials: getInitials(res.name || displayName || email || "EU"),
        role,
        permissions,
        accessToken: res.tokens.accessToken,
        expiresAt: res.tokens.expiresAt,
      };

      setUser(authUser);
      await AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(authUser));
    }
  }, []);

  // 6. Sign In Demo
  const signInDemo = useCallback(async () => {
    const demoUser: AuthUser = {
      email: "demo@encalmhospitality.com",
      name: "Encalm Demo Inspector",
      initials: "ED",
      role: "admin",
      permissions: getPermissionsForRole("admin"),
      isDemo: true,
    };
    tokensRef.current = null;
    await removeSecureTokens();
    setUser(demoUser);
    await AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(demoUser));
  }, []);

  // 7. Demo Role Switcher
  const setDemoRole = useCallback((role: UserRole) => {
    setUser((prev) => {
      if (!prev) return null;
      const updated: AuthUser = {
        ...prev,
        role,
        permissions: getPermissionsForRole(role),
      };
      AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  // 8. Sign Out
  const signOut = useCallback(async () => {
    const wasDemo = user?.isDemo;
    tokensRef.current = null;
    await removeSecureTokens();
    await AsyncStorage.removeItem(PROFILE_STORAGE_KEY);
    setUser(null);

    if (!wasDemo && Platform.OS === "web" && typeof window !== "undefined") {
      window.location.href =
        `https://login.microsoftonline.com/${MS_CONFIG.TENANT_ID}/oauth2/v2.0/logout` +
        `?post_logout_redirect_uri=${encodeURIComponent(window.location.origin + "/")}`;
    }
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loaded,
      signIn,
      signInDemo,
      signOut,
      getValidAccessToken,
      setDemoRole,
    }),
    [user, loaded, signIn, signInDemo, signOut, getValidAccessToken, setDemoRole]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
