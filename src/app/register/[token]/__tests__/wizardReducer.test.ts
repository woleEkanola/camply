import { describe, expect, it } from "vitest";
import { wizardReducer, createInitialState } from "../wizardReducer";
import type { WizardState, TeenRegistration } from "../types";

const TOKEN = "test-token";

function teen(overrides: Partial<TeenRegistration> = {}): TeenRegistration {
  return {
    camperId: "camper-1",
    registrationId: "reg-1",
    firstName: "Ada",
    lastName: "Lovelace",
    dateOfBirth: "2010-01-01",
    gender: "FEMALE",
    fieldsComplete: true,
    documentsComplete: true,
    ...overrides,
  };
}

describe("wizardReducer", () => {
  describe("RESTORE", () => {
    it("merges whitelisted fields and preserves the current token", () => {
      const initial = createInitialState(TOKEN);
      const restored = wizardReducer(initial, {
        type: "RESTORE",
        state: {
          token: "some-other-token", // must not override state.token
          step: "DETAILS",
          teens: [teen()],
          activeTeenId: "camper-1",
          email: "parent@example.com",
        },
      });

      expect(restored.token).toBe(TOKEN);
      expect(restored.step).toBe("DETAILS");
      expect(restored.teens).toHaveLength(1);
      expect(restored.teens[0].firstName).toBe("Ada");
      expect(restored.activeTeenId).toBe("camper-1");
      expect(restored.email).toBe("parent@example.com");
    });

    it("leaves fields not present in the restore payload untouched", () => {
      const initial: WizardState = { ...createInitialState(TOKEN), firstName: "Existing" };
      const restored = wizardReducer(initial, { type: "RESTORE", state: { step: "REVIEW" } });
      expect(restored.firstName).toBe("Existing");
      expect(restored.step).toBe("REVIEW");
    });
  });

  describe("SET_CAMP_DATA", () => {
    const campData = {
      campId: "camp-1",
      campName: "Summer Camp",
      campusId: "campus-1",
      campusName: "Main Campus",
      organizationId: "org-1",
      organizationName: "Org",
      year: 2026,
      status: "ACTIVE",
    };

    it("sets step to LANDING when coming from LOADING (fresh visit)", () => {
      const initial = createInitialState(TOKEN);
      expect(initial.step).toBe("LOADING");
      const next = wizardReducer(initial, { type: "SET_CAMP_DATA", data: campData });
      expect(next.step).toBe("LANDING");
      expect(next.campData).toEqual(campData);
    });

    it("does not reset a restored step back to LANDING", () => {
      const restoredState: WizardState = { ...createInitialState(TOKEN), step: "DETAILS" };
      const next = wizardReducer(restoredState, { type: "SET_CAMP_DATA", data: campData });
      expect(next.step).toBe("DETAILS");
      expect(next.campData).toEqual(campData);
    });
  });

  describe("GO_BACK", () => {
    it("routes a restored DETAILS step back to HUB", () => {
      const state: WizardState = { ...createInitialState(TOKEN), step: "DETAILS", previousStep: "HUB" };
      const next = wizardReducer(state, { type: "GO_BACK" });
      expect(next.step).toBe("HUB");
    });

    it("routes HUB back to LANDING, not IDENTITY — a signed-in parent must never see the email-entry screen again", () => {
      const state: WizardState = { ...createInitialState(TOKEN), step: "HUB", previousStep: "TEENS" };
      const next = wizardReducer(state, { type: "GO_BACK" });
      expect(next.step).toBe("LANDING");
    });
  });

  describe("START_ANOTHER", () => {
    it("resets teens/activeTeenId/declarations/returnTo but keeps campData/email/name and goes to HUB", () => {
      const campData = {
        campId: "camp-1",
        campName: "Summer Camp",
        campusId: "campus-1",
        campusName: "Main Campus",
        organizationId: "org-1",
        organizationName: "Org",
        year: 2026,
        status: "ACTIVE",
      };
      const state: WizardState = {
        ...createInitialState(TOKEN),
        step: "CONFIRMATION",
        campData,
        email: "parent@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
        teens: [teen()],
        activeTeenId: "camper-1",
        declarations: [{ id: "d1", checked: true }],
        returnTo: "REVIEW",
      };
      const next = wizardReducer(state, { type: "START_ANOTHER" });

      expect(next.step).toBe("HUB");
      expect(next.teens).toEqual([]);
      expect(next.activeTeenId).toBeNull();
      expect(next.declarations).toEqual([]);
      expect(next.returnTo).toBeUndefined();
      expect(next.campData).toEqual(campData);
      expect(next.email).toBe("parent@example.com");
      expect(next.firstName).toBe("Ada");
    });
  });
});
