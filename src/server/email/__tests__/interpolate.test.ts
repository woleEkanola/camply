import { describe, expect, it } from "vitest";
import {
  interpolateSubject,
  interpolateHtml,
  interpolateUrl,
  interpolateTipTapJson,
} from "../interpolate";

describe("interpolate", () => {
  describe("interpolateSubject (plain text)", () => {
    it("replaces basic tokens without HTML escaping", () => {
      const vars = { name: "O'Reilly & Sons <safe>" };
      const { text } = interpolateSubject("Welcome {{name}}!", vars);
      expect(text).toBe("Welcome O'Reilly & Sons <safe>!");
    });

    it("replaces possessive forms safely", () => {
      const vars = { name: "Camper" };
      const { text: t1 } = interpolateSubject("This is {{name}}'s bag", vars);
      expect(t1).toBe("This is Camper's bag");

      const { text: t2 } = interpolateSubject("This is {{name}}s' room", vars);
      expect(t2).toBe("This is Campers' room");
    });

    it("strips possessives when token is missing/unknown", () => {
      const { text } = interpolateSubject("Welcome {{missing}}'s friend!", {});
      expect(text).toBe("Welcome  friend!");
    });

    it("is safe from dollar sign replacement patterns in values", () => {
      const vars = { prize: "$100" };
      const { text } = interpolateSubject("You won {{prize}}!", vars);
      expect(text).toBe("You won $100!");
    });
  });

  describe("interpolateHtml (escaped text)", () => {
    it("HTML escapes standard tokens in body text", () => {
      const vars = { name: "O'Connor & <Co>" };
      const result = interpolateHtml("Welcome <div>{{name}}</div>", vars);
      expect(result.text).toBe("Welcome <div>O&#39;Connor &amp; &lt;Co&gt;</div>");
    });

    it("replaces possessive tokens safely in HTML text", () => {
      const vars = { name: "James" };
      const h1 = interpolateHtml("This is {{name}}'s book.", vars);
      expect(h1.text).toBe("This is James's book.");

      const h2 = interpolateHtml("This is {{name}}&#x27;s book.", vars);
      expect(h2.text).toBe("This is James&#x27;s book.");
    });
  });

  describe("interpolateUrl (escaping in URLs)", () => {
    it("url-encodes query params but preserves full URLs and data URIs", () => {
      const vars = {
        tracking_id: "id & key",
        signup_url: "https://camply.ng/signup?invite=yes&role=parent",
        qr_code: "data:image/png;base64,iVBORw0KGgoAAAANS",
      };

      const h1 = interpolateUrl("https://site.com/track?id={{tracking_id}}", vars);
      expect(h1.text).toBe("https://site.com/track?id=id%20%26%20key");

      const h2 = interpolateUrl("{{signup_url}}", vars);
      expect(h2.text).toBe("https://camply.ng/signup?invite=yes&role=parent");

      const h3 = interpolateUrl("{{qr_code}}", vars);
      expect(h3.text).toBe("data:image/png;base64,iVBORw0KGgoAAAANS");
    });
  });

  describe("interpolateTipTapJson", () => {
    it("recursively interpolates text and attributes in TipTap JSON tree", () => {
      const vars = {
        camper_name: "Tobi",
        registration_url: "https://camply.ng/reg/123",
      };

      const doc = {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Hello {{camper_name}}" }],
          },
          {
            type: "emailButton",
            attrs: {
              label: "Click Here",
              href: "{{registration_url}}",
            },
          },
        ],
      };

      const result = interpolateTipTapJson(doc, vars);

      expect(result.node).toEqual({
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Hello Tobi" }],
          },
          {
            type: "emailButton",
            attrs: {
              label: "Click Here",
              href: "https://camply.ng/reg/123",
            },
          },
        ],
      });
    });
  });
});
