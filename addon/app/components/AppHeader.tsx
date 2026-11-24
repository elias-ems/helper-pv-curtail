import type { CSSProperties } from "react";
import { NavLink } from "react-router";
import brandLogo from "../assets/elias-ems-dark.svg?inline";
import brandIcon from "../assets/elias-ems-icon.svg?inline";

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  // Matches the height of Home Assistant's own app bar, so the add-on's bar
  // lines up with HA's when HA shows one (narrow layouts, where the panel gets
  // a header with the sidebar's menu button).
  height: 64,
  background: "var(--color-header-bg)",
  color: "var(--color-header-text)",
  // Above the autocomplete's suggestion popover, which sits at 10.
  position: "sticky",
  top: 0,
  zIndex: 20,
};

const titleStyle: CSSProperties = {
  // Pushes the links to the far end of the bar.
  marginRight: "auto",
  fontWeight: 700,
};

const navStyle: CSSProperties = {
  display: "flex",
  alignSelf: "stretch",
};

/**
 * A tab in the bar, underlined when it is the page you're on. The indicator is
 * an inset shadow rather than a border so that switching pages doesn't move the
 * label by the three pixels the border would occupy.
 */
const linkStyle = ({ isActive }: { isActive: boolean }): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  color: "var(--color-header-text)",
  textDecoration: "none",
  fontWeight: isActive ? 700 : 500,
  boxShadow: isActive ? "inset 0 -3px 0 var(--brand-apricot)" : "none",
});

export default function AppHeader() {
  return (
    <header className="app-header" style={headerStyle}>
      <img className="app-header-logo" src={brandLogo} alt="elias-ems" />
      <img className="app-header-icon" src={brandIcon} alt="elias-ems" />
      <span className="app-header-title" style={titleStyle}>
        PV Curtail Helper
      </span>
      <nav style={navStyle}>
        <NavLink to="/" end style={linkStyle}>
          Status
        </NavLink>
        <NavLink to="/settings" style={linkStyle}>
          Settings
        </NavLink>
      </nav>
    </header>
  );
}
