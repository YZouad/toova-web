/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { isOneClickUnsubscribe, renderLifecycleEmail } from "./templates";

const site = "https://toova.net";
const unsub = "https://xfifgtedssabneqlxbhf.supabase.co/functions/v1/send-lifecycle-email?unsubscribe=abc";

function render(template: string, payload: Record<string, unknown> = {}) {
  return renderLifecycleEmail({
    template,
    payload,
    siteUrl: site,
    unsubscribeUrl: unsub,
  });
}

describe("renderLifecycleEmail", () => {
  it("gives each letter one headline, one link, and an unsubscribe header", () => {
    const cases: Array<[string, string, string]> = [
      ["finish_room", "Your room is still open", "https://toova.net/"],
      ["model_ready", "Your model is ready", "https://toova.net/"],
      ["room_liked", "Your room got a like", "https://toova.net/gallery"],
      ["room_copied", "Your room was copied", "https://toova.net/gallery"],
      ["credits_refreshed", "This month’s credits are ready", "https://toova.net/"],
      ["move_in_countdown", "A few things are still on your list", "https://toova.net/"],
    ];

    for (const [template, headline, href] of cases) {
      const email = render(template);
      expect(email.subject.length).toBeGreaterThan(0);
      expect(email.html).toContain(headline);
      expect(email.html).toContain(`href="${href}"`);
      expect(email.html).toContain("toova-logo-cropped.png");
      expect(email.text).toContain(headline);
      expect(email.text).toContain(href);
      expect(email.text).toContain(unsub);
      expect(email.headers["List-Unsubscribe"]).toBe(`<${unsub}>`);
      expect(email.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    }
  });

  it("uses the model label and the room name when they are present", () => {
    const model = render("model_ready", { label: "Desk lamp" });
    expect(model.html).toContain("Desk lamp is ready");
    expect(model.subject).toBe("Your model is ready");

    const liked = render("room_liked", { room_name: "North dorm" });
    expect(liked.html).toContain("North dorm got a like");
    expect(liked.text).toContain("North dorm got a like");
  });

  it("escapes names so they cannot break the markup", () => {
    const email = render("room_copied", {
      room_name: `<img src=x onerror=alert(1)> "quoted"`,
    });
    expect(email.html).not.toContain("<img src=x");
    expect(email.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(email.html).toContain("&quot;quoted&quot;");
    expect(email.text).toContain(`<img src=x onerror=alert(1)> "quoted"`);
  });

  it("omits the unsubscribe header when there is no token", () => {
    const email = renderLifecycleEmail({
      template: "finish_room",
      payload: {},
      siteUrl: "https://toova.net/",
      unsubscribeUrl: "",
    });
    expect(email.headers).toEqual({});
    expect(email.html).not.toContain("Unsubscribe");
    expect(email.text).not.toContain("Unsubscribe");
    expect(email.html).toContain("https://toova.net/");
  });

  it("still sends a plain note for an unknown template", () => {
    const email = render("nope");
    expect(email.subject).toBe("A note from Toova");
    expect(email.html).toContain("Something is waiting in Toova");
  });
});

describe("isOneClickUnsubscribe", () => {
  it("accepts the RFC 8058 body and the one-click header", () => {
    expect(isOneClickUnsubscribe("List-Unsubscribe=One-Click", null)).toBe(true);
    expect(isOneClickUnsubscribe("a=1&List-Unsubscribe=One-Click", null)).toBe(true);
    expect(isOneClickUnsubscribe("", "One-Click")).toBe(true);
  });

  it("rejects an ordinary post", () => {
    expect(isOneClickUnsubscribe("", null)).toBe(false);
    expect(isOneClickUnsubscribe("List-Unsubscribe=Something", null)).toBe(false);
  });
});
