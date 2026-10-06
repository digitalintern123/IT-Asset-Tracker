import { useWindowDimensions } from "react-native";

export interface ResponsiveInfo {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  contentMaxWidth: number;
}

export function useResponsive(): ResponsiveInfo {
  const { width, height } = useWindowDimensions();

  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1024;
  const isDesktop = width >= 1024;

  return {
    width,
    height,
    isMobile,
    isTablet,
    isDesktop,
    contentMaxWidth: 1180,
  };
}
