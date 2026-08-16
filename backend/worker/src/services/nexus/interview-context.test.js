import { describe, it, expect } from "vitest";
import { mapInterviewEntitiesToContext } from "./interview-context.js";

function fields(values) {
  const out = {};
  for (const [id, value] of Object.entries(values)) {
    out[id] = { value, source: "user", timestamp: "2026-01-01T00:00:00.000Z" };
  }
  return out;
}

describe("mapInterviewEntitiesToContext", () => {
  it("returns an empty object for unknown schema", () => {
    expect(
      mapInterviewEntitiesToContext({
        schemaId: "unknown",
        completedFields: fields({ clientName: "Ana" }),
      }),
    ).toEqual({});
  });

  it("returns an empty object when there are no completed fields", () => {
    expect(
      mapInterviewEntitiesToContext({ schemaId: "repair-request" }),
    ).toEqual({});
  });

  it("maps a completed repair-request into P8 entities", () => {
    const entities = mapInterviewEntitiesToContext({
      schemaId: "repair-request",
      completedFields: fields({
        clientName: "Juan",
        device: "Motorola G32",
        problem: "no enciende",
        urgency: "urgent",
      }),
    });
    expect(entities).toEqual({
      device: "Motorola G32",
      problem: "no enciende",
      clientName: "Juan",
      urgency: "urgente",
      service: "Reparación",
    });
  });

  it("maps urgency 'normal' verbatim", () => {
    const entities = mapInterviewEntitiesToContext({
      schemaId: "repair-request",
      completedFields: fields({ device: "Samsung", urgency: "normal" }),
    });
    expect(entities.urgency).toBe("normal");
  });

  it("maps a completed budget-request into P8 entities", () => {
    const entities = mapInterviewEntitiesToContext({
      schemaId: "budget-request",
      completedFields: fields({
        clientName: "Ana",
        serviceType: "reparacion",
      }),
    });
    expect(entities).toEqual({
      clientName: "Ana",
      service: "Reparación",
    });
  });

  it("maps budget-request service types to their labels", () => {
    expect(
      mapInterviewEntitiesToContext({
        schemaId: "budget-request",
        completedFields: fields({ serviceType: "accesorio" }),
      }).service,
    ).toBe("Compra de accesorio");
    expect(
      mapInterviewEntitiesToContext({
        schemaId: "budget-request",
        completedFields: fields({ serviceType: "impresion_3d" }),
      }).service,
    ).toBe("Impresión 3D");
    expect(
      mapInterviewEntitiesToContext({
        schemaId: "budget-request",
        completedFields: fields({ serviceType: "otro" }),
      }).service,
    ).toBeUndefined();
  });

  it("maps a completed print-order into P8 entities", () => {
    const entities = mapInterviewEntitiesToContext({
      schemaId: "print-order",
      completedFields: fields({
        clientName: "Ana",
        objectDescription: "30 llaveros",
        material: "PLA",
        colors: ["negro"],
        quantity: 30,
      }),
    });
    expect(entities).toEqual({
      clientName: "Ana",
      product: "30 llaveros",
      material: "PLA",
      color: "negro",
      quantity: 30,
    });
  });

  it("uses the first color when multiple are selected", () => {
    const entities = mapInterviewEntitiesToContext({
      schemaId: "print-order",
      completedFields: fields({
        objectDescription: "taza",
        colors: ["rojo", "azul"],
        quantity: 2,
      }),
    });
    expect(entities.color).toBe("rojo");
    expect(entities.quantity).toBe(2);
  });

  it("coerces a string quantity to a number", () => {
    const entities = mapInterviewEntitiesToContext({
      schemaId: "print-order",
      completedFields: fields({
        objectDescription: "figura",
        material: "ABS",
        quantity: "5",
      }),
    });
    expect(entities.quantity).toBe(5);
  });

  it("maps a completed impresion_3d schema", () => {
    const entities = mapInterviewEntitiesToContext({
      schemaId: "impresion_3d",
      completedFields: fields({
        nombre: "Pedro",
        material: "PLA",
        color: "negro",
        cantidad: 12,
      }),
    });
    expect(entities).toEqual({
      clientName: "Pedro",
      material: "PLA",
      color: "negro",
      quantity: 12,
    });
  });

  it("tolerates a plain completedFields object (no entry wrappers)", () => {
    const entities = mapInterviewEntitiesToContext({
      schemaId: "repair-request",
      completedFields: {
        device: { value: "Motorola G32" },
        problem: { value: "no enciende" },
      },
    });
    expect(entities.device).toBe("Motorola G32");
    expect(entities.problem).toBe("no enciende");
  });
});
