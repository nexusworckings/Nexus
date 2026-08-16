import { describe, it, expect } from 'vitest';
import { MessageBuilder } from './message-builder.js';

describe('MessageBuilder', () => {
  const mb = new MessageBuilder({ businessName: 'Tecno San Juan' });

  it('repairReady generates repair ready message', () => {
    const msg = mb.repairReady({ clientName: 'Juan', device: 'notebook', repairId: 'R-001' });
    expect(msg).toContain('Hola Juan');
    expect(msg).toContain('notebook');
    expect(msg).toContain('listo para retirar');
    expect(msg).toContain('R-001');
    expect(msg).toContain('Tecno San Juan');
  });

  it('repairReady without device', () => {
    const msg = mb.repairReady({ clientName: 'Maria' });
    expect(msg).toContain('tu equipo');
    expect(msg).toContain('listo para retirar');
  });

  it('repairReady without repairId', () => {
    const msg = mb.repairReady({ clientName: 'Juan', device: 'iPad' });
    expect(msg).not.toContain('Orden:');
  });

  it('repairInProgress generates in progress message', () => {
    const msg = mb.repairInProgress({ clientName: 'Juan', device: 'celular', repairId: 'R-002', estimatedDays: 5 });
    expect(msg).toContain('reparación');
    expect(msg).toContain('5 días');
    expect(msg).toContain('R-002');
  });

  it('repairInProgress without estimatedDays', () => {
    const msg = mb.repairInProgress({ clientName: 'Ana', device: 'notebook' });
    expect(msg).not.toContain('días');
  });

  it('budgetReady generates budget ready message', () => {
    const msg = mb.budgetReady({ clientName: 'Juan', device: 'celular', budgetId: 'B-001', amount: 15000 });
    expect(msg).toContain('presupuesto');
    expect(msg).toContain('$15.000');
    expect(msg).toContain('B-001');
  });

  it('budgetReady with string amount', () => {
    const msg = mb.budgetReady({ clientName: 'Juan', amount: '15000' });
    expect(msg).toContain('$15000');
  });

  it('budgetReady without amount', () => {
    const msg = mb.budgetReady({ clientName: 'Juan' });
    expect(msg).not.toContain('$');
  });

  it('budgetApproved generates approval message', () => {
    const msg = mb.budgetApproved({ clientName: 'Maria', device: 'iPad', budgetId: 'B-002' });
    expect(msg).toContain('aprobación');
    expect(msg).toContain('iPad');
    expect(msg).toContain('B-002');
  });

  it('printOrderReady generates print ready message', () => {
    const msg = mb.printOrderReady({ clientName: 'Carlos', item: 'soporte', printOrderId: 'P-001' });
    expect(msg).toContain('impresión 3D');
    expect(msg).toContain('soporte');
    expect(msg).toContain('P-001');
  });

  it('printOrderReady without item', () => {
    const msg = mb.printOrderReady({ clientName: 'Carlos' });
    expect(msg).toContain('impresión 3D');
  });

  it('appointmentReminder generates reminder', () => {
    const msg = mb.appointmentReminder({ clientName: 'Ana', date: '15/03/2025', time: '10:30', reason: 'Reparación' });
    expect(msg).toContain('recordamos');
    expect(msg).toContain('15/03/2025');
    expect(msg).toContain('10:30');
    expect(msg).toContain('Reparación');
  });

  it('appointmentReminder without reason', () => {
    const msg = mb.appointmentReminder({ clientName: 'Ana', date: '15/03/2025' });
    expect(msg).toContain('15/03/2025');
  });

  it('paymentReminder generates payment reminder', () => {
    const msg = mb.paymentReminder({ clientName: 'Juan', amount: 25000, device: 'notebook' });
    expect(msg).toContain('saldo pendiente');
    expect(msg).toContain('$25.000');
    expect(msg).toContain('notebook');
  });

  it('paymentReminder without device', () => {
    const msg = mb.paymentReminder({ clientName: 'Juan', amount: 5000 });
    expect(msg).toContain('saldo pendiente');
  });

  it('generalNotification generates notification', () => {
    const msg = mb.generalNotification({ clientName: 'Todos', message: 'Nuevos horarios disponibles' });
    expect(msg).toContain('Nuevos horarios');
  });

  it('replyToClient generates reply', () => {
    const msg = mb.replyToClient({ clientName: 'Juan', reply: 'Te esperamos en el local' });
    expect(msg).toContain('Te esperamos');
    expect(msg).toContain('Saludos');
  });

  it('bulkNotification generates bulk message', () => {
    const msg = mb.bulkNotification({ message: 'Aviso importante para todos los clientes' });
    expect(msg).toContain('Aviso importante');
    expect(msg).toContain('Tecno San Juan');
  });

  it('customMessage with all options', () => {
    const msg = mb.customMessage({ clientName: 'Juan', body: 'Mensaje personalizado', includeGreeting: true, includeClosing: true });
    expect(msg).toContain('Hola Juan');
    expect(msg).toContain('Mensaje personalizado');
    expect(msg).toContain('Tecno San Juan');
  });

  it('customMessage without greeting', () => {
    const msg = mb.customMessage({ body: 'Solo cuerpo', includeGreeting: false, includeClosing: false });
    expect(msg).toBe('Solo cuerpo');
  });

  it('customMessage without clientName skips greeting', () => {
    const msg = mb.customMessage({ body: 'test' });
    expect(msg).not.toContain('Hola');
  });

  it('customMessage includes greeting only when clientName provided', () => {
    const msg = mb.customMessage({ clientName: 'Juan', body: 'test', includeClosing: false });
    expect(msg).toContain('Hola Juan');
  });

  it('customMessage without clientName omits greeting', () => {
    const msg = mb.customMessage({ body: 'test', includeClosing: false });
    expect(msg).not.toContain('Hola');
  });

  it('signature is included in closing', () => {
    const msg = mb.repairReady({ clientName: 'Juan', device: 'notebook' });
    expect(msg).toContain('Muchas gracias');
  });

  it('custom business name in signature', () => {
    const mb2 = new MessageBuilder({ businessName: 'Mi Tienda' });
    const msg = mb2.repairReady({ clientName: 'Juan', device: 'tv' });
    expect(msg).toContain('Mi Tienda');
  });

  it('builds multi-paragraph messages', () => {
    const msg = mb.repairReady({ clientName: 'Juan', device: 'notebook', repairId: 'R-001' });
    const parts = msg.split('\n\n');
    expect(parts.length).toBeGreaterThanOrEqual(4);
  });

  it('handles amount with locale formatting', () => {
    const msg = mb.budgetReady({ clientName: 'Juan', amount: 1000000 });
    expect(msg).toContain('$1.000.000');
  });

  it('all templates return non-empty strings', () => {
    expect(mb.repairReady({ clientName: 'A' }).length).toBeGreaterThan(10);
    expect(mb.repairInProgress({ clientName: 'A' }).length).toBeGreaterThan(10);
    expect(mb.budgetReady({ clientName: 'A' }).length).toBeGreaterThan(10);
    expect(mb.budgetApproved({ clientName: 'A' }).length).toBeGreaterThan(10);
    expect(mb.printOrderReady({ clientName: 'A' }).length).toBeGreaterThan(10);
    expect(mb.appointmentReminder({ clientName: 'A' }).length).toBeGreaterThan(10);
    expect(mb.paymentReminder({ clientName: 'A' }).length).toBeGreaterThan(10);
    expect(mb.generalNotification({ clientName: 'A', message: 'test' }).length).toBeGreaterThan(10);
    expect(mb.replyToClient({ clientName: 'A', reply: 'test' }).length).toBeGreaterThan(10);
    expect(mb.bulkNotification({ message: 'test' }).length).toBeGreaterThan(10);
    expect(mb.customMessage({ body: 'test' }).length).toBeGreaterThan(0);
  });
});
