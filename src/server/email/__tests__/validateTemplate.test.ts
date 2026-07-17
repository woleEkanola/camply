import { describe, expect, it } from "vitest";
import { validateTemplate } from "../validateTemplate";

describe("validateTemplate", () => {
  it("flags unknown variables in the subject line", () => {
    const { unknownTokens } = validateTemplate({
      subject: "Hello {{camper_name}}! Check out {{unknown_subject_var}}.",
      previewText: "Your registration info",
      tiptapJson: { type: "doc", content: [] },
    });

    expect(unknownTokens).toContain("unknown_subject_var");
    expect(unknownTokens).not.toContain("camper_name");
  });

  it("flags unknown variables in the preview text", () => {
    const { unknownTokens } = validateTemplate({
      subject: "Important update",
      previewText: "Hi {{camper_name}}, check {{invalid_preview_var}}.",
      tiptapJson: { type: "doc", content: [] },
    });

    expect(unknownTokens).toContain("invalid_preview_var");
    expect(unknownTokens).not.toContain("camper_name");
  });

  it("recursively flags unknown variables in the TipTap JSON content", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Welcome to {{camp_name}}, {{camper_name}}!" },
            { type: "text", text: "Your leader is {{invalid_body_var}}." },
          ],
        },
        {
          type: "emailButton",
          attrs: {
            label: "Update info",
            href: "{{registration_url}}?ref={{invalid_attr_var}}",
          },
        },
      ],
    };

    const { unknownTokens } = validateTemplate({
      subject: "Welcome",
      previewText: "Welcome",
      tiptapJson: doc,
    });

    expect(unknownTokens).toContain("invalid_body_var");
    expect(unknownTokens).toContain("invalid_attr_var");
    expect(unknownTokens).not.toContain("camp_name");
    expect(unknownTokens).not.toContain("camper_name");
    expect(unknownTokens).not.toContain("registration_url");
  });

  it("passes when all variables in subject, preview, and JSON are valid and registered", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Dear {{parent_name}}, welcome to {{camp_name}}." }],
        },
      ],
    };

    const { unknownTokens } = validateTemplate({
      subject: "Registration details for {{camper_name}}",
      previewText: "Details inside for {{camper_name}}",
      tiptapJson: doc,
    });

    expect(unknownTokens).toHaveLength(0);
  });

  it("ignores whitespace variations inside token braces", () => {
    const { unknownTokens } = validateTemplate({
      subject: "Hello {{ camper_name   }} and {{   parent_name}}",
      previewText: "Preview",
      tiptapJson: { type: "doc", content: [] },
    });

    expect(unknownTokens).toHaveLength(0);
  });
});
