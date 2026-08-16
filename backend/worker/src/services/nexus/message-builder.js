export class MessageBuilder {
  constructor(options = {}) {
    this.#businessName = options.businessName || 'Tecno San Juan';
    this.#signature = options.signature || `${options.businessName || 'Tecno San Juan'}\nMuchas gracias.`;
  }

  #businessName;
  #signature;

  repairReady(data) {
    const { clientName, device, repairId } = data;
    return this.#build([
      this.#greeting(clientName),
      `Te avisamos que ${device ? 'tu ' + device : 'tu equipo'} ya está listo para retirar.`,
      this.#repairRef(repairId),
      'Cuando puedas, comunicate con nosotros para coordinar el retiro.',
      this.#closing(),
    ]);
  }

  repairInProgress(data) {
    const { clientName, device, repairId, estimatedDays } = data;
    return this.#build([
      this.#greeting(clientName),
      `Te informamos que ${device ? 'tu ' + device : 'tu equipo'} se encuentra en reparación.`,
      estimatedDays ? `El tiempo estimado es de ${estimatedDays} días hábiles.` : null,
      this.#repairRef(repairId),
      'Te mantendremos al tanto de cualquier novedad.',
      this.#closing(),
    ]);
  }

  budgetReady(data) {
    const { clientName, device, budgetId, amount } = data;
    return this.#build([
      this.#greeting(clientName),
      `Ya tenemos listo el presupuesto para ${device ? 'la reparación de ' + device : 'tu equipo'}.`,
      amount ? `El presupuesto es de $${typeof amount === 'number' ? amount.toLocaleString('es-AR') : amount}.` : null,
      this.#budgetRef(budgetId),
      'Cuando quieras, acercate por el local o respondenos para confirmar.',
      this.#closing(),
    ]);
  }

  budgetApproved(data) {
    const { clientName, device, budgetId } = data;
    return this.#build([
      this.#greeting(clientName),
      `Confirmamos la aprobación de tu presupuesto para ${device || 'tu equipo'}.`,
      this.#budgetRef(budgetId),
      'En breve comenzaremos con los trabajos. Te avisaremos cuando esté listo.',
      this.#closing(),
    ]);
  }

  printOrderReady(data) {
    const { clientName, item, printOrderId } = data;
    return this.#build([
      this.#greeting(clientName),
      `Te avisamos que tu pedido de impresión 3D${item ? ' (' + item + ')' : ''} ya está listo para retirar.`,
      this.#printRef(printOrderId),
      'Pasá por el local cuando puedas.',
      this.#closing(),
    ]);
  }

  appointmentReminder(data) {
    const { clientName, date, time, reason } = data;
    return this.#build([
      this.#greeting(clientName),
      'Te recordamos tu turno:',
      `${reason ? reason + ' - ' : ''}${date ? 'Fecha: ' + date : ''}${time ? ' ' + time : ''}`,
      'Te esperamos.',
      this.#closing(),
    ]);
  }

  paymentReminder(data) {
    const { clientName, amount, device } = data;
    return this.#build([
      this.#greeting(clientName),
      `Te recordamos que ${device ? 'la reparación de ' + device : 'tu trabajo'} tiene un saldo pendiente de $${typeof amount === 'number' ? amount.toLocaleString('es-AR') : amount}.`,
      'Podés acercarte al local para abonar o consultarnos por medios de pago.',
      this.#closing(),
    ]);
  }

  generalNotification(data) {
    const { clientName, message } = data;
    return this.#build([
      this.#greeting(clientName),
      message,
      this.#closing(),
    ]);
  }

  replyToClient(data) {
    const { clientName, reply } = data;
    return this.#build([
      this.#greeting(clientName),
      reply,
      this.#salutation(),
    ]);
  }

  bulkNotification(data) {
    const { message } = data;
    return this.#build([
      message,
      this.#closing(),
    ]);
  }

  customMessage(data) {
    const { clientName, body, includeGreeting, includeClosing } = data;
    const parts = [];
    if (includeGreeting !== false && clientName) parts.push(this.#greeting(clientName));
    parts.push(body);
    if (includeClosing !== false) parts.push(this.#closing());
    return this.#build(parts);
  }

  #greeting(name) {
    return name ? `Hola ${name}.` : 'Hola.';
  }

  #salutation() {
    return 'Saludos.';
  }

  #closing() {
    return this.#signature;
  }

  #repairRef(id) {
    return id ? `Orden: ${id}` : null;
  }

  #budgetRef(id) {
    return id ? `Presupuesto: ${id}` : null;
  }

  #printRef(id) {
    return id ? `Pedido: ${id}` : null;
  }

  #build(parts) {
    return parts.filter(Boolean).join('\n\n');
  }
}
