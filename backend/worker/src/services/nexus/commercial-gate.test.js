import { describe, it, expect } from "vitest";
import {
  evaluateCommercialGate,
  classifyCommercialIntent,
  extractEvidence,
  buildSafeFallback,
  normalizeText,
  CLAIM_TYPES,
} from "./commercial-gate.js";

const step = (tool, input = {}, id = "s1") => ({
  id,
  tool,
  input,
  dependsOn: [],
  parallel: true,
});
const ok = (toolName, data) => ({ toolName, success: true, data });
const fail = (toolName, error = "boom") => ({
  toolName,
  success: false,
  error,
});

describe("commercial-gate (P2) — casos obligatorios", () => {
  describe("A: precio con resultado válido de tool", () => {
    const decision = evaluateCommercialGate({
      userMessage: "¿Cuánto sale el PLA?",
      steps: [step("searchProduct", { query: "pla" })],
      results: [
        ok("searchProduct", {
          results: [
            { id: "p1", name: "PLA", price: 8500, currency: "ARS", stock: 4 },
          ],
        }),
      ],
    });
    it("permite responder (status allow)", () => {
      expect(decision.status).toBe("allow");
      expect(decision.fallback).toBeNull();
    });
    it("inyecta la política comercial con evidencia PRICE", () => {
      expect(decision.commercialPolicy).toContain(
        "POL\u00cdTICA DE DATOS COMERCIALES",
      );
      expect(decision.commercialPolicy).toContain("searchProduct");
      expect(decision.commercialPolicy).toContain(CLAIM_TYPES.PRICE);
    });
  });

  describe("B: mismo query con plan vacío", () => {
    const decision = evaluateCommercialGate({
      userMessage: "¿Cuánto sale el PLA?",
      plan: [],
      steps: [],
      results: [],
    });
    it("bloquea la generación con fallback determinístico", () => {
      expect(decision.status).toBe("block");
      expect(decision.fallback).toBeTruthy();
      expect(decision.commercialPolicy).toBeNull();
    });
    it("el fallback no inventa un precio (sin $ ni montos)", () => {
      expect(decision.fallback).not.toMatch(/\$\s?\d/);
      expect(decision.fallback.toLowerCase()).toContain("precio verificado");
    });
  });

  describe("C: mismo query con tool ejecutada sin resultados", () => {
    it("bloquea cuando searchPrice devuelve []", () => {
      const decision = evaluateCommercialGate({
        userMessage: "¿Cuánto sale el PLA?",
        steps: [step("searchPrice", { query: "pla" })],
        results: [ok("searchPrice", { results: [] })],
      });
      expect(decision.status).toBe("block");
      expect(decision.fallback).toContain("precio");
    });
    it("bloquea cuando la tool falla", () => {
      const decision = evaluateCommercialGate({
        userMessage: "¿Cuánto sale el PLA?",
        steps: [step("searchPrice", { query: "pla" })],
        results: [fail("searchPrice")],
      });
      expect(decision.status).toBe("block");
    });
  });

  describe("P7: INVALID_ARGUMENTS no es evidencia comercial", () => {
    it("bloquea cuando la tool falla por argumentos inválidos", () => {
      const decision = evaluateCommercialGate({
        userMessage: "¿Cuánto sale el PLA?",
        steps: [step("searchPrice", { query: 123 })],
        results: [
          {
            toolName: "searchPrice",
            success: false,
            errorCode: "INVALID_ARGUMENTS",
            error: 'Parameter "query" expected string, got number',
          },
        ],
      });
      expect(decision.status).toBe("block");
    });
    it("extractEvidence no produce claims a partir de INVALID_ARGUMENTS", () => {
      const evidence = extractEvidence({
        results: [
          {
            toolName: "searchProduct",
            success: false,
            errorCode: "INVALID_ARGUMENTS",
            error: "Missing required parameter: query",
          },
        ],
      });
      expect(evidence.claimTypes).toEqual([]);
      expect(evidence.sources).toEqual([]);
    });
  });

  describe("D: disponibilidad/stock", () => {
    it("permite cuando hay stock válido", () => {
      const decision = evaluateCommercialGate({
        userMessage: "¿Tenés PLA negro?",
        steps: [step("searchStock", { query: "pla negro" })],
        results: [
          ok("searchStock", {
            results: [{ id: "p1", product: "PLA", stock: 4, available: true }],
          }),
        ],
      });
      expect(decision.status).toBe("allow");
    });
    it("bloquea cuando no hay stock/evidencia", () => {
      const decision = evaluateCommercialGate({
        userMessage: "¿Tenés PLA negro?",
        plan: [],
        steps: [],
        results: [],
      });
      expect(decision.status).toBe("block");
      expect(decision.fallback.toLowerCase()).toContain("disponibilidad");
    });
    it("bloquea cuando searchStock devuelve []", () => {
      const decision = evaluateCommercialGate({
        userMessage: "¿Tenés PLA negro?",
        steps: [step("searchStock", { query: "pla negro" })],
        results: [ok("searchStock", { results: [] })],
      });
      expect(decision.status).toBe("block");
    });
  });

  describe("E: consulta general sin evidencia comercial dinámica", () => {
    const decision = evaluateCommercialGate({
      userMessage: "¿Qué es el PLA?",
      plan: [],
      steps: [],
      results: [],
    });
    it("responde normalmente (status none)", () => {
      expect(decision.status).toBe("none");
      expect(decision.fallback).toBeNull();
    });
  });

  describe("F: caso mixto con evidencia parcial", () => {
    const decision = evaluateCommercialGate({
      userMessage: "¿Qué es el PLA y cuánto sale?",
      steps: [step("searchProduct", { query: "pla" })],
      results: [
        ok("searchProduct", {
          results: [
            {
              id: "p1",
              name: "PLA",
              brand: "Generic",
              description: "material termopl\u00e1stico",
            },
          ],
        }),
      ],
    });
    it("permite generar (existe evidencia de catálogo) pero restringe el precio", () => {
      expect(decision.status).toBe("allow");
      expect(decision.commercialPolicy).toBeTruthy();
      expect(decision.commercialPolicy).not.toContain(CLAIM_TYPES.PRICE);
      expect(decision.commercialPolicy).toContain(
        CLAIM_TYPES.PRODUCT_EXISTENCE,
      );
    });
  });

  describe("G: estado de reparación", () => {
    it("bloquea sin reparación anclada (sin clientId)", () => {
      const decision = evaluateCommercialGate({
        userMessage: "¿En qué estado está mi reparación?",
        steps: [step("searchRepair", {})],
        results: [
          ok("searchRepair", {
            results: [{ id: "r1", status: "En reparaci\u00f3n" }],
          }),
        ],
      });
      expect(decision.status).toBe("block");
      expect(decision.fallback).toContain("identificador");
    });
    it("permite con clientId anclado y resultado", () => {
      const decision = evaluateCommercialGate({
        userMessage: "¿En qué estado está mi reparación?",
        steps: [step("searchRepair", { clientId: "c1" })],
        results: [
          ok("searchRepair", {
            results: [{ id: "r1", status: "En reparaci\u00f3n" }],
          }),
        ],
      });
      expect(decision.status).toBe("allow");
    });
    it("bloquea con clientId anclado pero sin resultados", () => {
      const decision = evaluateCommercialGate({
        userMessage: "¿En qué estado está mi reparación?",
        steps: [step("searchRepair", { clientId: "c1" })],
        results: [ok("searchRepair", { results: [] })],
      });
      expect(decision.status).toBe("block");
    });
  });
});

describe("commercial-gate (P2) — seguridad (NO EVIDENCE → NO COMMERCIAL CLAIM)", () => {
  it("searchInternet NO es evidencia comercial (consulta de precio con web ok -> block)", () => {
    const decision = evaluateCommercialGate({
      userMessage: "¿Cuánto sale el PLA?",
      steps: [step("searchInternet", { query: "pla precio" })],
      results: [
        ok("searchInternet", {
          results: [{ title: "PLA precio", snippet: "$8500" }],
        }),
      ],
    });
    expect(decision.status).toBe("block");
    expect(decision.fallback).not.toMatch(/\$\s?\d/);
  });

  it("las entities del Conversation Context NO son evidencia comercial", () => {
    // El gate no recibe conversationContext: por construcción no puede usarse como evidencia.
    const decision = evaluateCommercialGate({
      userMessage: "¿Cuánto sale el PLA?",
      plan: [],
      steps: [],
      results: [],
      conversationContext: { entities: { product: "PLA", price: 8500 } },
    });
    expect(decision.status).toBe("block");
  });

  it("tool no planeada (solo searchClient) + query comercial -> block", () => {
    const decision = evaluateCommercialGate({
      userMessage: "¿Cuánto sale el PLA?",
      steps: [step("searchClient", { query: "PLA" })],
      results: [ok("searchClient", { results: [{ name: "PLA SRL" }] })],
    });
    expect(decision.status).toBe("block");
  });

  it("plan mixto: evidencia comercial presente + otra tool falló -> allow", () => {
    const decision = evaluateCommercialGate({
      userMessage: "¿Cuánto sale el PLA?",
      steps: [
        step("searchProduct", { query: "pla" }, "a"),
        step("searchBusinessInfo", { query: "horarios" }, "b"),
      ],
      results: [
        ok("searchProduct", { results: [{ name: "PLA", price: 8500 }] }),
        fail("searchBusinessInfo"),
      ],
    });
    expect(decision.status).toBe("allow");
  });

  it("fallback de bloqueo nunca contiene montos ni afirma datos", () => {
    for (const claims of [
      [CLAIM_TYPES.PRICE],
      [CLAIM_TYPES.STOCK],
      [CLAIM_TYPES.REPAIR_STATUS],
      [CLAIM_TYPES.BUDGET],
    ]) {
      const fb = buildSafeFallback(claims);
      expect(fb).toMatch(/^\S/);
      expect(fb).not.toMatch(/\$\s?\d/);
      expect(fb).not.toMatch(/hay \$\d/);
    }
  });
});

describe("commercial-gate (P2) — helpers", () => {
  it("normaliza acentos", () => {
    expect(normalizeText("¿Cuánto cuesta?")).toBe("cuanto cuesta?");
  });

  it("classifyCommercialIntent detecta price por clasificador", () => {
    const intent = classifyCommercialIntent({
      userMessage: "¿Cuánto cuesta eso?",
    });
    expect(intent.commercial).toBe(true);
    expect(intent.claimTypes).toContain(CLAIM_TYPES.PRICE);
  });

  it("classifyCommercialIntent detecta tools comerciales planeadas", () => {
    const intent = classifyCommercialIntent({
      userMessage: "hola",
      steps: [step("searchStock", { query: "pla" })],
    });
    expect(intent.commercial).toBe(true);
    expect(intent.viaTools).toBe(true);
    expect(intent.claimTypes).toContain(CLAIM_TYPES.STOCK);
  });

  it("extractEvidence diferencia vacío vs resultado", () => {
    const empty = extractEvidence({
      steps: [step("searchProduct", { query: "pla" })],
      results: [ok("searchProduct", { results: [] })],
    });
    expect(empty.claimTypes).toEqual([]);

    const full = extractEvidence({
      steps: [step("searchProduct", { query: "pla" })],
      results: [ok("searchProduct", { results: [{ name: "PLA", price: 1 }] })],
    });
    expect(full.claimTypes).toContain(CLAIM_TYPES.PRODUCT_EXISTENCE);
    expect(full.claimTypes).toContain(CLAIM_TYPES.PRICE);
  });
});

describe("commercial-gate (P6) — separación producto/servicio/stock", () => {
  it("searchPrice (servicio) evidencia PRICE y NO STOCK/PRODUCT", () => {
    const decision = evaluateCommercialGate({
      userMessage: "¿Cuánto sale cambiar la pantalla?",
      steps: [step("searchPrice", { query: "pantalla motorola g32" })],
      results: [
        ok("searchPrice", {
          results: [
            {
              service: "Cambio de pantalla",
              label: "Motorola G32",
              amount: 42000,
              currency: "ARS",
            },
          ],
        }),
      ],
    });
    expect(decision.status).toBe("allow");
    expect(decision.evidence.claimTypes).toContain(CLAIM_TYPES.PRICE);
    expect(decision.evidence.claimTypes).not.toContain(CLAIM_TYPES.STOCK);
    expect(decision.evidence.claimTypes).not.toContain(
      CLAIM_TYPES.PRODUCT_EXISTENCE,
    );
  });

  it("searchPrice usado para un PRODUCTO sin resultados -> block (no inventa)", () => {
    const decision = evaluateCommercialGate({
      userMessage: "¿Cuánto cuesta el PLA?",
      steps: [step("searchPrice", { query: "pla" })],
      results: [ok("searchPrice", { results: [] })],
    });
    expect(decision.status).toBe("block");
    expect(decision.fallback).toContain("precio");
  });

  it("searchProduct usado para un PRODUCTO evidencia PRICE (product-price)", () => {
    const decision = evaluateCommercialGate({
      userMessage: "¿Cuánto cuesta el PLA?",
      steps: [step("searchProduct", { query: "pla" })],
      results: [
        ok("searchProduct", {
          results: [
            { id: "p1", name: "PLA", price: 8500, currency: "ARS", stock: 4 },
          ],
        }),
      ],
    });
    expect(decision.status).toBe("allow");
    expect(decision.evidence.claimTypes).toContain(CLAIM_TYPES.PRICE);
    expect(decision.evidence.claimTypes).toContain(CLAIM_TYPES.STOCK);
    expect(decision.evidence.claimTypes).toContain(CLAIM_TYPES.AVAILABILITY);
  });

  it("searchStock evidencia STOCK/AVAILABILITY y NUNCA PRICE", () => {
    const decision = evaluateCommercialGate({
      userMessage: "¿Cuántos PLA negros quedan?",
      steps: [step("searchStock", { query: "pla negro" })],
      results: [
        ok("searchStock", {
          results: [{ id: "p1", product: "PLA", stock: 4, available: true }],
        }),
      ],
    });
    expect(decision.status).toBe("allow");
    expect(decision.evidence.claimTypes).toContain(CLAIM_TYPES.STOCK);
    expect(decision.evidence.claimTypes).toContain(CLAIM_TYPES.AVAILABILITY);
    expect(decision.evidence.claimTypes).not.toContain(CLAIM_TYPES.PRICE);
  });
});
