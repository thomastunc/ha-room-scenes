import { render } from "preact";
import type { Hass } from "../api";
import { baseStyles, panelStyles } from "../styles";
import { App } from "./App";

const PREFIX = "/room-scenes";

class RoomScenesPanel extends HTMLElement {
  private _hass?: Hass;
  private _narrow = false;
  private _route?: { prefix: string; path: string };
  private mount?: HTMLDivElement;

  connectedCallback() {
    if (!this.shadowRoot) {
      const root = this.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = baseStyles + panelStyles;
      this.mount = document.createElement("div");
      root.append(style, this.mount);
      window.addEventListener("popstate", () => this.update());
    }
    this.update();
  }

  disconnectedCallback() {
    if (this.mount) render(null, this.mount);
  }

  set hass(hass: Hass) {
    this._hass = hass;
    this.update();
  }
  set narrow(v: boolean) {
    this._narrow = v;
    this.update();
  }
  set route(r: { prefix: string; path: string }) {
    this._route = r;
    this.update();
  }
  set panel(_p: unknown) {}

  private path(): string {
    if (this._route) return this._route.path || "";
    const p = location.pathname;
    return p.startsWith(PREFIX) ? p.slice(PREFIX.length) : "";
  }

  private navigate = (path: string) => {
    history.pushState(null, "", `${PREFIX}${path}`);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
    window.scrollTo({ top: 0 });
    this.update();
  };

  private toggleMenu = () => {
    this.dispatchEvent(new CustomEvent("hass-toggle-menu", { bubbles: true, composed: true }));
  };

  private update() {
    if (!this.mount || !this._hass) return;
    render(
      <App
        hass={this._hass}
        narrow={this._narrow}
        path={this.path()}
        navigate={this.navigate}
        toggleMenu={this.toggleMenu}
      />,
      this.mount
    );
  }
}

if (!customElements.get("room-scenes-panel")) {
  customElements.define("room-scenes-panel", RoomScenesPanel);
}
