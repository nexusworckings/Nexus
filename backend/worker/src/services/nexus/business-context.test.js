import { describe, it, expect } from "vitest";
import {
  composePlannerContext,
  buildConversationContextData,
  serializeConversationContext,
  BUSINESS_CONTEXT_VERSION,
} from "./business-context.js";

describe("business-context (Business/Policy + Conversation Context)", () => {
  describe("composePlannerContext", () => {
    it("composes policy and persona", () => {
      const out = composePlannerContext("POLICY", "PERSONA");
      expect(out).toContain("POLICY");
      expect(out).toContain("PERSONA");
    });

    it("returns only persona when policy is empty", () => {
      expect(composePlannerContext("", "PERSONA")).toBe("PERSONA");
      expect(composePlannerContext(null, "PERSONA")).toBe("PERSONA");
    });

    it("returns only policy when persona is empty", () => {
      expect(composePlannerContext("POLICY", "")).toBe("POLICY");
    });

    it("returns empty string when both are empty", () => {
      expect(composePlannerContext("", null)).toBe("");
    });
  });

  describe("buildConversationContextData", () => {
    it("wraps entities into { entities, references, state }", () => {
      const data = buildConversationContextData({
        product: "PLA",
        color: "negro",
      });
      expect(data).toEqual({
        entities: { product: "PLA", color: "negro" },
        references: {},
        state: {},
      });
    });

    it("returns empty entities for empty/non-object input", () => {
      expect(buildConversationContextData({})).toEqual({
        entities: {},
        references: {},
        state: {},
      });
      expect(buildConversationContextData(null)).toEqual({
        entities: {},
        references: {},
        state: {},
      });
      expect(buildConversationContextData("device")).toEqual({
        entities: {},
        references: {},
        state: {},
      });
    });

    it("does not mutate the original context", () => {
      const source = { device: "Samsung A52" };
      buildConversationContextData(source);
      expect(source).toEqual({ device: "Samsung A52" });
    });
  });

  describe("serializeConversationContext", () => {
    it("produces parseable structured JSON", () => {
      const json = serializeConversationContext({ product: "PLA" });
      const parsed = JSON.parse(json);
      expect(parsed).toEqual({
        entities: { product: "PLA" },
        references: {},
        state: {},
      });
    });
  });

  it("exposes a stable version", () => {
    expect(BUSINESS_CONTEXT_VERSION).toBe("1.0.0");
  });
});
