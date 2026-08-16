import { describe, it, expect } from "vitest";
import {
  ConversationContextOrchestrator,
  sharedConversationContextOrchestrator,
} from "./conversation-context-orchestrator.js";

describe("ConversationContextOrchestrator", () => {
  it("extracts device and service from a price query", () => {
    const orch = new ConversationContextOrchestrator();
    const { context } = orch.resolve(
      "¿Cuánto cuesta cambiar la pantalla del Motorola G32?",
      "s1",
    );
    expect(context.device).toBe("Motorola G32");
    expect(context.service).toBe("Cambio de pantalla");
  });

  it("extracts device with a multi-word model", () => {
    const orch = new ConversationContextOrchestrator();
    const { context } = orch.resolve(
      "¿precio de reparación samsung a54?",
      "s1",
    );
    expect(context.device).toBe("Samsung A54");
  });

  it("extracts a standalone iPhone", () => {
    const orch = new ConversationContextOrchestrator();
    const { context } = orch.resolve("¿cuánto cuesta el iPhone?", "s1");
    expect(context.device).toBe("iPhone");
  });

  it("extracts only a service when no device is present", () => {
    const orch = new ConversationContextOrchestrator();
    const { context } = orch.resolve("¿Cuánto tarda un mantenimiento?", "s1");
    expect(context.service).toBe("Mantenimiento");
  });

  it("extracts a product", () => {
    const orch = new ConversationContextOrchestrator();
    const { context } = orch.resolve("¿venden cargadores?", "s1");
    expect(context.product).toBe("Cargador");
  });

  it("extracts a client name", () => {
    const orch = new ConversationContextOrchestrator();
    const { context } = orch.resolve("Mi nombre es Juan", "s1");
    expect(context.clientName).toBe("Juan");
  });

  it("extracts a two-part client name", () => {
    const orch = new ConversationContextOrchestrator();
    const { context } = orch.resolve("Me llamo Ana María", "s1");
    expect(context.clientName).toBe("Ana María");
  });

  it("extracts a repair id", () => {
    const orch = new ConversationContextOrchestrator();
    const { context } = orch.resolve("¿cómo va la reparación #123?", "s1");
    expect(context.repairId).toBe("123");
  });

  it("extracts a budget id", () => {
    const orch = new ConversationContextOrchestrator();
    const { context } = orch.resolve("¿cuánto era el presupuesto 456?", "s1");
    expect(context.budgetId).toBe("456");
  });

  it("carries entities over to a follow-up message", () => {
    const orch = new ConversationContextOrchestrator();
    orch.resolve("¿Cuánto cuesta cambiar la pantalla del Motorola G32?", "s1");
    const { context } = orch.resolve("¿Y cuánto demora?", "s1");
    expect(context.device).toBe("Motorola G32");
    expect(context.service).toBe("Cambio de pantalla");
  });

  it("resolves the reference 'eso' to the stored context", () => {
    const orch = new ConversationContextOrchestrator();
    orch.resolve("¿Cuánto cuesta cambiar la pantalla del Motorola G32?", "s1");
    const { context } = orch.resolve("¿Y eso tiene garantía?", "s1");
    expect(context.device).toBe("Motorola G32");
    expect(context.service).toBe("Cambio de pantalla");
  });

  it("resolves the reference 'el mismo' to the stored device", () => {
    const orch = new ConversationContextOrchestrator();
    orch.resolve("¿cuánto cuesta la batería del Samsung A54?", "s1");
    const { context } = orch.resolve("¿el mismo también?", "s1");
    expect(context.device).toBe("Samsung A54");
  });

  it("resolves 'esa reparación' to the stored repair id", () => {
    const orch = new ConversationContextOrchestrator();
    orch.resolve("¿cómo va la reparación #123?", "s1");
    const { context } = orch.resolve("¿y esa reparación cuándo termina?", "s1");
    expect(context.repairId).toBe("123");
  });

  it("clears the topic when a different device is mentioned", () => {
    const orch = new ConversationContextOrchestrator();
    orch.resolve("¿Cuánto cuesta cambiar la pantalla del Motorola G32?", "s1");
    const { context } = orch.resolve("¿Cuánto cuesta el iPhone 15?", "s1");
    expect(context.device).toBe("iPhone 15");
    expect(context.service).toBeUndefined();
  });

  it("replaces the service but keeps the device on follow-up", () => {
    const orch = new ConversationContextOrchestrator();
    orch.resolve("¿Cuánto cuesta cambiar la pantalla del Motorola G32?", "s1");
    const { context } = orch.resolve("¿Y el vidrio?", "s1");
    expect(context.device).toBe("Motorola G32");
    expect(context.service).toBe("Cambio de vidrio");
  });

  it("accumulates entities over consecutive messages", () => {
    const orch = new ConversationContextOrchestrator();
    orch.resolve("¿Cuánto cuesta cambiar la pantalla del Motorola G32?", "s1");
    orch.resolve("¿Y cuánto demora?", "s1");
    const { context } = orch.resolve("Mi nombre es Juan", "s1");
    expect(context.device).toBe("Motorola G32");
    expect(context.service).toBe("Cambio de pantalla");
    expect(context.clientName).toBe("Juan");
  });

  it("starts a new conversation with an empty context", () => {
    const orch = new ConversationContextOrchestrator();
    orch.resolve("¿Cuánto cuesta cambiar la pantalla del Motorola G32?", "s1");
    const { context } = orch.resolve("¿Cuánto cuesta el iPhone 15?", "s2");
    expect(context).toEqual({
      device: "iPhone 15",
      brand: "iPhone",
      model: "15",
    });
  });

  it("is deterministic for the same input", () => {
    const a = new ConversationContextOrchestrator();
    const b = new ConversationContextOrchestrator();
    const input = "¿Cuánto cuesta cambiar la pantalla del Motorola G32?";
    expect(a.resolve(input, "x").context).toEqual(
      b.resolve(input, "x").context,
    );
  });

  it("reports whether the context changed", () => {
    const orch = new ConversationContextOrchestrator();
    const first = orch.resolve("¿precio de un Motorola G32?", "s1");
    expect(first.changed).toBe(true);
    const second = orch.resolve("¿y el mismo?", "s1");
    expect(second.changed).toBe(false);
  });

  it("returns the stored snapshot via getContext", () => {
    const orch = new ConversationContextOrchestrator();
    orch.resolve("¿Cuánto cuesta cambiar la pantalla del Motorola G32?", "s1");
    expect(orch.getContext("s1")).toEqual({
      device: "Motorola G32",
      brand: "Motorola",
      model: "G32",
      service: "Cambio de pantalla",
    });
    expect(orch.getContext("unknown")).toBeNull();
  });

  it("clears all stored context", () => {
    const orch = new ConversationContextOrchestrator();
    orch.resolve("¿precio de un Motorola G32?", "s1");
    orch.clear();
    expect(orch.count()).toBe(0);
    expect(orch.getContext("s1")).toBeNull();
  });

  it("evicts the oldest entry when the store is full", () => {
    const orch = new ConversationContextOrchestrator({ maxEntries: 2 });
    orch.resolve("¿precio de un Motorola G32?", "a");
    orch.resolve("¿precio de un Samsung A54?", "b");
    orch.resolve("¿precio de un iPhone 15?", "c");
    expect(orch.count()).toBe(2);
    expect(orch.getContext("a")).toBeNull();
    expect(orch.getContext("b")).not.toBeNull();
    expect(orch.getContext("c")).not.toBeNull();
  });

  it("does not extract entities from plain greetings", () => {
    const orch = new ConversationContextOrchestrator();
    const { context, entities } = orch.resolve("Hola, ¿cómo estás?", "s1");
    expect(context).toEqual({});
    expect(entities).toEqual({});
  });

  it("exposes a shared singleton instance", () => {
    expect(sharedConversationContextOrchestrator).toBeInstanceOf(
      ConversationContextOrchestrator,
    );
  });

  it("extracts a standalone brand as device", () => {
    const orch = new ConversationContextOrchestrator();
    const { context } = orch.resolve("Mi Samsung se cayó", "s1");
    expect(context.device).toBe("Samsung");
    expect(context.brand).toBe("Samsung");
    expect(context.model).toBeUndefined();
  });

  it("extracts brand and model independently", () => {
    const orch = new ConversationContextOrchestrator();
    const { context } = orch.resolve("Mi Samsung A52 se cayó", "s1");
    expect(context.device).toBe("Samsung A52");
    expect(context.brand).toBe("Samsung");
    expect(context.model).toBe("A52");
  });

  it("does not treat following context words as a model", () => {
    const orch = new ConversationContextOrchestrator();
    const { context } = orch.resolve("Mi Samsung no prende", "s1");
    expect(context.device).toBe("Samsung");
    expect(context.model).toBeUndefined();
  });

  it("extracts a quantity", () => {
    const orch = new ConversationContextOrchestrator();
    const { context } = orch.resolve("Necesito imprimir 30 llaveros", "s1");
    expect(context.quantity).toBe(30);
    expect(context.product).toBe("Llavero");
  });

  it("extracts color and product from 'Quiero PLA negro'", () => {
    const orch = new ConversationContextOrchestrator();
    const { context } = orch.resolve("Quiero PLA negro", "s1");
    expect(context.color).toBe("negro");
    expect(context.material).toBe("PLA");
    expect(context.product).toBe("PLA");
  });

  it("extracts material from 'Quiero imprimirlo en PLA'", () => {
    const orch = new ConversationContextOrchestrator();
    const { context } = orch.resolve("Quiero imprimirlo en PLA", "s1");
    expect(context.material).toBe("PLA");
  });

  it("extracts a combined order description", () => {
    const orch = new ConversationContextOrchestrator();
    const { context } = orch.resolve(
      "Necesito 30 llaveros negros de PLA",
      "s1",
    );
    expect(context.quantity).toBe(30);
    expect(context.color).toBe("negro");
    expect(context.material).toBe("PLA");
    expect(context.product).toBe("Llavero");
  });

  it("extracts service and urgency", () => {
    const orch = new ConversationContextOrchestrator();
    const { context } = orch.resolve(
      "Necesito reparar el celular urgente",
      "s1",
    );
    expect(context.service).toBe("Reparación");
    expect(context.urgency).toBe("urgente");
  });

  it("keeps device and product when both are mentioned", () => {
    const orch = new ConversationContextOrchestrator();
    const { context } = orch.resolve(
      "Quiero reparar mi Samsung A52 y además comprar un cargador",
      "s1",
    );
    expect(context.device).toBe("Samsung A52");
    expect(context.brand).toBe("Samsung");
    expect(context.model).toBe("A52");
    expect(context.service).toBe("Reparación");
    expect(context.product).toBe("Cargador");
  });

  it("resets order attributes when the product changes", () => {
    const orch = new ConversationContextOrchestrator();
    orch.resolve("Necesito 30 llaveros negros de PLA", "s1");
    const { context } = orch.resolve("Quiero un cargador", "s1");
    expect(context.product).toBe("Cargador");
    expect(context.quantity).toBeUndefined();
    expect(context.color).toBeUndefined();
    expect(context.material).toBeUndefined();
  });

  it("keeps order attributes on follow-up of the same product", () => {
    const orch = new ConversationContextOrchestrator();
    orch.resolve("Necesito 30 llaveros negros de PLA", "s1");
    const { context } = orch.resolve("¿Cuánto cuesta?", "s1");
    expect(context.product).toBe("Llavero");
    expect(context.quantity).toBe(30);
    expect(context.color).toBe("negro");
    expect(context.material).toBe("PLA");
  });

  it("extracts logo personalization", () => {
    const orch = new ConversationContextOrchestrator();
    const { context } = orch.resolve("Quiero 30 tazas con mi logo", "s1");
    expect(context.product).toBe("Taza");
    expect(context.quantity).toBe(30);
    expect(context.logo).toBe(true);
  });

  it("extracts a delivery date", () => {
    const orch = new ConversationContextOrchestrator();
    const { context } = orch.resolve("Lo necesito para el lunes", "s1");
    expect(context.date).toBe("lunes");
  });

  it("never exposes commercial values in context entities", () => {
    const orch = new ConversationContextOrchestrator();
    const { context, entities } = orch.resolve(
      "Necesito 30 llaveros negros de PLA",
      "s1",
    );
    expect(Object.keys(context)).not.toContain("stock");
    expect(Object.keys(context)).not.toContain("price");
    expect(Object.keys(entities)).not.toContain("stock");
    expect(Object.keys(entities)).not.toContain("price");
  });

  describe("resolveEntities", () => {
    it("merges pre-extracted entities into the session context", () => {
      const orch = new ConversationContextOrchestrator();
      const { context } = orch.resolveEntities(
        { device: "Samsung A54", problem: "no enciende" },
        "s1",
      );
      expect(context.device).toBe("Samsung A54");
      expect(context.brand).toBe("Samsung");
      expect(context.model).toBe("A54");
      expect(context.problem).toBe("no enciende");
    });

    it("carries injected entities over to a follow-up resolve", () => {
      const orch = new ConversationContextOrchestrator();
      orch.resolveEntities(
        { device: "Motorola G32", problem: "pantalla rota" },
        "s1",
      );
      const { context } = orch.resolve("¿Cuánto cuesta?", "s1");
      expect(context.device).toBe("Motorola G32");
      expect(context.problem).toBe("pantalla rota");
    });

    it("canonicalizes a plain device string into brand/model", () => {
      const orch = new ConversationContextOrchestrator();
      const { context } = orch.resolveEntities({ device: "Samsung A54" }, "s1");
      expect(context.device).toBe("Samsung A54");
      expect(context.brand).toBe("Samsung");
      expect(context.model).toBe("A54");
    });

    it("respects device change lifecycle and resets the problem", () => {
      const orch = new ConversationContextOrchestrator();
      orch.resolveEntities(
        { device: "Motorola G32", problem: "pantalla rota" },
        "s1",
      );
      const { context } = orch.resolveEntities(
        { device: "iPhone 15", problem: "batería" },
        "s1",
      );
      expect(context.device).toBe("iPhone 15");
      expect(context.problem).toBe("batería");
    });

    it("does not overwrite a problem when none is provided on device entity merge", () => {
      const orch = new ConversationContextOrchestrator();
      orch.resolveEntities(
        { device: "Motorola G32", problem: "no enciende" },
        "s1",
      );
      const { context } = orch.resolveEntities({ clientName: "Ana" }, "s1");
      expect(context.problem).toBe("no enciende");
      expect(context.clientName).toBe("Ana");
    });

    it("exposes the resolved entities and changed flag", () => {
      const orch = new ConversationContextOrchestrator();
      const empty = orch.resolveEntities({}, "s1");
      expect(empty.context).toEqual({});
      expect(empty.changed).toBe(false);
      const full = orch.resolveEntities({ product: "Llavero" }, "s1");
      expect(full.context.product).toBe("Llavero");
      expect(full.changed).toBe(true);
    });
  });
});
