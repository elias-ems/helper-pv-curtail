import {
  createContext,
  type MouseEvent,
  type ReactNode,
  useContext,
  useEffect,
  useEffectEvent,
  useState,
} from "react";
import {
  NavLink,
  type NavLinkProps,
  useLocation,
  useNavigate,
} from "react-router";

const appPages = ["/", "/diagnostics", "/settings", "/playground"] as const;
type AppPage = (typeof appPages)[number];

function isAppPage(path: unknown): path is AppPage {
  return appPages.some((page) => page === path);
}

const PanelPrefix = createContext<string | null>(null);

export function IngressNavigation({ children }: { children: ReactNode }) {
  const [panelPrefix, setPanelPrefix] = useState<string | null>(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const updateRoute = useEffectEvent((event: MessageEvent) => {
    if (
      event.source !== window.parent ||
      event.origin !== window.location.origin ||
      event.data?.type !== "home-assistant/properties"
    )
      return;

    const { prefix, path } = event.data.route ?? {};
    if (
      typeof prefix !== "string" ||
      !/^\/(?:[\w-]+\/)*[\w-]+$/.test(prefix) ||
      (path !== "" && !isAppPage(path))
    )
      return;

    setPanelPrefix(prefix);
    const page = path || "/";
    if (pathname !== page) {
      // Home Assistant owns the history entry. Replacing the frame avoids two Back steps.
      void navigate(page, { replace: true });
    }
  });

  useEffect(() => {
    if (window.parent === window) return;

    const origin = window.location.origin;
    const onMessage = (event: MessageEvent) => updateRoute(event);
    window.addEventListener("message", onMessage);
    window.parent.postMessage(
      { type: "home-assistant/subscribe-properties" },
      origin,
    );

    return () => {
      window.removeEventListener("message", onMessage);
      window.parent.postMessage(
        { type: "home-assistant/unsubscribe-properties" },
        origin,
      );
    };
  }, []);

  return (
    <PanelPrefix.Provider value={panelPrefix}>{children}</PanelPrefix.Provider>
  );
}

type AppPageLinkProps = Omit<NavLinkProps, "to" | "onClick"> & { to: AppPage };

export default function AppPageLink({ to, ...props }: AppPageLinkProps) {
  const panelPrefix = useContext(PanelPrefix);

  function openPanelPage(event: MouseEvent<HTMLAnchorElement>) {
    if (
      !panelPrefix ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      (props.target && props.target !== "_self")
    )
      return;

    event.preventDefault();
    if (event.currentTarget.getAttribute("aria-current") === "page") return;
    window.parent.postMessage(
      {
        type: "home-assistant/navigate",
        path: to === "/" ? panelPrefix : `${panelPrefix}${to}`,
      },
      window.location.origin,
    );
  }

  return <NavLink to={to} {...props} onClick={openPanelPage} />;
}
