import { describe, it, expect, vi } from "vitest";
import { InterviewRouter } from "./interview-router.js";
import { InterviewController } from "../interview/v2/interview-controller.js";
import { SchemaRegistry } from "../interview/v2/schema-registry.js";

function makeTestSchema(overrides = {}) {
  return {
    $schema: "https://nexus.tecno-sanjuan.com/interview/v2/service-schema.json",
    serviceId: "test-service",
    serviceVersion: "1.0.0",
    serviceName: "Test Service",
    description: "A test service",
    updatedAt: "2026-07-26T00:00:00Z",
    tags: ["test"],
    fieldOrder: ["name"],
    minimumRequired: 1,
    allowConcurrent: false,
    fields: [
      {
        id: "name",
        type: "text",
        label: "Name",
        question: "What is your name?",
        required: true,
      },
    ],
    summaryTemplate: "Hello {{name}}",
    whatsappTemplate: "*hello* {{name}}",
    ...overrides,
  };
}

function makeRouter(options = {}) {
  const registry = options.schemaRegistry || new SchemaRegistry();
  const controller = options.interviewController || new InterviewController();
  return new InterviewRouter({
    schemaRegistry: registry,
    interviewController: controller,
    ...options,
  });
}

function makeMockRouter(options = {}) {
  const mockRegistry = {
    load: vi.fn(),
    register: vi.fn(),
  };
  const mockController = {
    start: vi.fn(),
    hasSession: vi.fn(),
    getSession: vi.fn(),
    answer: vi.fn(),
    next: vi.fn(),
    clearSession: vi.fn(),
  };
  return {
    router: new InterviewRouter({
      schemaRegistry: options.schemaRegistry || mockRegistry,
      interviewController: options.interviewController || mockController,
      patterns: options.patterns,
      consultationPatterns: options.consultationPatterns,
      schemaMap: options.schemaMap,
    }),
    mockRegistry,
    mockController,
  };
}

describe("InterviewRouter", () => {
  describe("constructor", () => {
    it("rejects missing schemaRegistry", () => {
      expect(() => new InterviewRouter({ interviewController: {} })).toThrow(
        "schemaRegistry is required",
      );
    });

    it("rejects missing interviewController", () => {
      expect(() => new InterviewRouter({ schemaRegistry: {} })).toThrow(
        "interviewController is required",
      );
    });

    it("accepts valid options", () => {
      const router = makeRouter();
      expect(router).toBeInstanceOf(InterviewRouter);
    });
  });

  describe("classify", () => {
    it("returns none for empty message", () => {
      const { router } = makeMockRouter();
      expect(router.classify("")).toEqual({ type: "none" });
    });

    it("returns none for null message", () => {
      const { router } = makeMockRouter();
      expect(router.classify(null)).toEqual({ type: "none" });
    });

    it("returns none for undefined message", () => {
      const { router } = makeMockRouter();
      expect(router.classify(undefined)).toEqual({ type: "none" });
    });

    it("returns none for non-string message", () => {
      const { router } = makeMockRouter();
      expect(router.classify(123)).toEqual({ type: "none" });
    });

    describe("detects repair actions", () => {
      const { router } = makeMockRouter();
      const repairMessages = [
        "quiero arreglar una notebook",
        "quiero reparar mi pc",
        "arreglo de tablet",
        "quiero reparar mi celular",
        "necesito reparar mi Samsung",
        "quiero cambiar la pantalla",
        "necesito cambiar la batería",
        "necesito llevar el celular a reparar",
        "quiero dejar el celu para reparar",
        "cambiame la pantalla",
        "arreglame el celu",
        "me pueden reparar la pantalla",
        "podes arreglarme el celular",
        "quiero poner la pantalla nueva",
        "quiero arreglar el teléfono de mi mamá",
      ];

      for (const msg of repairMessages) {
        it(`detects: "${msg}"`, () => {
          expect(router.classify(msg)).toEqual({
            type: "action",
            interview: "repair-request",
          });
        });
      }
    });

    describe("detects budget actions", () => {
      const { router } = makeMockRouter();
      const budgetActionMessages = [
        "quiero un presupuesto",
        "necesito una cotización",
        "solicito un presupuesto",
        "presupuesto de reparación",
        "presupuesto para mi celular",
        "me das una cotización",
        "pasame un presupuesto",
        "me hacen un presupuesto",
        "quiero que me hagan una cotización",
      ];

      for (const msg of budgetActionMessages) {
        it(`detects: "${msg}"`, () => {
          expect(router.classify(msg)).toEqual({
            type: "action",
            interview: "budget-request",
          });
        });
      }
    });

    describe("detects print actions", () => {
      const { router } = makeMockRouter();
      const printMessages = [
        "quiero imprimir una pieza 3d",
        "necesito un diseño 3d",
        "impresión 3d de figura",
        "me imprimís una pieza",
        "modelo impreso 3d",
        "quiero una impresión 3D",
        "imprimime una figura",
        "quiero que me imprimas una figura",
        "necesito que me impriman una pieza",
        "¿me podés hacer una impresión 3d?",
      ];

      for (const msg of printMessages) {
        it(`detects: "${msg}"`, () => {
          expect(router.classify(msg)).toEqual({
            type: "action",
            interview: "print-order",
          });
        });
      }
    });

    describe("detects price consultations", () => {
      const { router } = makeMockRouter();
      const priceMessages = [
        "cuánto cuesta reparar una pantalla",
        "quiero saber el precio",
        "cuánto vale cambiar batería",
        "quiero información de precios",
        "cuánto cobran por arreglar",
        "costo de reparación",
        "cuánto cuesta cambiar la pantalla del Motorola G32",
        "qué precio tiene",
      ];

      for (const msg of priceMessages) {
        it(`detects: "${msg}"`, () => {
          expect(router.classify(msg)).toEqual({
            type: "consultation",
            topic: "price",
          });
        });
      }
    });

    describe("detects business consultations", () => {
      const { router } = makeMockRouter();
      const businessMessages = [
        "cuál es el horario",
        "dónde están ubicados",
        "qué servicios ofrecen",
        "trabajan con iPhone",
        "qué marcas trabajan",
        "tienen garantía",
      ];

      for (const msg of businessMessages) {
        it(`detects: "${msg}"`, () => {
          expect(router.classify(msg)).toEqual({
            type: "consultation",
            topic: "business",
          });
        });
      }
    });

    describe("does not start interviews: problem descriptions", () => {
      const { router } = makeMockRouter();
      const descriptionMessages = [
        "mi celular no prende",
        "mi notebook no arranca",
        "se rompió la pantalla",
        "no funciona mi equipo",
        "la batería dura muy poco",
        "se me mojó el teléfono",
        "se me cayó el celular",
        "el celular no enciende",
        "la batería no carga",
        "tengo la pantalla rota",
        "el teléfono no funciona",
        "mi pantalla se rompió",
        "el celular no enciende y no carga",
        "se me rompió el celu y no enciende",
      ];

      for (const msg of descriptionMessages) {
        it(`does not start: "${msg}"`, () => {
          expect(router.classify(msg)).toEqual({ type: "none" });
        });
      }
    });

    describe("does not start interviews: hypothetical questions", () => {
      const { router } = makeMockRouter();
      const hypotheticalMessages = [
        "¿Qué hago si se me mojó el celular?",
        "¿Qué hago si se rompió la pantalla?",
        "¿Qué hago si se me mojó?",
        "¿Qué hago si quiero imprimir?",
        "¿Qué hago con el celular roto?",
        "¿Qué pasa si no enciende?",
        "¿Qué pasaría si se moja?",
        "¿Qué haría si se rompe?",
        "¿la pantalla rota se puede arreglar?",
        "¿se puede reparar una pantalla rota?",
        "¿cómo hago para reparar mi celular?",
        "¿me podés decir si se puede arreglar mi pantalla?",
      ];

      for (const msg of hypotheticalMessages) {
        it(`does not start: "${msg}"`, () => {
          expect(router.classify(msg)).toEqual({ type: "none" });
        });
      }
    });

    describe("does not start interviews: capability and informational questions", () => {
      const { router } = makeMockRouter();
      const capabilityMessages = [
        "¿Hacen reparaciones?",
        "¿hacen reparación de celulares?",
        "¿reparan pantallas?",
        "¿hacen impresión 3d de figuras?",
        "¿hacen impresiones 3d?",
        "¿imprimen en 3d?",
        "¿hacen presupuestos?",
        "¿qué es la impresión 3d?",
        "¿tenés impresión 3d?",
        "impresión 3d",
      ];

      for (const msg of capabilityMessages) {
        it(`does not start: "${msg}"`, () => {
          expect(router.classify(msg)).toEqual({ type: "none" });
        });
      }
    });

    describe("antijacking: commercial consultations do not start interviews", () => {
      it("routes price questions to consultation", () => {
        const { router } = makeMockRouter();
        expect(router.classify("¿Cuánto cuesta reparar un celular?")).toEqual({
          type: "consultation",
          topic: "price",
        });
      });

      it("routes warranty/business questions to consultation", () => {
        const { router } = makeMockRouter();
        expect(router.classify("¿Mi pantalla rota tiene garantía?")).toEqual({
          type: "consultation",
          topic: "business",
        });
        expect(
          router.classify("¿Qué garantía tienen las reparaciones?"),
        ).toEqual({
          type: "consultation",
          topic: "business",
        });
      });

      it("gates action+query: budget price question does not become a plain action", () => {
        const { router } = makeMockRouter();
        const result = router.classify(
          "¿cuánto es un presupuesto de reparación?",
        );
        expect(result.type).toBe("action");
        expect(result.interview).toBe("budget-request");
        expect(result.query).toBe("price");
      });

      it("gates action+query: 3d price question does not become a plain action", () => {
        const { router } = makeMockRouter();
        const result = router.classify("¿cuánto cuesta la impresión 3d?");
        expect(result.type).toBe("consultation");
        expect(result.topic).toBe("price");
      });
    });

    describe("impresión 3d: equivalent explicit requests start the interview", () => {
      const { router } = makeMockRouter();
      const printRequests = [
        "Quiero imprimir una pieza.",
        "Necesito una impresión 3d.",
        "Quiero que me imprimas una figura.",
        "Necesito que me impriman una pieza.",
      ];

      for (const msg of printRequests) {
        it(`starts: "${msg}"`, () => {
          expect(router.classify(msg)).toEqual({
            type: "action",
            interview: "print-order",
          });
        });
      }
    });

    describe("ignores normal chat messages", () => {
      const { router } = makeMockRouter();
      const normalMessages = [
        "hola",
        "buenos días",
        "gracias",
        "chau",
        "muchas gracias",
      ];

      for (const msg of normalMessages) {
        it(`ignores: "${msg}"`, () => {
          expect(router.classify(msg)).toEqual({ type: "none" });
        });
      }
    });

    it("respects custom action patterns", () => {
      const customPatterns = {
        "custom-service": [/\bcustom\s+service\b/i],
      };
      const { router } = makeMockRouter({ patterns: customPatterns });
      expect(router.classify("need custom service")).toEqual({
        type: "action",
        interview: "custom-service",
      });
      expect(router.classify("mi celular no prende")).toEqual({ type: "none" });
    });

    it("respects custom consultation patterns", () => {
      const customConsultation = { availability: [/\bdisponibilidad\b/i] };
      const { router } = makeMockRouter({
        consultationPatterns: customConsultation,
      });
      expect(router.classify("hay disponibilidad?")).toEqual({
        type: "consultation",
        topic: "availability",
      });
    });
  });

  describe("selectSchema", () => {
    it("returns repair-request schemaId for repair-request intent", () => {
      const { router } = makeMockRouter();
      expect(router.selectSchema("repair-request")).toBe("repair-request");
    });

    it("returns budget-request schemaId for budget-request intent", () => {
      const { router } = makeMockRouter();
      expect(router.selectSchema("budget-request")).toBe("budget-request");
    });

    it("returns print-order schemaId for print-order intent", () => {
      const { router } = makeMockRouter();
      expect(router.selectSchema("print-order")).toBe("print-order");
    });

    it("returns null for unknown intent", () => {
      const { router } = makeMockRouter();
      expect(router.selectSchema("unknown-intent")).toBeNull();
    });

    it("returns null for null intent", () => {
      const { router } = makeMockRouter();
      expect(router.selectSchema(null)).toBeNull();
    });

    it("respects custom schema map", () => {
      const customMap = { "repair-request": "custom-repair" };
      const { router } = makeMockRouter({ schemaMap: customMap });
      expect(router.selectSchema("repair-request")).toBe("custom-repair");
    });
  });

  describe("startInterview", () => {
    it("loads schema and starts interview", async () => {
      const { router, mockRegistry, mockController } = makeMockRouter();
      const schema = makeTestSchema();
      mockRegistry.load.mockResolvedValue(schema);
      mockController.start.mockResolvedValue({
        sessionId: "abc",
        question: { question: "test?" },
        interviewComplete: false,
      });

      const result = await router.startInterview("test-service");

      expect(mockRegistry.load).toHaveBeenCalledWith("test-service");
      expect(mockController.start).toHaveBeenCalledWith(schema, null);
      expect(result.sessionId).toBe("abc");
      expect(result.question.question).toBe("test?");
    });

    it("propagates registry errors", async () => {
      const { router, mockRegistry } = makeMockRouter();
      mockRegistry.load.mockRejectedValue(new Error("Schema not found"));

      await expect(router.startInterview("nonexistent")).rejects.toThrow(
        "Schema not found",
      );
    });

    it("propagates controller errors", async () => {
      const { router, mockRegistry, mockController } = makeMockRouter();
      mockRegistry.load.mockResolvedValue(makeTestSchema());
      mockController.start.mockRejectedValue(new Error("Controller error"));

      await expect(router.startInterview("test-service")).rejects.toThrow(
        "Controller error",
      );
    });

    it("returns interviewComplete flag", async () => {
      const { router, mockRegistry, mockController } = makeMockRouter();
      mockRegistry.load.mockResolvedValue(makeTestSchema());
      mockController.start.mockResolvedValue({
        sessionId: "abc",
        question: null,
        interviewComplete: true,
      });

      const result = await router.startInterview("test-service");

      expect(result.interviewComplete).toBe(true);
      expect(result.question).toBeNull();
    });
  });
});
