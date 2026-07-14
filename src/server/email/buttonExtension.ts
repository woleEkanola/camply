import { Node } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    emailButton: {
      insertEmailButton: (options: { label: string; href: string }) => ReturnType;
    };
  }
}

/**
 * Custom TipTap node for branded CTA buttons in emails.
 * Stores label + href attributes, renders as a styled <a> tag.
 * Used by both the editor (client) and generateHTML (server).
 */
export const EmailButton = Node.create({
  name: "emailButton",

  group: "block",

  atom: true,

  addAttributes() {
    return {
      label: { default: "Click here" },
      href: { default: "#" },
    };
  },

  parseHTML() {
    return [{ tag: "a[data-email-button]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const { label, href } = HTMLAttributes;
    return [
      "table",
      { width: "100%", cellpadding: "0", cellspacing: "0", style: "margin: 16px 0;" },
      ["tr", {},
        ["td", { align: "center" },
          ["a", {
            "data-email-button": "",
            href: href,
            style: "display:inline-block;background-color:var(--brand-button,#E67E22);color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;text-align:center;",
          }, label],
        ],
      ],
    ];
  },

  addCommands() {
    return {
      insertEmailButton:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },
});
